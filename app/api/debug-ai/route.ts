import { NextResponse } from "next/server";
import { __debugGenerateInsightContent } from "@/lib/ai-insights";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const now = new Date();
    const iso = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    };

    const content = await __debugGenerateInsightContent({
      trackerStats: {
        todayMinutes: 45,
        weekMinutes: 220,
        streak: 3,
        totalSessions: 4,
        recentSessions: [
          { id: "1", user_id: "debug", subject: "Math", duration_minutes: 45, notes: null, studied_at: iso(0), session_start_time: null, created_at: iso(0) },
          { id: "2", user_id: "debug", subject: "Physics", duration_minutes: 60, notes: null, studied_at: iso(1), session_start_time: null, created_at: iso(1) },
        ],
        miniData: [],
      },
      taskStats: { total: 0, completed: 0, active: 0, overdue: 0, dueToday: 0, upcomingTasks: [] },
      profileStats: { totalSessions: 4, totalMinutes: 220, streak: 3, taskCompletionRate: 0, tasksTotal: 0 },
      rawSessions: [
        { duration_minutes: 45, studied_at: iso(0), session_start_time: null, subject: "Math" },
        { duration_minutes: 60, studied_at: iso(1), session_start_time: null, subject: "Physics" },
        { duration_minutes: 55, studied_at: iso(2), session_start_time: null, subject: "Chemistry" },
        { duration_minutes: 60, studied_at: iso(3), session_start_time: null, subject: "Math" },
      ],
    });

    return NextResponse.json({ ok: Boolean(content), content });
  } catch (error) {
    console.error("debug-ai failed", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
