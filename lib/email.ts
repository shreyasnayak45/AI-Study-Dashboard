// SERVER-ONLY — never import from "use client" components.

import { Resend } from "resend";
import { buildWeeklyReportHtml } from "@/lib/emails/weekly-report";
import type { WeeklyReport } from "@/lib/weekly-report/types";
import type { ActionResult } from "@/types";

// Lazily instantiated so the module is safe to import server-side even if
// RESEND_API_KEY isn't set (isEmailEnabled() will return false first).
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// ─── Weekly report email ──────────────────────────────────────────────────────

/**
 * Sends a rendered weekly study report to the user's own registered email.
 * The WeeklyReport object (including userEmail) must be fully generated before calling this.
 */
export async function sendWeeklyReportEmail(report: WeeklyReport): Promise<ActionResult> {
  if (!isEmailEnabled()) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const { weekStart, weekEnd } = report.stats;
  const subject = `StudyFlow Weekly Report — ${formatSubjectDate(weekStart)} to ${formatSubjectDate(weekEnd)}`;

  try {
    const { error } = await getResend().emails.send({
      from:    "StudyFlow <onboarding@resend.dev>",
      to:      report.userEmail,
      subject,
      html:    buildWeeklyReportHtml(report),
    });

    if (error) {
      console.error("[email] sendWeeklyReportEmail — Resend error:", error);
      return { success: false, error: (error as { message?: string }).message ?? "Resend error" };
    }

    console.log(`[email] Weekly report sent to ${report.userEmail} — week ${weekStart}`);
    return { success: true };
  } catch (err) {
    console.error("[email] sendWeeklyReportEmail threw:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error sending email",
    };
  }
}

function formatSubjectDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
