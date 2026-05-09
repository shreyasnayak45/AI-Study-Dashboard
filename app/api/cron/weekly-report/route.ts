/**
 * Automated weekly study report — Vercel Cron handler
 *
 * Schedule: every Sunday at 13:30 UTC (= 7:00 PM Asia/Kolkata)
 * Configured in vercel.json → crons[].
 *
 * Security: Vercel passes the CRON_SECRET as a Bearer token in the
 * Authorization header for every scheduled invocation. The route
 * rejects all other callers with 401. Set CRON_SECRET in the Vercel
 * dashboard (Project Settings → Environment Variables).
 *
 * Pipeline per eligible user:
 *   1. Pre-filter: only users with ≥1 session in the last 7 days
 *   2. Skip admin/blocked emails (REPORT_BLOCKED_EMAILS env var, comma-separated)
 *   3. Check weekly_report_sends — skip if already sent this ISO week
 *   4. generateWeeklyReportForUser() — fetch sessions → Gemini narrative
 *   5. sendWeeklyReportEmail()       — Resend delivery to user's own email
 *   6. Upsert result in weekly_report_sends (sent | failed), retry-safe
 *   7. Stamp profiles.last_report_sent_at on success
 *
 * Users are processed sequentially to stay well within Gemini + Resend
 * rate limits. A single user failure is logged and skipped; the cron
 * continues for all others.
 *
 * Retry safety: uses UPSERT (ON CONFLICT DO UPDATE) so re-running the
 * cron after a partial failure never throws a unique-constraint error.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateWeeklyReportForUser } from "@/lib/weekly-report/generator";
import { sendWeeklyReportEmail } from "@/lib/email";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Emails that must never receive an automated report.
 * Add REPORT_BLOCKED_EMAILS=a@b.com,c@d.com to your env to extend the list.
 */
const BASE_BLOCKED_EMAILS = new Set([
  "studyflowapp.official@gmail.com",
]);

function getBlockedEmails(): Set<string> {
  const extra = process.env.REPORT_BLOCKED_EMAILS ?? "";
  const blocked = new Set(BASE_BLOCKED_EMAILS);
  for (const e of extra.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    blocked.add(e);
  }
  return blocked;
}

// ─── ISO week helper ──────────────────────────────────────────────────────────

/**
 * Returns the ISO week ID string for the week that contains `date`.
 * Format: "YYYY-Www" (e.g. "2026-W19").
 * ISO weeks start on Monday and are numbered 1–53.
 */
function isoWeekId(date: Date = new Date()): string {
  // Find the Thursday of the current week (ISO weeks are identified by Thursday).
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + (4 - (date.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── Authorization ────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Development: allow localhost callers when CRON_SECRET is not configured.
    const host = req.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.");
  }
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${cronSecret}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id:    string;
  email: string;
}

interface ReportSendRecord {
  user_id:        string;
  report_week_id: string;
  status:         "sent" | "failed";
  sent_at:        string;
  error_message:  string | null;
}

// supabase-js without generated types types all table mutations as `never[]`.
// Cast through `any` to allow our explicit typed records.
type UntypedSb = ReturnType<typeof getAdminClient>;
async function upsertSendRecord(sb: UntypedSb, record: ReportSendRecord) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sb as any)
    .from("weekly_report_sends")
    .upsert(record, { onConflict: "user_id,report_week_id" });
}

async function updateProfileLastReportSentAt(sb: UntypedSb, userId: string, sentAt: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sb as any)
    .from("profiles")
    .update({ last_report_sent_at: sentAt })
    .eq("user_id", userId);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cronStart = Date.now();

  if (!isAuthorized(req)) {
    console.warn("[cron/weekly-report] ✗ unauthorized — missing or invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekId = isoWeekId();
  console.log(`[cron/weekly-report] ▶ starting — week ${weekId}`);

  const sb = getAdminClient();
  const blockedEmails = getBlockedEmails();

  // ── 1. Active-user pre-filter ──────────────────────────────────────────────
  // Only consider users who studied in the last 7 days. This avoids calling
  // Gemini for the full user base when only a subset is eligible.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const since = sevenDaysAgo.toISOString();

  const { data: activeSessions, error: sessionsError } = await sb
    .from("study_sessions")
    .select("user_id")
    .gte("studied_at", since);

  if (sessionsError) {
    console.error("[cron/weekly-report] ✗ failed to fetch active sessions:", sessionsError);
    return NextResponse.json({ error: "Failed to query active sessions" }, { status: 500 });
  }

  const activeUserIds = new Set(
    (activeSessions ?? []).map((s: { user_id: string }) => s.user_id),
  );
  console.log(`[cron/weekly-report] ${activeUserIds.size} users have sessions in the last 7 days`);

  if (activeUserIds.size === 0) {
    console.log("[cron/weekly-report] ■ no active users this week — done");
    return NextResponse.json({ week: weekId, sent: 0, skipped: 0, failed: 0 });
  }

  // ── 2. Fetch auth users, filter to active + valid email + not blocked ──────
  const { data: usersData, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError || !usersData) {
    console.error("[cron/weekly-report] ✗ failed to list auth users:", usersError);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }

  const eligibleUsers: UserRow[] = usersData.users
    .filter((u) => {
      const email = (u.email ?? "").toLowerCase().trim();
      if (!email) return false;                        // no email
      if (!activeUserIds.has(u.id)) return false;      // no sessions this week
      if (blockedEmails.has(email)) {                  // blocked (admin/app inboxes)
        console.log(`[cron/weekly-report] ⊘ blocked email skipped: ${email}`);
        return false;
      }
      return true;
    })
    .map((u) => ({ id: u.id, email: u.email! }));

  console.log(`[cron/weekly-report] ${eligibleUsers.length} eligible users after filtering`);

  // ── 3. Deduplication — skip users already sent this week ──────────────────
  const { data: alreadySent } = await sb
    .from("weekly_report_sends")
    .select("user_id")
    .eq("report_week_id", weekId)
    .eq("status", "sent");

  const alreadySentIds = new Set(
    (alreadySent ?? []).map((r: { user_id: string }) => r.user_id),
  );

  const pendingUsers = eligibleUsers.filter((u) => !alreadySentIds.has(u.id));
  console.log(
    `[cron/weekly-report] ${pendingUsers.length} pending ` +
    `(${alreadySentIds.size} already sent this week)`,
  );

  // ── 4. Process each user sequentially ────────────────────────────────────
  const results = { sent: 0, skipped: 0, failed: 0 };

  for (const user of pendingUsers) {
    const userStart = Date.now();
    try {
      // Generate report — returns null if no sessions or Gemini fails
      const report = await generateWeeklyReportForUser(user.id, user.email);

      if (!report) {
        results.skipped++;
        console.log(`[cron/weekly-report] ⊘ skipped ${user.email} — no data or generation failed`);
        continue;
      }

      // Send email to user's own registered email address
      const sendResult = await sendWeeklyReportEmail(report);
      const elapsed    = Date.now() - userStart;

      // Upsert — safe even if a previous `failed` record exists for this week.
      // ON CONFLICT updates the existing row rather than throwing a unique error.
      await upsertSendRecord(sb, {
        user_id:        user.id,
        report_week_id: weekId,
        status:         sendResult.success ? "sent" : "failed",
        sent_at:        new Date().toISOString(),
        error_message:  sendResult.success ? null : (sendResult.error ?? "unknown error"),
      });

      if (sendResult.success) {
        results.sent++;
        console.log(
          `[cron/weekly-report] ✓ sent to ${user.email} ` +
          `(${Math.round(elapsed / 1000)}s) — "${report.ai.headline}"`,
        );

        // Stamp the profile with the latest successful send timestamp
        await updateProfileLastReportSentAt(sb, user.id, new Date().toISOString());

      } else {
        results.failed++;
        console.error(
          `[cron/weekly-report] ✗ send failed for ${user.email} ` +
          `(${Math.round(elapsed / 1000)}s): ${sendResult.error}`,
        );
      }
    } catch (err) {
      results.failed++;
      const elapsed = Date.now() - userStart;
      console.error(
        `[cron/weekly-report] ✗ unexpected error for ${user.email} ` +
        `(${Math.round(elapsed / 1000)}s):`,
        err,
      );

      // Best-effort failure record — upsert so retries don't throw
      await upsertSendRecord(sb, {
        user_id:        user.id,
        report_week_id: weekId,
        status:         "failed",
        sent_at:        new Date().toISOString(),
        error_message:  err instanceof Error ? err.message : String(err),
      }).catch(() => {/* ignore — best effort */});
    }
  }

  const totalMs = Date.now() - cronStart;
  console.log(
    `[cron/weekly-report] ■ done in ${Math.round(totalMs / 1000)}s — ` +
    `${results.sent} sent, ${results.skipped} skipped (no data), ${results.failed} failed`,
  );

  return NextResponse.json({
    week:    weekId,
    sent:    results.sent,
    skipped: results.skipped,
    failed:  results.failed,
    elapsed: `${Math.round(totalMs / 1000)}s`,
  });
}
