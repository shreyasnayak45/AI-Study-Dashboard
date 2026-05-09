"use server";

import { getCurrentUser } from "@/lib/auth";
import { getCachedInsight, generateAndStoreInsight } from "@/lib/ai-insights";
import { getTrackerStats } from "@/lib/tracker-stats";
import { getTaskStats } from "@/lib/task-stats";
import { getProfileStats, getRawSessions } from "@/lib/analytics-stats";
import type { ActionResult, AIDailyInsight } from "@/types";

type InsightResult = ActionResult & { insight?: AIDailyInsight };

/**
 * Returns today's cached insight if it exists, otherwise generates a new one.
 * Called automatically on component mount when no server-side cache was found.
 */
export async function getOrGenerateInsight(): Promise<InsightResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const cached = await getCachedInsight();
  if (cached) return { success: true, insight: cached };

  return runGeneration();
}

/**
 * Force-regenerates insights regardless of today's cache.
 * Called by the Refresh button in InsightsCard and IntelligenceDashboard.
 */
export async function refreshInsight(): Promise<InsightResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  return runGeneration();
}

// ─── Shared generation logic ──────────────────────────────────────────────────

async function runGeneration(): Promise<InsightResult> {
  // All calls use React.cache — no redundant DB queries within this action.
  // rawSessions gives Gemini the full session history for intelligence analysis.
  const [trackerStats, taskStats, profileStats, rawSessions] = await Promise.all([
    getTrackerStats(),
    getTaskStats(),
    getProfileStats(),
    getRawSessions(),
  ]);

  const insight = await generateAndStoreInsight({
    trackerStats,
    taskStats,
    profileStats,
    rawSessions,
  });

  if (!insight) {
    // The specific cause is logged server-side via console.error in ai-insights.ts.
    // Surface a neutral message to the client — "GEMINI_API_KEY" was misleading
    // because the same error fired on timeouts, quota exhaustion, parse failures, etc.
    return { success: false, error: "AI analysis unavailable right now — try again in a moment." };
  }

  return { success: true, insight };
}
