// SERVER-ONLY — never import from "use client" components.

import { Resend } from "resend";
import { buildTestEmailHtml } from "@/lib/emails/test-email";
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

// ─── Test email ───────────────────────────────────────────────────────────────

/**
 * Sends a one-off infrastructure test email to studyflowapp.official@gmail.com.
 *
 * Uses Resend's shared `onboarding@resend.dev` sender — no custom domain
 * verification required for development.  Swap the `from` field once a custom
 * domain is configured.
 */
export async function sendTestEmail(triggeredBy: string): Promise<ActionResult> {
  if (!isEmailEnabled()) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const { error } = await getResend().emails.send({
      from:    "StudyFlow <onboarding@resend.dev>",
      to:      "studyflowapp.official@gmail.com",
      subject: "StudyFlow Email System Test",
      html:    buildTestEmailHtml({
        triggeredBy,
        timestamp: new Date().toISOString(),
      }),
    });

    if (error) {
      console.error("[email] Resend returned error:", error);
      return { success: false, error: (error as { message?: string }).message ?? "Resend error" };
    }

    console.log("[email] Test email sent successfully. Triggered by:", triggeredBy);
    return { success: true };
  } catch (err) {
    console.error("[email] sendTestEmail threw:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error sending email",
    };
  }
}
