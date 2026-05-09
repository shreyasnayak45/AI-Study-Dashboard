"use server";

import { getCurrentUser } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";
import type { ActionResult } from "@/types";

/**
 * Server action: send the infrastructure test email.
 *
 * Authentication required — the current user's email is included in the email
 * payload so it's clear who triggered the test.
 *
 * Remove this action (and EmailTestSection) once weekly reports are built.
 */
export async function triggerTestEmail(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  return sendTestEmail(user.email ?? "unknown");
}
