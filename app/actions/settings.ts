"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ExportResult, ProfileFormData, SettingsFormData } from "@/types";

export async function updateProfile(data: ProfileFormData): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { success: false, error: "Not authenticated" };

  const { error } = await sb.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: data.display_name.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { success: false, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}

export async function updateUserSettings(data: SettingsFormData): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { success: false, error: "Not authenticated" };

  const { error } = await sb.from("user_settings").upsert(
    {
      user_id: user.id,
      daily_goal_minutes: Math.max(15, Math.min(480, data.daily_goal_minutes)),
      preferred_session_minutes: data.preferred_session_minutes,
      notifications_enabled: data.notifications_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { success: false, error: error.message };
  revalidatePath("/settings");
  return { success: true };
}

export async function changePassword(newPassword: string): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function clearAllSessions(): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { success: false, error: "Not authenticated" };

  const { error } = await sb
    .from("study_sessions")
    .delete()
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/tracker");
  revalidatePath("/analytics");
  revalidatePath("/settings");
  return { success: true };
}

export async function exportStudyData(): Promise<ExportResult> {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { success: false, error: "Not authenticated" };

  const { data, error } = await sb
    .from("study_sessions")
    .select("subject, duration_minutes, notes, studied_at")
    .eq("user_id", user.id)
    .order("studied_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  type Row = { subject: string; duration_minutes: number; notes: string | null; studied_at: string };
  const rows = (data as Row[] ?? []);

  const header = "Date,Subject,Duration (min),Notes\n";
  const body   = rows
    .map((r) => {
      const date  = r.studied_at.split("T")[0];
      const notes = (r.notes ?? "").replace(/,/g, ";").replace(/\n/g, " ");
      return `${date},${r.subject},${r.duration_minutes},${notes}`;
    })
    .join("\n");

  return { success: true, csv: header + body };
}

export async function deleteAccount(): Promise<ActionResult> {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { success: false, error: "Not authenticated" };

  // Delete all user data (FK cascades handle most of it once user_settings/profiles are cleared)
  await Promise.all([
    sb.from("study_sessions").delete().eq("user_id", user.id),
    sb.from("tasks").delete().eq("user_id", user.id),
    sb.from("profiles").delete().eq("user_id", user.id),
    sb.from("user_settings").delete().eq("user_id", user.id),
  ]);

  // Sign out globally (invalidates all refresh tokens)
  await sb.auth.signOut({ scope: "global" });

  return { success: true };
}
