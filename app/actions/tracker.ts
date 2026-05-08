"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SessionFormData, ActionResult } from "@/types";

/** Convert a YYYY-MM-DD date string to a full ISO timestamp at noon local time.
 *  Using noon avoids timezone-edge issues where midnight flips to the previous day. */
function toISOTimestamp(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

export async function createSession(data: SessionFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase.from("study_sessions").insert({
    user_id: user.id,
    subject: data.subject.trim(),
    duration_minutes: data.duration_minutes,
    notes: data.notes.trim() || null,
    studied_at: toISOTimestamp(data.studied_at),
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/tracker");
  revalidatePath("/");
  revalidateTag("analytics-stats", {});
  return { success: true };
}

export async function updateSession(
  id: string,
  data: SessionFormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("study_sessions")
    .update({
      subject: data.subject.trim(),
      duration_minutes: data.duration_minutes,
      notes: data.notes.trim() || null,
      studied_at: toISOTimestamp(data.studied_at),
    })
    .eq("id", id)
    .eq("user_id", user.id); // belt-and-suspenders alongside RLS

  if (error) return { success: false, error: error.message };

  revalidatePath("/tracker");
  revalidatePath("/");
  revalidateTag("analytics-stats", {});
  return { success: true };
}

export async function saveLiveSession(data: {
  subject:          string;
  duration_minutes: number;
  started_at:       number; // Unix ms — used as the actual studied_at timestamp
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase.from("study_sessions").insert({
    user_id:          user.id,
    subject:          data.subject.trim(),
    duration_minutes: data.duration_minutes,
    notes:            null,
    studied_at:       new Date(data.started_at).toISOString(),
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/tracker");
  revalidatePath("/");
  revalidateTag("analytics-stats", {});
  return { success: true };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/tracker");
  revalidatePath("/");
  revalidateTag("analytics-stats", {});
  return { success: true };
}
