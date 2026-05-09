// SERVER-ONLY — imports next/headers and server-side modules.
// Do NOT import from any "use client" component.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiFlash, isAIEnabled } from "@/lib/gemini";
import { computeCurrentStreak } from "@/lib/analytics-utils";
import {
  INTELLIGENCE_VERSION,
  TIMING_UNKNOWN_PERSONALITY,
  computePhase,
  hasRealSessionStartTime,
  MIN_TIMED_SESSIONS,
} from "@/lib/intelligence";
import type {
  AIDailyInsight, AIInsightContent, AIIntelligenceInsight,
  IntelligencePhase,
  TrackerStats, TaskStats, ProfileStats, RawSessionForIntelligence,
} from "@/types";

// ─── Tunables ────────────────────────────────────────────────────────────────

/**
 * Hard cap on Gemini wall-clock time.
 * Gemini 2.5 Flash with thinking enabled regularly takes 15–30 s.
 * 12 s was causing silent timeouts on every cold-cache visit after migration 3
 * deleted all cached rows, making the error "Could not generate insights" appear
 * on every page load. Raised to 30 s to give the model room to complete.
 */
const GEMINI_TIMEOUT_MS = 30_000;

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
  if ((insight.content.metadata?.intelligence_version ?? 0) < INTELLIGENCE_VERSION) {
    return true;
  }

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

  if (!data) return null;

  const insight = data as AIDailyInsight;
  const cachedVersion = insight.content.metadata?.intelligence_version ?? 0;
  const hasEnoughTimingData = await userHasEnoughTimingData(user.id);

  if (cachedVersion < INTELLIGENCE_VERSION) {
    console.warn(
      `[ai-insights] getCachedInsight: cached insight version ${cachedVersion} < required ${INTELLIGENCE_VERSION} — forcing regeneration`,
    );
    return null;
  }

  if (!hasEnoughTimingData) {
    const cleaned = withSafeTimingContent(insight);
    // Fire-and-forget: sanitise the cached personality in the DB so it's correct
    // on the next cold read. Not awaited — never block the response for a write.
    sb.from("ai_insights")
      .update({ content: cleaned.content })
      .eq("id", cleaned.id)
      .then(({ error }) => {
        if (error) console.error("[ai-insights] Failed to sanitise cached insight timing content:", error);
      });
    return cleaned;
  }

  return insight;
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

  const content = await withTimeout(callGemini(ctx), GEMINI_TIMEOUT_MS, "callGemini");
  if (!content) {
    console.error(`[ai-insights] generateAndStoreInsight: callGemini returned null (timeout=${GEMINI_TIMEOUT_MS}ms or internal error)`);
    return null;
  }

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

  if (error) {
    console.error("[ai-insights] Supabase upsert failed:", error);
    return null;
  }
  return data as AIDailyInsight;
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[ai-insights] ${label} timed out after ${ms}ms`);
      resolve(null);
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => {
        clearTimeout(timer);
        console.error(`[ai-insights] ${label} rejected:`, err);
        resolve(null);
      },
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
  let sessionCount   = profileStats.totalSessions;
  // Hoisted so the mandatory post-parse override can access it without re-computing.
  let hasTimingData  = false;

  if (rawSessions && rawSessions.length > 0) {
    sessionCount = rawSessions.length;
    const facts  = computeIntelligenceFacts(rawSessions);
    hasTimingData = facts.hasTimingData;   // ← captured here; used again below
    const phase: IntelligencePhase = computePhase(facts.activeDays30, sessionCount);

    const lastWeekH  = (facts.lastWeekMinutes / 60).toFixed(1).replace(/\.0$/, "");
    const burnoutStr = [
      facts.burnoutSignals.hasLongSession   && "session >3h",
      facts.burnoutSignals.hasLateNight     && "late-night (>10pm UTC)",
      facts.burnoutSignals.hasSharpDrop     && "post-intensity drop",
      facts.burnoutSignals.hasErratic       && "erratic durations",
      facts.burnoutSignals.hasOverloadedDay && "day >6h",
    ].filter(Boolean).join(", ") || "none";

    // Timing data block — only included when we have MIN_TIMED_SESSIONS real timestamps.
    // If absent, Gemini gets an explicit prohibition on time-of-day claims.
    const timingBlock = facts.hasTimingData
      ? `UTC_timing(${facts.timedSessionCount} timed sessions): pre-dawn:${facts.buckets.lateNight}m early:${facts.buckets.earlyMorning}m morning:${facts.buckets.morning}m afternoon:${facts.buckets.afternoon}m evening:${facts.buckets.evening}m night:${facts.buckets.night}m`
      : `timing_data: NONE (${facts.timedSessionCount}/${MIN_TIMED_SESSIONS} timed sessions — user studies manually without the live timer)`;

    intelligenceBlock = `
score:${facts.score}/100 [freq:${facts.breakdown.frequency}/40 streak:${facts.breakdown.streak}/25 reg:${facts.breakdown.regularity}/20 recent:${facts.breakdown.recentActivity}/15]
this_week:${(facts.thisWeekMinutes/60).toFixed(1)}h last_week:${lastWeekH}h active_30d:${facts.activeDays30}/30
${timingBlock}
burnout_signals:${burnoutStr}
phase:${phase}`;

    // ── Phase-specific prompt constraints + JSON schema ────────────────────
    //
    // TIMING PERSONALITY POLICY — three independent layers of defence:
    //   Layer 1 (prompt): when no timing data, personality is OMITTED from the
    //     JSON schema entirely. Gemini never sees the field → can't hallucinate it.
    //   Layer 2 (prompt instruction): explicit text prohibition on time archetypes.
    //   Layer 3 (server-side post-parse): sanitiseIntelligence receives hasTimingData
    //     and overwrites any returned personality with TIMING_UNKNOWN_PERSONALITY.
    //
    // The personality field in the schema is ONLY present when hasTimingData === true.
    // When absent it is injected server-side after parsing (so it never reaches the DB
    // with a fabricated value).

    const personalitySchemaField = facts.hasTimingData
      // included in schema only when we have real timing evidence
      ? `,"personality":{"type":"creative 2-4 word name","emoji":"🎯","tagline":"4-6 words","insight":"2-3 sentences based on peak hours"}`
      // omitted entirely — server injects TIMING_UNKNOWN_PERSONALITY after parsing
      : "";

    // Shared timing constraint text added to the instruction block
    const timingInstruction = facts.hasTimingData
      ? ""
      : `
NO TIMING DATA (${facts.timedSessionCount}/${MIN_TIMED_SESSIONS} timed sessions):
  DO NOT output a "personality" field at all — it will be injected by the server.
  DO NOT mention morning / afternoon / evening / night in ANY field.
  DO NOT mention peak focus hours, focus windows, or timing-based study behavior.
  DO NOT reference time-of-day in dashboard, analytics, intelligence, or recommendations.`;

    if (phase === 1) {
      intelligenceBlock += timingInstruction + `
PHASE 1: burnoutAnalysis.level MUST be "unknown". Use only observational language.`;

      intelligenceSchema = `,"intelligence":{"phase":1,"dataConfidence":"low","consistencyNarrative":{"label":"Early Observations","tagline":"1 observational sentence"},"burnoutAnalysis":{"level":"unknown","headline":"Still Learning","insight":"2-3 sentences on needing more data","signals":[]}${personalitySchemaField},"weeklyNarrative":"1-2 sentences on early progress","recommendations":[{"emoji":"📅","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"🎯","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"🔄","title":"3-5 words","detail":"1-2 sentences"}],"motivationalMessage":"1-2 warm, encouraging sentences"}`;

    } else if (phase === 2) {
      intelligenceBlock += timingInstruction + `
PHASE 2: hedged language — "tends to", "appears to", "early patterns suggest".`;

      intelligenceSchema = `,"intelligence":{"phase":2,"dataConfidence":"moderate","consistencyNarrative":{"label":"2-3 word style","tagline":"1 hedged sentence"},"burnoutAnalysis":{"level":"low","headline":"3-5 words","insight":"2-3 hedged sentences","signals":[]}${personalitySchemaField},"weeklyNarrative":"2-3 sentences with hours","recommendations":[{"emoji":"⏰","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"📅","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"🎯","title":"3-5 words","detail":"1-2 sentences"}],"motivationalMessage":"1-2 sentences"}`;

    } else {
      intelligenceBlock += timingInstruction + (facts.hasTimingData
        ? `\nPHASE 3: Full confidence. Specific personality archetypes, detailed burnout analysis.`
        : `\nPHASE 3: Full confidence on consistency/burnout/weekly only. Follow timing instructions above.`);

      intelligenceSchema = `,"intelligence":{"phase":3,"dataConfidence":"high","consistencyNarrative":{"label":"2-3 word style","tagline":"1 confident sentence"},"burnoutAnalysis":{"level":"low","headline":"3-5 words","insight":"2-3 sentences","signals":[]}${personalitySchemaField},"weeklyNarrative":"2-3 sentences with hours","recommendations":[{"emoji":"⏰","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"📅","title":"3-5 words","detail":"1-2 sentences"},{"emoji":"🎯","title":"3-5 words","detail":"1-2 sentences"}],"motivationalMessage":"1-2 sentences"}`;
    }
  }

  // ── Concise prompt ──────────────────────────────────────────────────────────
  // ~150 words vs the old ~530-word prompt — Gemini 2.5 Flash doesn't need
  // verbose instructions to produce high-quality structured output.
  const globalTimingInstruction = hasTimingData
    ? ""
    : `
No reliable session_start_time data. In every output field, avoid all time-of-day claims, including morning, afternoon, evening, night, peak focus hours, focus windows, and timing-based study behavior. Use neutral progress wording such as "Strong Start to Your Study Journey".`;

  const prompt = `Study coach AI. Return ONLY valid JSON — no markdown, no extra text.

today:${todayStr} week:${weekH}h streak:${trackerStats.streak}d total:${profileStats.totalSessions}sess/${totalH}h
subjects:${topSubjects} tasks:${taskLine}${globalTimingInstruction}${intelligenceBlock}

{"dashboard":{"headline":"3-5 word state","insights":["insight 1","insight 2","insight 3"]},"analytics":{"summary":"1-sentence overview","observations":["obs 1","obs 2","obs 3","obs 4"]}${intelligenceSchema}}

Use specific numbers. Warm coach tone. No exclamation marks.`;

  let model;
  try {
    model = getGeminiFlash();
  } catch (err) {
    console.error("[ai-insights] getGeminiFlash() threw — API key likely missing:", err);
    return null;
  }

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    console.error("[ai-insights] model.generateContent() threw — network/quota error:", err);
    return null;
  }

  let text: string;
  try {
    const candidate = result.response.candidates?.[0];
    if (!candidate) {
      console.error("[ai-insights] No candidates in Gemini response:", JSON.stringify(result.response));
      return null;
    }

    const finishReason = candidate.finishReason;
    if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
      console.error("[ai-insights] Unexpected finishReason:", finishReason);
      return null;
    }

    // Filter thinking parts (gemini-2.5-flash internal reasoning tokens)
    text = (candidate.content?.parts ?? [])
      .filter((p) => !(p as unknown as { thought?: boolean }).thought)
      .map((p)  => ("text" in p ? (p as { text: string }).text : ""))
      .join("");

    if (!text) {
      console.error("[ai-insights] Gemini returned empty text after filtering thought parts");
      return null;
    }
  } catch (err) {
    console.error("[ai-insights] Error reading Gemini response:", err);
    return null;
  }

  // Layer 3 (mandatory server-side override): parseResponse receives hasTimingData
  // (hoisted above). sanitiseIntelligence forces TIMING_UNKNOWN_PERSONALITY when
  // false, regardless of what Gemini returned.
  const parsed = parseResponse(text, hasTimingData);
  if (!parsed) {
    console.error("[ai-insights] parseResponse() returned null — Gemini output failed validation. Raw text (first 500 chars):", text.slice(0, 500));
    return null;
  }

  const content = hasTimingData ? parsed : sanitiseTimingLanguage(parsed);

  // Attach staleness metadata so isCacheStale() can work on the next visit
  content.metadata = { sessionCount, intelligence_version: INTELLIGENCE_VERSION };
  return content;
}

export async function __debugGenerateInsightContent(ctx: InsightContext): Promise<AIInsightContent | null> {
  return callGemini(ctx);
}

async function userHasEnoughTimingData(userId: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb
    .from("study_sessions")
    .select("session_start_time")
    .eq("user_id", userId)
    .not("session_start_time", "is", null);

  const timedCount = ((data ?? []) as Array<{ session_start_time: string | null }>)
    .filter((s) => (
      typeof s.session_start_time === "string" &&
      s.session_start_time.trim().length > 0 &&
      !Number.isNaN(Date.parse(s.session_start_time))
    ))
    .length;

  return timedCount >= MIN_TIMED_SESSIONS;
}

function withSafeTimingContent(insight: AIDailyInsight): AIDailyInsight {
  const content: AIInsightContent = {
    ...sanitiseTimingLanguage(insight.content),
    metadata: {
      ...(insight.content.metadata ?? {}),
      intelligence_version: INTELLIGENCE_VERSION,
    },
  };

  if (content.intelligence) {
    content.intelligence = {
      ...content.intelligence,
      personality: { ...TIMING_UNKNOWN_PERSONALITY },
    };
  }

  return { ...insight, content };
}

const TIMING_LANGUAGE_RE =
  /\b(?:afternoons?|mornings?|evenings?|nights?|nighttime|late-night|early-morning|midday|midnight|dawn|pre-dawn|peak\s+focus\s+hours?|peak\s+hours?|focus\s+windows?|time-of-day|timing-based|timing\s+patterns?|timing\s+analysis|study\s+rhythm)\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i;

function sanitiseTimingLanguage(content: AIInsightContent): AIInsightContent {
  return {
    ...content,
    dashboard: {
      headline: sanitiseHeadline(content.dashboard.headline),
      insights: content.dashboard.insights
        .slice(0, 4)
        .map((text) => sanitiseNarrativeText(
          text,
          "Your study journey is building momentum from the sessions you've logged.",
        )),
    },
    analytics: {
      summary: sanitiseNarrativeText(
        content.analytics.summary,
        "Your study journey is building momentum from the sessions you've logged.",
      ),
      observations: content.analytics.observations
        .slice(0, 5)
        .map((text) => sanitiseNarrativeText(
          text,
          "Your logged sessions show steady progress while the dataset is still maturing.",
        )),
    },
    intelligence: content.intelligence ? sanitiseIntelligenceTimingLanguage(content.intelligence) : undefined,
  };
}

function sanitiseIntelligenceTimingLanguage(
  intelligence: AIIntelligenceInsight,
): AIIntelligenceInsight {
  return {
    ...intelligence,
    consistencyNarrative: {
      label: sanitiseShortLabel(intelligence.consistencyNarrative.label, "Steady Progress"),
      tagline: sanitiseNarrativeText(
        intelligence.consistencyNarrative.tagline,
        "Your logged sessions are starting to show a clearer consistency pattern.",
      ),
    },
    burnoutAnalysis: {
      ...intelligence.burnoutAnalysis,
      headline: sanitiseShortLabel(intelligence.burnoutAnalysis.headline, "Still Learning"),
      insight: sanitiseNarrativeText(
        intelligence.burnoutAnalysis.insight,
        "This analysis focuses on duration and consistency while the dataset is still maturing.",
      ),
      signals: intelligence.burnoutAnalysis.signals
        .filter((signal) => !hasTimingLanguage(signal))
        .slice(0, 5),
    },
    personality: { ...TIMING_UNKNOWN_PERSONALITY },
    weeklyNarrative: sanitiseNarrativeText(
      intelligence.weeklyNarrative,
      "Your weekly progress is best described through total time and consistency for now.",
    ),
    recommendations: intelligence.recommendations
      .map((rec) => ({
        emoji: rec.emoji,
        title: sanitiseShortLabel(rec.title, "Keep Building"),
        detail: sanitiseNarrativeText(
          rec.detail,
          "Keep logging sessions so future insights can become more personalized.",
        ),
      }))
      .slice(0, 5),
    motivationalMessage: sanitiseNarrativeText(
      intelligence.motivationalMessage,
      "Strong work logging your study sessions. Keep building the habit one session at a time.",
    ),
  };
}

function sanitiseHeadline(text: string): string {
  return hasTimingLanguage(text) ? "Strong Start to Your Study Journey" : text;
}

function sanitiseShortLabel(text: string, fallback: string): string {
  return hasTimingLanguage(text) ? fallback : text;
}

function sanitiseNarrativeText(text: string, fallback: string): string {
  if (!hasTimingLanguage(text)) return text;

  const safeSentences = (text.match(/[^.!?]+[.!?]?/g) ?? [text])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !hasTimingLanguage(sentence));

  return safeSentences.join(" ").trim() || fallback;
}

function hasTimingLanguage(text: string): boolean {
  return TIMING_LANGUAGE_RE.test(text);
}

// ─── Server-side intelligence facts ──────────────────────────────────────────
//
// TIMING DATA POLICY (mirrors lib/intelligence.ts):
//   Hour buckets and late-night burnout are computed from `session_start_time` ONLY.
//   `studied_at` for manual sessions is set to T12:00:00 (noon placeholder) — using
//   its UTC hours for time-of-day analysis would produce completely fabricated data.

function computeIntelligenceFacts(sessions: RawSessionForIntelligence[]) {
  const now    = new Date();
  const MS_7D  =  7 * 24 * 60 * 60 * 1000;
  const MS_14D = 14 * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  const recent7  = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_7D));
  const recent14 = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_14D));
  const recent30 = sessions.filter((s) => new Date(s.studied_at) >= new Date(now.getTime() - MS_30D));

  // Score (all duration/date-based — safe for all sessions)
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

  // Hour buckets — ONLY sessions with real session_start_time
  const timedSessions      = sessions.filter(hasRealSessionStartTime);
  const timedSessionCount  = timedSessions.length;
  const hasTimingData      = timedSessionCount >= MIN_TIMED_SESSIONS;

  // Burnout signals
  const prev7        = recent14.filter((s) => new Date(s.studied_at) < new Date(now.getTime() - MS_7D));
  const thisWeekMins = recent7.reduce((a, s) => a + s.duration_minutes, 0);
  const lastWeekMins = prev7.reduce((a, s) => a + s.duration_minutes, 0);
  const durations14  = recent14.map((s) => s.duration_minutes);
  const mean14       = durations14.length > 0 ? durations14.reduce((a, b) => a + b, 0) / durations14.length : 0;
  const cv14         = mean14 > 0 ? Math.sqrt(durations14.reduce((s, v) => s + (v - mean14) ** 2, 0) / durations14.length) / mean14 : 0;
  const dayMap7      = new Map<string, number>();
  for (const s of recent7) { const k = s.studied_at.split("T")[0]; dayMap7.set(k, (dayMap7.get(k) ?? 0) + s.duration_minutes); }

  // Late-night: ONLY from session_start_time — never studied_at
  const timedRecent7 = hasTimingData ? recent7.filter(hasRealSessionStartTime) : [];
  const burnoutSignals = {
    hasLongSession:   recent7.some((s) => s.duration_minutes > 180),
    hasLateNight:     timedRecent7.some((s) => new Date(s.session_start_time!).getUTCHours() >= 22),
    hasSharpDrop:     lastWeekMins >= 300 && thisWeekMins < lastWeekMins * 0.5,
    hasErratic:       durations14.length >= 4 && cv14 > 0.9,
    hasOverloadedDay: Array.from(dayMap7.values()).some((m) => m > 360),
  };

  const ht = new Array<number>(24).fill(0);
  if (hasTimingData) {
    for (const s of timedSessions) {
      ht[new Date(s.session_start_time!).getUTCHours()] += s.duration_minutes;
    }
  }
  const buckets = {
    lateNight:    ht.slice(0,  4).reduce((a, b) => a + b, 0),
    earlyMorning: ht.slice(4,  8).reduce((a, b) => a + b, 0),
    morning:      ht.slice(8, 12).reduce((a, b) => a + b, 0),
    afternoon:    ht.slice(12, 17).reduce((a, b) => a + b, 0),
    evening:      ht.slice(17, 21).reduce((a, b) => a + b, 0),
    night:        ht.slice(21, 24).reduce((a, b) => a + b, 0),
  };

  // Weekly comparison (Sun–Sat)
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
    timedSessionCount,
    hasTimingData,
    thisWeekMinutes,
    lastWeekMinutes,
  };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseResponse(raw: string, hasTimingData: boolean): AIInsightContent | null {
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

    if (p.intelligence && isValidIntelligence(p.intelligence, hasTimingData)) {
      content.intelligence = sanitiseIntelligence(p.intelligence as Record<string, unknown>, hasTimingData);
    }

    return content;
  } catch { return null; }
}

function isValidIntelligence(x: unknown, hasTimingData: boolean): boolean {
  if (!x || typeof x !== "object") return false;
  const o  = x as Record<string, unknown>;
  const cn = o.consistencyNarrative as Record<string, unknown> | undefined;
  const ba = o.burnoutAnalysis      as Record<string, unknown> | undefined;
  const pe = o.personality          as Record<string, unknown> | undefined;

  const coreValid = (
    typeof cn?.label    === "string" && typeof cn?.tagline  === "string" &&
    typeof ba?.level    === "string" && typeof ba?.headline === "string" &&
    typeof ba?.insight  === "string" && Array.isArray(ba?.signals) &&
    typeof o.weeklyNarrative     === "string" &&
    Array.isArray(o.recommendations) &&
    typeof o.motivationalMessage === "string"
  );
  if (!coreValid) return false;

  // Personality is only required in the response when timing data is present.
  // When absent, Gemini doesn't produce it (it was omitted from the schema),
  // and sanitiseIntelligence will inject TIMING_UNKNOWN_PERSONALITY instead.
  if (hasTimingData) {
    if (
      typeof pe?.type    !== "string" || typeof pe?.emoji   !== "string" ||
      typeof pe?.tagline !== "string" || typeof pe?.insight !== "string"
    ) return false;
  }

  // Note: phase and dataConfidence are optional — defaulted in sanitiseIntelligence
  // so older cached responses (before phases were added) still work.
  return true;
}

function sanitiseIntelligence(
  raw:           Record<string, unknown>,
  hasTimingData: boolean,
): AIIntelligenceInsight {
  const cn  = raw.consistencyNarrative as Record<string, string>;
  const ba  = raw.burnoutAnalysis      as Record<string, unknown>;
  const recs = (raw.recommendations as Array<Record<string, string>>)
    .slice(0, 5)
    .map((r) => ({ emoji: String(r.emoji ?? ""), title: String(r.title ?? ""), detail: String(r.detail ?? "") }));

  // ── Mandatory timing safety override (Layer 3 of 3) ──────────────────────
  // If timing data is insufficient, ALWAYS use the fallback personality —
  // discard whatever Gemini may have hallucinated, no exceptions.
  const personality: AIIntelligenceInsight["personality"] = !hasTimingData
    ? { ...TIMING_UNKNOWN_PERSONALITY }
    : (() => {
        const pe = raw.personality as Record<string, string>;
        return {
          type:    String(pe?.type    ?? ""),
          emoji:   String(pe?.emoji   ?? ""),
          tagline: String(pe?.tagline ?? ""),
          insight: String(pe?.insight ?? ""),
        };
      })();

  // Burnout level — now includes "unknown" for Phase 1
  const rawLevel = String(ba.level ?? "").toLowerCase();
  const level: AIIntelligenceInsight["burnoutAnalysis"]["level"] =
    rawLevel === "high"     ? "high"     :
    rawLevel === "moderate" ? "moderate" :
    rawLevel === "unknown"  ? "unknown"  :
                              "low";

  // Phase — default to 3 for backwards-compat with cached insights that pre-date phases
  const rawPhase = Number(raw.phase);
  const phase: IntelligencePhase =
    rawPhase === 1 ? 1 : rawPhase === 2 ? 2 : 3;

  // dataConfidence — default to "high" for backwards-compat
  const rawConf = String(raw.dataConfidence ?? "").toLowerCase();
  const dataConfidence: AIIntelligenceInsight["dataConfidence"] =
    rawConf === "low"      ? "low"      :
    rawConf === "moderate" ? "moderate" :
                             "high";

  return {
    phase,
    dataConfidence,
    consistencyNarrative: { label: String(cn.label ?? ""), tagline: String(cn.tagline ?? "") },
    burnoutAnalysis: { level, headline: String(ba.headline ?? ""), insight: String(ba.insight ?? ""), signals: (ba.signals as string[]).map(String).slice(0, 5) },
    personality,   // ← always safe: TIMING_UNKNOWN_PERSONALITY when !hasTimingData
    weeklyNarrative:     String(raw.weeklyNarrative    ?? ""),
    recommendations:     recs,
    motivationalMessage: String(raw.motivationalMessage ?? ""),
  };
}
