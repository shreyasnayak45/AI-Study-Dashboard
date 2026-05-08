// SERVER-ONLY — imports next/headers via lib/supabase/server.
// Do NOT import this file from any "use client" component.
//
// Two-layer caching strategy:
//   1. unstable_cache  — persists results across requests, per user, for 60 s.
//      Tag: "analytics-stats" — invalidated by tracker/task write actions.
//   2. React.cache     — deduplicates within a single server render pass
//      (e.g., layout + page both call this; only one DB trip happens).

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildDailyData, buildWeeklyData, buildSubjectData,
  computeCurrentStreak, computeLongestStreak,
} from "@/lib/analytics-utils";
import type { AnalyticsStats, ProfileStats } from "@/types";

type RawSession = { subject: string; duration_minutes: number; studied_at: string };
type RawTask    = { completed: boolean };

// ─── Layer 1: persisted cross-request cache keyed by userId ───────────────────

const _fetchAnalyticsData = unstable_cache(
  async (userId: string): Promise<AnalyticsStats> => {
    const sb = await createClient();
    const [{ data: rawSessions }, { data: rawTasks }] = await Promise.all([
      sb.from("study_sessions")
        .select("subject, duration_minutes, studied_at")
        .eq("user_id", userId)
        .order("studied_at", { ascending: true }),
      sb.from("tasks")
        .select("completed")
        .eq("user_id", userId),
    ]);

    const sessions = (rawSessions ?? []) as RawSession[];
    const tasks    = (rawTasks    ?? []) as RawTask[];

    const tasksTotal     = tasks.length;
    const tasksCompleted = tasks.filter((t) => t.completed).length;
    const taskCompletionRate = tasksTotal > 0
      ? Math.round((tasksCompleted / tasksTotal) * 100)
      : 0;

    if (sessions.length === 0) {
      return { ...emptyStats(), tasksTotal, tasksCompleted, taskCompletionRate };
    }

    const totalMinutes = sessions.reduce((s, x) => s + x.duration_minutes, 0);
    const daily        = buildDailyData(sessions, 30);
    const weekly       = buildWeeklyData(sessions, 12);
    const subjects     = buildSubjectData(sessions);

    const studyDates    = sessions.map((x) => x.studied_at.split("T")[0]);
    const streak        = computeCurrentStreak(studyDates);
    const longestStreak = computeLongestStreak(studyDates);

    const dayMap = new Map<string, number>();
    for (const s of sessions) {
      const d = s.studied_at.split("T")[0];
      dayMap.set(d, (dayMap.get(d) ?? 0) + s.duration_minutes);
    }
    let bestDayMinutes = 0;
    let bestDayDate: string | null = null;
    for (const [date, mins] of dayMap.entries()) {
      if (mins > bestDayMinutes) { bestDayMinutes = mins; bestDayDate = date; }
    }

    const activeDays      = dayMap.size;
    const avgDailyMinutes = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;

    return {
      totalMinutes, totalSessions: sessions.length, avgDailyMinutes,
      streak, longestStreak, bestDayMinutes, bestDayDate, activeDays,
      daily, weekly, subjects,
      taskCompletionRate, tasksCompleted, tasksTotal,
    };
  },
  ["analytics-stats"],
  { revalidate: 60, tags: ["analytics-stats"] }
);

// ─── Layer 2: React.cache for same-render deduplication ───────────────────────

export const getAnalyticsStats = cache(async (): Promise<AnalyticsStats> => {
  const user = await getCurrentUser();
  if (!user) return emptyStats();
  return _fetchAnalyticsData(user.id);
});

/**
 * Lightweight stats for the profile page — fetches only the 4 aggregated
 * numbers it needs instead of building 30-day + 12-week chart arrays.
 */
export const getProfileStats = cache(async (): Promise<ProfileStats> => {
  const user = await getCurrentUser();
  if (!user) return { totalSessions: 0, totalMinutes: 0, streak: 0, taskCompletionRate: 0, tasksTotal: 0 };

  const sb = await createClient();
  const [{ data: rawSessions }, { data: rawTasks }] = await Promise.all([
    sb.from("study_sessions")
      .select("duration_minutes, studied_at")
      .eq("user_id", user.id),
    sb.from("tasks")
      .select("completed")
      .eq("user_id", user.id),
  ]);

  type SlimSession = { duration_minutes: number; studied_at: string };
  const sessions = (rawSessions ?? []) as SlimSession[];
  const tasks    = (rawTasks    ?? []) as RawTask[];

  const totalMinutes   = sessions.reduce((s, x) => s + x.duration_minutes, 0);
  const studyDates     = sessions.map((x) => x.studied_at.split("T")[0]);
  const streak         = computeCurrentStreak(studyDates);
  const tasksTotal     = tasks.length;
  const tasksCompleted = tasks.filter((t) => t.completed).length;
  const taskCompletionRate = tasksTotal > 0
    ? Math.round((tasksCompleted / tasksTotal) * 100)
    : 0;

  return { totalSessions: sessions.length, totalMinutes, streak, taskCompletionRate, tasksTotal };
});

// ─── Private ─────────────────────────────────────────────────────────────────

function emptyStats(): AnalyticsStats {
  return {
    totalMinutes: 0, totalSessions: 0, avgDailyMinutes: 0,
    streak: 0, longestStreak: 0, bestDayMinutes: 0, bestDayDate: null,
    activeDays: 0,
    daily: buildDailyData([], 30),
    weekly: buildWeeklyData([], 12),
    subjects: [],
    taskCompletionRate: 0, tasksCompleted: 0, tasksTotal: 0,
  };
}
