// SERVER-ONLY — reads Supabase and calls Gemini.

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { RawSessionForIntelligence } from "@/types";
import { computeWeeklyStats } from "./analytics";
import { generateWeeklyInsight } from "./gemini";
import type { WeeklyReport } from "./types";

// ─── Shared core ─────────────────────────────────────────────────────────────

async function buildReport(
  sb: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof getAdminClient>,
  userId: string,
  userEmail: string,
): Promise<WeeklyReport | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("study_sessions")
    .select("duration_minutes, studied_at, session_start_time, subject")
    .eq("user_id", userId)
    .order("studied_at", { ascending: true });

  if (error) {
    console.error(`[weekly-report/generator] Supabase fetch failed for ${userEmail}:`, error);
    return null;
  }

  const allSessions = (data ?? []) as RawSessionForIntelligence[];
  const stats = computeWeeklyStats(allSessions);

  if (stats.totalMinutes === 0) {
    console.warn(`[weekly-report/generator] no sessions in the last 7 days for ${userEmail}`);
    return null;
  }

  console.log(
    `[weekly-report/generator] computing report for ${userEmail} — ` +
    `${stats.totalMinutes}m over ${stats.activeDays} days this week`,
  );

  const ai = await generateWeeklyInsight(stats);
  if (!ai) {
    console.error(`[weekly-report/generator] Gemini returned null for ${userEmail} — aborting`);
    return null;
  }

  return { stats, ai, userEmail, generatedAt: new Date().toISOString() };
}

// ─── Manual trigger (authenticated user context) ──────────────────────────────

/**
 * Fetches the current user's full session history, computes weekly stats,
 * calls Gemini for narrative insights, and returns a WeeklyReport ready to
 * pass to the email template.
 *
 * Returns null when:
 *   - The user is not authenticated
 *   - The user has no study sessions in the last 7 days (nothing to report)
 *   - Gemini fails (logged server-side)
 */
export async function generateWeeklyReport(): Promise<WeeklyReport | null> {
  const user = await getCurrentUser();
  if (!user) {
    console.error("[weekly-report/generator] not authenticated");
    return null;
  }

  const sb = await createClient();
  return buildReport(sb, user.id, user.email ?? "unknown");
}

// ─── Cron context (service-role, specific user) ───────────────────────────────

/**
 * Generates a weekly report for a specific user by ID.
 * Uses the admin (service-role) Supabase client — RLS is bypassed.
 * Intended exclusively for the automated Sunday cron job.
 *
 * Returns null when:
 *   - The user has no study sessions in the last 7 days
 *   - Gemini fails (logged server-side)
 */
export async function generateWeeklyReportForUser(
  userId: string,
  userEmail: string,
): Promise<WeeklyReport | null> {
  const sb = getAdminClient();
  return buildReport(sb, userId, userEmail);
}
