"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAIInsightsEndpoint } from "@/lib/ai-backend";
import { getCachedInsight } from "@/lib/ai-insights";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AIDailyInsight } from "@/types";

type InsightResult = ActionResult & { insight?: AIDailyInsight };
type AIInsightsApiResult = InsightResult;

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

async function runGeneration(): Promise<InsightResult> {
  const sb = await createClient();
  const { data: { session } } = await sb.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const response = await fetch(getAIInsightsEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const result = await response.json().catch(() => null) as AIInsightsApiResult | null;
    if (!response.ok || !result?.success || !result.insight) {
      return {
        success: false,
        error: result?.error || "AI analysis unavailable right now. Please try again in a moment.",
      };
    }

    return { success: true, insight: result.insight };
  } catch (error) {
    console.error("[ai-action] Secure AI insight request failed:", error);
    return {
      success: false,
      error: "AI analysis unavailable right now. Please try again in a moment.",
    };
  }
}
