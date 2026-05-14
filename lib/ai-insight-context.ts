// SERVER-ONLY. Builds the AI input payload from user-scoped Supabase data.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDailyData,
  computeCurrentStreak,
} from "@/lib/analytics-utils";
import { isDueToday, isOverdue } from "@/lib/task-utils";
import type { InsightContext } from "@/lib/ai-insights";
import type { RawSessionForIntelligence, StudySession, Task } from "@/types";

type StudySessionRow = StudySession;
type TaskRow = Task;

export async function buildInsightContextForUser(
  sb: SupabaseClient,
  userId: string,
): Promise<InsightContext> {
  const [{ data: sessionRows, error: sessionError }, { data: taskRows, error: taskError }] =
    await Promise.all([
      sb.from("study_sessions")
        .select("id, user_id, subject, duration_minutes, notes, studied_at, session_start_time, created_at")
        .eq("user_id", userId)
        .order("studied_at", { ascending: true }),
      sb.from("tasks")
        .select("id, title, description, completed, priority, due_date, created_at, updated_at, user_id")
        .eq("user_id", userId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);

  if (sessionError) {
    console.error("[ai-insight-context] Failed to load sessions:", sessionError);
  }
  if (taskError) {
    console.error("[ai-insight-context] Failed to load tasks:", taskError);
  }

  const sessions = ((sessionRows ?? []) as StudySessionRow[]).filter((session) => (
    session.user_id === userId
  ));
  const tasks = ((taskRows ?? []) as TaskRow[]).filter((task) => task.user_id === userId);

  const sessionsDesc = [...sessions].sort((a, b) => (
    new Date(b.studied_at).getTime() - new Date(a.studied_at).getTime()
  ));
  const studyDates = sessions.map((session) => session.studied_at.split("T")[0]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const todayMinutes = sessions
    .filter((session) => new Date(session.studied_at) >= todayStart)
    .reduce((sum, session) => sum + session.duration_minutes, 0);
  const weekMinutes = sessions
    .filter((session) => new Date(session.studied_at) >= weekStart)
    .reduce((sum, session) => sum + session.duration_minutes, 0);

  const completed = tasks.filter((task) => task.completed).length;
  const active = tasks.filter((task) => !task.completed);
  const tasksTotal = tasks.length;
  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration_minutes, 0);

  const rawSessions: RawSessionForIntelligence[] = sessions.map((session) => ({
    duration_minutes: session.duration_minutes,
    studied_at: session.studied_at,
    session_start_time: session.session_start_time,
    subject: session.subject,
  }));

  return {
    trackerStats: {
      todayMinutes,
      weekMinutes,
      streak: computeCurrentStreak(studyDates),
      totalSessions: sessions.length,
      recentSessions: sessionsDesc.slice(0, 5),
      miniData: buildDailyData(sessions, 7),
    },
    taskStats: {
      total: tasksTotal,
      completed,
      active: active.length,
      overdue: active.filter((task) => isOverdue(task.due_date)).length,
      dueToday: active.filter((task) => isDueToday(task.due_date)).length,
      upcomingTasks: active.filter((task) => task.due_date !== null).slice(0, 5),
    },
    profileStats: {
      totalSessions: sessions.length,
      totalMinutes,
      streak: computeCurrentStreak(studyDates),
      taskCompletionRate: tasksTotal > 0 ? Math.round((completed / tasksTotal) * 100) : 0,
      tasksTotal,
    },
    rawSessions,
  };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
