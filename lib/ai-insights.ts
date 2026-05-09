// SERVER-ONLY — imports next/headers and server-side modules.
// Do NOT import from any "use client" component.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiFlash, isAIEnabled } from "@/lib/gemini";
import { computeCurrentStreak } from "@/lib/analytics-utils";
import type {
  AIDailyInsight, AIInsightContent, AIIntelligenceInsight,
  TrackerStats, TaskStats, ProfileStats, RawSessionForIntelligence,
} from "@/types";

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Hard cap on Gemini wall-clock time. Cache is served if exceeded. */
const GEMINI_TIMEOUT_MS = 12_000;

/**
 * How many net-new sessions since the last generation trigger a background
 * refresh (while still serving the existing cached insight).
 */
const STALE_SESSION_DELTA = 5;

// ─── Cache key ───────────────────────────────────────────────────────────────

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Staleness check (exported for use in the analytics page) ────────────────

/**
 * Returns true if the cached insight is stale and a background refresh should
 * be triggered *without blocking the UI*.
 *
 * Stale when: session count grew by STALE_SESSION_DELTA+ since last generation.
 * (Date-based expiry is already handled by the `insight_date` cache key — a new
 * day always yields null from getCachedInsight, triggering a fresh generation.)
 */
export function isCacheStale(
  insight: AIDailyInsight,
  currentSessionCount: number,
): boolean {
  const cachedCount = insight.content.metadata?.sessionCount ?? 0;
  return currentSessionCount - cachedCount >= STALE_SESSION_DELTA;
}

// ─── DB read ──────────────────────────────────────────────────────────────────

export const getCachedInsight = cache(async (): Promise<AIDailyInsight | null> => {
  if (!isAIEnabled()) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const sb = await createClient();
  const { data } = await sb
    .from("ai_insights")
    .select("*")
    .eq("user_id", user.id)
    .eq("insight_date", todayDateStr())
    .maybeSingle();

  return data as AIDailyInsight | null;
});

// ─── Generation ───────────────────────────────────────────────────────────────

interface InsightContext {
  trackerStats: TrackerStats;
  taskStats:    TaskStats;
  profileStats: ProfileStats;
  rawSessions?: RawSessionForIntelligence[];
}

export async function generateAndStoreInsight(ctx: InsightContext): Promise<AIDailyInsight | null> {
  if (!isAIEnabled()) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const content = await withTimeout(callGemini(ctx), GEMINI_TIMEOUT_MS);
  if (!content) return null;

  const sb = await createClient();
  const { data, error } = await sb
    .from("ai_insights")
    .upsert(
      {
        user_id:      user.id,
        insight_date: todayDateStr(),
        content,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,insight_date" }
    )
    .select()
    .single();

  if (error) return null;
  return data as AIDailyInsight;
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      ()  => { clearTimeout(timer); resolve(null); },
    );
  });
}

// ─── Optimised prompt + Gemini call ──────────────────────────────────────────

async function callGemini(ctx: InsightContext): Promise<AIInsightContent | null> {
  const { trackerStats, taskStats, profileStats, rawSessions } = ctx;

  // ── Base stats ──────────────────────────────────────────────────────────────
  const subjectMap = new Map<string, number>();
  for (const s of trackerStats.recentSessions) {
    if (s.subject) subjectMap.set(s.subject, (subjectMap.get(s.subject) ?? 0) + s.duration_minutes);
  }
  const topSubjects = [...subjectMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([subj, mins]) => `${subj} (${(mins / 60).toFixed(1)}h)`)
    .join(", ") || "none yet";

  const weekH      = (trackerStats.weekMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const totalH     = (profileStats.totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const taskLine   = taskStats.total === 0
    ? "no tasks"
    : `${taskStats.completed}/${taskStats.total} done${taskStats.overdue > 0 ? `, ${taskStats.overdue} overdue` : ""}`;
  const todayStr   = trackerStats.todayMinutes > 0 ? `${trackerStats.todayMinutes}m` : "0m";

  // ── Intelligence context (when sessions are available) ─────────────────────
  let intelligenceBlock = "";
  let intelligenceSchema = "";
  let sessionCount = profileStats.totalSessions;

  if (rawSessions && rawSessions.length > 0) {
    sessionCount = rawSessions.length;
    const facts = computeIntelligenceFacts(rawSessions);

    const lastWeekH  = (facts.lastWeekMinutes / 60).toFixed(1).replace(/\.0$/, "");
    const burnoutStr = [
      facts.burnoutSignals.hasLongSession   && "session >3h",
      facts.burnoutSignals.hasLateNight     && "late-night (>10pm UTC)",
      facts.burnoutSignals.hasSharpDrop     && "post-intensity drop",
      facts.burnoutSignals.hasErratic       && "erratic durations",
      facts.burnoutSignals.hasOverloadedDay && "day >6h",
    ].filter(Boolean).join(", ") || "none";

    intelligenceBlock = `
score:${facts.score}/100 [freq:${facts.breakdown.frequency}/40 streak:${facts.breakdown.streak}/25 reg:${facts.breakdown.regularity}/20 recent:${facts.breakdown.recentActivity}/15]
this_week:${(facts.thisWeekMinutes/60).toFixed(1)}h last_week:${lastWeekH}h active_30d:${facts.activeDays30}/30
UTC_timing: pre-dawn:${facts.buckets.lateNight}m early:${facts.buckets.earlyMorning}m morning:${facts.buckets.morning}m afternoon:${facts.buckets.afternoon}m evening:${facts.buckets.evening}m night:${facts.buckets.night}m
burnout_signals:${burnoutStr}`;

    intelligenceSchema = `,"intelligence":{"consistencyNarrative":{"label":"2-3 word style","tagline":"1 sentence"},"burnoutAnalysis":{"level":"low","headline":"3-5 words","insight":"2-3 sentences","signals":[]},"personality":{"type":"creative 2-4 word name","emoji":"🎯","tagline":"4-6 words","insight":"2-3 sentences"},"weeklyNarrative":"2-3 sentences with hours","recommendations":[{"emoji":"⏰","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"📅","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"🎯","title":"3-5 words","detail":"1-2 sentences"}],"motivationalMessage":"1-2 sentences"}`;
  }

  // ── Concise prompt ──────────────────────────────────────────────────────────
  // ~150 words vs the old ~530-word prompt — Gemini 2.5 Flash doesn't need
  // verbose instructions to produce high-quality structured output.
  const prompt = `Study coach AI. Return ONLY valid JSON — no markdown, no extra text.

today:${todayStr} week:${weekH}h streak:${trackerStats.streak}d total:${profileStats.totalSessions}sess/${totalH}h
subjects:${topSubjects} tasks:${taskLine}${intelligenceBlock}

{"dashboard":{"headline":"3-5 word state","insights":["insight 1","insight 2","insight 3"]},"analytics":{"summary":"1-sentence overview","observations":["obs 1","obs 2","obs 3","obs 4"]}${intelligenceSchema}}

Use specific numbers. Warm coach tone. No exclamation marks.`;

  let model;
  try { model = getGeminiFlash(); } catch { return null; }

  let result;
  try { result = await model.generateContent(prompt); } catch { return null; }

  let text: string;
  try {
    const candidate = result.response.candidates?.[0];
    if (!candidate) return null;

    const finishReason = candidate.finishReason;
    if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") return null;

    // Filter thinking parts (gemini-2.5-flash internal reasoning tokens)
    text = (candidate.content?.parts ?? [])
      .filter((p) => !(p as unknown as { thought?: boolean }).thought)
      .map((p)  => ("text" in p ? (p as { text: string }).text : ""))
      .join("");

    if (!text) return null;
  } catch { return null; }

  const parsed = parseResponse(text);
  if (!parsed) return null;

  // Attach staleness metadata so isCacheStale() can work on the next visit
  parsed.metadata = { sessionCount };
  return parsed;
}

// ─── Server-side intelligence facts (UTC-based) ───────────────────────────────

function computeIntelligenceFacts(sessions: RawSessionForIntelligence[]) {
  const now    = new Date();
  const MS_7D  =  7 * 24 * 60 * 60 * 1000;
  const MS_14D = 14 * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  const recent7  = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_7D));
  const recent14 = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_14D));
  const recent30 = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_30D));

  // Score
  const activeDays30   = new Set(recent30.map((s) => s.studied_at.split("T")[0])).size;
  const frequencyScore = Math.min(40, (activeDays30 / 30) * 40);
  const streak         = computeCurrentStreak(sessions.map((s) => s.studied_at.split("T")[0]));
  const streakScore    = Math.min(25, (streak / 14) * 25);

  const dayMap30  = new Map<string, number>();
  for (const s of recent30) {
    const k = s.studied_at.split("T")[0];
    dayMap30.set(k, (dayMap30.get(k) ?? 0) + s.duration_minutes);
  }
  const dailyMins     = Array.from(dayMap30.values());
  const mean30        = dailyMins.length > 0 ? dailyMins.reduce((a, b) => a + b, 0) / dailyMins.length : 0;
  const cv30          = mean30 > 0 ? Math.sqrt(dailyMins.reduce((s, v) => s + (v - mean30) ** 2, 0) / dailyMins.length) / mean30 : 0;
  const regularityScore = dailyMins.length < 3 ? 10 : Math.max(0, Math.min(20, 20 * (1 - cv30)));
  const recentScore   = Math.min(15, (recent7.length / 5) * 15);
  const score         = Math.max(0, Math.min(100, Math.round(frequencyScore + streakScore + regularityScore + recentScore)));

  // Burnout signals
  const prev7        = recent14.filter((s) => new Date(s.studied_at) < new Date(now.getTime() - MS_7D));
  const thisWeekMins = recent7.reduce((a, s) => a + s.duration_minutes, 0);
  const lastWeekMins = prev7.reduce((a, s) => a + s.duration_minutes, 0);
  const durations14  = recent14.map((s) => s.duration_minutes);
  const mean14       = durations14.length > 0 ? durations14.reduce((a, b) => a + b, 0) / durations14.length : 0;
  const cv14         = mean14 > 0 ? Math.sqrt(durations14.reduce((s, v) => s + (v - mean14) ** 2, 0) / durations14.length) / mean14 : 0;
  const dayMap7      = new Map<string, number>();
  for (const s of recent7) { const k = s.studied_at.split("T")[0]; dayMap7.set(k, (dayMap7.get(k) ?? 0) + s.duration_minutes); }

  const burnoutSignals = {
    hasLongSession:   recent7.some((s) => s.duration_minutes > 180),
    hasLateNight:     recent7.some((s) => new Date(s.studied_at).getUTCHours() >= 22),
    hasSharpDrop:     lastWeekMins >= 300 && thisWeekMins < lastWeekMins * 0.5,
    hasErratic:       durations14.length >= 4 && cv14 > 0.9,
    hasOverloadedDay: Array.from(dayMap7.values()).some((m) => m > 360),
  };

  // UTC hour buckets
  const ht = new Array<number>(24).fill(0);
  for (const s of sessions) ht[new Date(s.studied_at).getUTCHours()] += s.duration_minutes;
  const buckets = {
    lateNight:    ht.slice(0,  4).reduce((a, b) => a + b, 0),
    earlyMorning: ht.slice(4,  8).reduce((a, b) => a + b, 0),
    morning:      ht.slice(8, 12).reduce((a, b) => a + b, 0),
    afternoon:    ht.slice(12, 17).reduce((a, b) => a + b, 0),
    evening:      ht.slice(17, 21).reduce((a, b) => a + b, 0),
    night:        ht.slice(21, 24).reduce((a, b) => a + b, 0),
  };

  // Weekly comparison (Sun–Sat local-ish using UTC)
  const dow       = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow); weekStart.setHours(0, 0, 0, 0);
  const lastStart = new Date(weekStart); lastStart.setDate(weekStart.getDate() - 7);

  const thisWeekMinutes = sessions.filter((s) => new Date(s.studied_at) >= weekStart).reduce((a, s) => a + s.duration_minutes, 0);
  const lastWeekMinutes = sessions.filter((s) => { const d = new Date(s.studied_at); return d >= lastStart && d < weekStart; }).reduce((a, s) => a + s.duration_minutes, 0);

  return {
    score,
    breakdown: { frequency: Math.round(frequencyScore), streak: Math.round(streakScore), regularity: Math.round(regularityScore), recentActivity: Math.round(recentScore) },
    activeDays30,
    burnoutSignals,
    buckets,
    thisWeekMinutes,
    lastWeekMinutes,
  };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseResponse(raw: string): AIInsightContent | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  try {
    const p = JSON.parse(cleaned);

    if (
      typeof p?.dashboard?.headline !== "string" ||
      !Array.isArray(p?.dashboard?.insights) ||
      typeof p?.analytics?.summary !== "string" ||
      !Array.isArray(p?.analytics?.observations)
    ) return null;

    const content: AIInsightContent = {
      dashboard: { headline: p.dashboard.headline, insights: (p.dashboard.insights as string[]).slice(0, 4) },
      analytics: { summary: p.analytics.summary, observations: (p.analytics.observations as string[]).slice(0, 5) },
    };

    if (p.intelligence && isValidIntelligence(p.intelligence)) {
      content.intelligence = sanitiseIntelligence(p.intelligence as Record<string, unknown>);
    }

    return content;
  } catch { return null; }
}

function isValidIntelligence(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o  = x as Record<string, unknown>;
  const cn = o.consistencyNarrative as Record<string, unknown> | undefined;
  const ba = o.burnoutAnalysis      as Record<string, unknown> | undefined;
  const pe = o.personality          as Record<string, unknown> | undefined;
  return (
    typeof cn?.label    === "string" && typeof cn?.tagline  === "string" &&
    typeof ba?.level    === "string" && typeof ba?.headline === "string" &&
    typeof ba?.insight  === "string" && Array.isArray(ba?.signals) &&
    typeof pe?.type     === "string" && typeof pe?.emoji    === "string" &&
    typeof pe?.tagline  === "string" && typeof pe?.insight  === "string" &&
    typeof o.weeklyNarrative     === "string" &&
    Array.isArray(o.recommendations) &&
    typeof o.motivationalMessage === "string"
  );
}

function sanitiseIntelligence(raw: Record<string, unknown>): AIIntelligenceInsight {
  const cn  = raw.consistencyNarrative as Record<string, string>;
  const ba  = raw.burnoutAnalysis      as Record<string, unknown>;
  const pe  = raw.personality          as Record<string, string>;
  const recs = (raw.recommendations as Array<Record<string, string>>)
    .slice(0, 5)
    .map((r) => ({ emoji: String(r.emoji ?? ""), title: String(r.title ?? ""), detail: String(r.detail ?? "") }));

  const rawLevel = String(ba.level ?? "").toLowerCase();
  const level: AIIntelligenceInsight["burnoutAnalysis"]["level"] =
    rawLevel === "high" ? "high" : rawLevel === "moderate" ? "moderate" : "low";

  return {
    consistencyNarrative: { label: String(cn.label ?? ""), tagline: String(cn.tagline ?? "") },
    burnoutAnalysis: { level, headline: String(ba.headline ?? ""), insight: String(ba.insight ?? ""), signals: (ba.signals as string[]).map(String).slice(0, 5) },
    personality: { type: String(pe.type ?? ""), emoji: String(pe.emoji ?? ""), tagline: String(pe.tagline ?? ""), insight: String(pe.insight ?? "") },
    weeklyNarrative:     String(raw.weeklyNarrative    ?? ""),
    recommendations:     recs,
    motivationalMessage: String(raw.motivationalMessage ?? ""),
  };
}
