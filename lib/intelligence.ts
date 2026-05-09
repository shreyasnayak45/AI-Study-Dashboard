// PURE / CLIENT-SAFE — no server imports.
// All new Date() calls that use .getHours() intentionally run client-side inside
// IntelligenceDashboard (loaded with ssr: false) so they use the browser's local timezone.
//
// TIMING DATA POLICY:
//   .getHours() is called ONLY on `session_start_time`, never on `studied_at`.
//   `studied_at` for manual sessions is set to noon (T12:00:00) on the chosen date —
//   a placeholder that shifts with timezone and has nothing to do with actual study time.
//   `session_start_time` is only present for:
//     - Live-timer sessions (real browser start timestamp)
//     - Manual sessions where the user explicitly entered a start time
//   When `session_start_time` is null, the session has no reliable timing data and
//   is excluded from ALL time-of-day analysis.

import { computeCurrentStreak } from "@/lib/analytics-utils";
import type {
  ConsistencyScore, BurnoutRisk, BurnoutSignal, BurnoutLevel,
  HourData, BestStudyHours, FocusPersonality, WeeklyReport,
  IntelligenceData, IntelligencePhase, RawSessionForIntelligence,
  AIIntelligenceInsight,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum number of sessions with real timing data (`session_start_time != null`)
 * required before any time-of-day analysis is enabled.
 *
 * Below this threshold:
 *   - Heatmap shows "Still learning your focus windows"
 *   - Personality is "Just Getting Started" (no time-based archetypes)
 *   - Burnout time-of-day signals are skipped
 *   - Gemini receives an explicit "no timing data" instruction
 *
 * Exported so ai-insights.ts uses the same value.
 */
export const MIN_TIMED_SESSIONS = 5;

/** Bump whenever cached AI intelligence shape/safety semantics change. */
export const INTELLIGENCE_VERSION = 3;

export const TIMING_UNKNOWN_PERSONALITY: AIIntelligenceInsight["personality"] = {
  type:    "Focus Patterns Unknown",
  emoji:   "🕐",
  tagline: "Learning Your Study Pattern",
  insight: "Use the live timer during study sessions to unlock personalized focus insights.",
};

export function hasRealSessionStartTime(s: RawSessionForIntelligence): boolean {
  return typeof s.session_start_time === "string" &&
    s.session_start_time.trim().length > 0 &&
    !Number.isNaN(Date.parse(s.session_start_time));
}

// ─── Phase computation (exported for use in ai-insights.ts) ──────────────────

/**
 * Determines the confidence phase based on study history depth.
 *   Phase 1 — Discovery:         <7 active days in the last 30d OR <5 total sessions
 *   Phase 2 — Pattern Detection: 7–19 active days in the last 30d
 *   Phase 3 — AI Coach:          20+ active days in the last 30d
 */
export function computePhase(activeDays30: number, totalSessions: number): IntelligencePhase {
  if (activeDays30 < 7 || totalSessions < 5) return 1;
  if (activeDays30 < 20) return 2;
  return 3;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function computeIntelligence(
  sessions: RawSessionForIntelligence[],
): IntelligenceData {
  if (sessions.length === 0) return emptyIntelligence();

  const now = new Date();

  const MS_7D  =  7 * 24 * 60 * 60 * 1000;
  const MS_14D = 14 * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  const cutoff30 = new Date(now.getTime() - MS_30D);
  const cutoff14 = new Date(now.getTime() - MS_14D);
  const cutoff7  = new Date(now.getTime() - MS_7D);

  const recent30 = sessions.filter((s) => new Date(s.studied_at) >= cutoff30);
  const recent14 = sessions.filter((s) => new Date(s.studied_at) >= cutoff14);
  const recent7  = sessions.filter((s) => new Date(s.studied_at) >= cutoff7);

  // ── Phase (data-confidence level) ───────────────────────────────────────
  const activeDays30 = new Set(recent30.map((s) => s.studied_at.split("T")[0])).size;
  const phase = computePhase(activeDays30, sessions.length);

  // ── Consistency Score ────────────────────────────────────────────────────
  const frequencyScore = Math.min(40, (activeDays30 / 30) * 40);

  const allDateStrings = sessions.map((s) => s.studied_at.split("T")[0]);
  const streak = computeCurrentStreak(allDateStrings);
  const streakScore = Math.min(25, (streak / 14) * 25);

  const dayMap30 = new Map<string, number>();
  for (const s of recent30) {
    const k = s.studied_at.split("T")[0];
    dayMap30.set(k, (dayMap30.get(k) ?? 0) + s.duration_minutes);
  }
  const regularityScore = computeRegularityScore(Array.from(dayMap30.values()));

  const recentScore = Math.min(15, (recent7.length / 5) * 15);

  const score = Math.max(0, Math.min(100, Math.round(
    frequencyScore + streakScore + regularityScore + recentScore,
  )));

  const consistency: ConsistencyScore = {
    score,
    ...scoreLabel(score),
    breakdown: {
      frequency:      Math.round(frequencyScore),
      streak:         Math.round(streakScore),
      regularity:     Math.round(regularityScore),
      recentActivity: Math.round(recentScore),
    },
  };

  // ── Best Study Hours ─────────────────────────────────────────────────────
  // Uses session_start_time exclusively — never studied_at.
  const bestHours = computeBestStudyHours(sessions);

  // ── Burnout Risk ─────────────────────────────────────────────────────────
  const burnout = computeBurnoutRisk(recent7, recent14, cutoff7, bestHours.hasEnoughTimingData);

  // ── Focus Personality ────────────────────────────────────────────────────
  const personality = computePersonality(sessions, bestHours);

  // ── Weekly Report ────────────────────────────────────────────────────────
  const weeklyReport = computeWeeklyReport(sessions, now);

  // ── Recommendations ──────────────────────────────────────────────────────
  const recommendations = generateRecommendations(consistency, burnout, bestHours, weeklyReport);

  return { phase, consistency, burnout, bestHours, personality, weeklyReport, recommendations };
}

// ─── Score label + ring color ────────────────────────────────────────────────

function scoreLabel(score: number): Pick<ConsistencyScore, "label" | "color" | "ringColor"> {
  if (score >= 88) return { label: "Excellent",    color: "text-emerald-400", ringColor: "#10b981" };
  if (score >= 73) return { label: "Strong",       color: "text-brand-400",   ringColor: "#6366f1" };
  if (score >= 56) return { label: "Good",         color: "text-violet-400",  ringColor: "#8b5cf6" };
  if (score >= 40) return { label: "Building",     color: "text-amber-400",   ringColor: "#f59e0b" };
  if (score >= 20) return { label: "Inconsistent", color: "text-orange-400",  ringColor: "#f97316" };
  return               { label: "Starting Out", color: "text-white/40",    ringColor: "#6b7280" };
}

// ─── Regularity ───────────────────────────────────────────────────────────────

function computeRegularityScore(dailyMins: number[]): number {
  if (dailyMins.length < 3) return 10; // not enough data — partial credit
  const mean = dailyMins.reduce((a, b) => a + b, 0) / dailyMins.length;
  if (mean === 0) return 0;
  const variance = dailyMins.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyMins.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation; lower = more regular
  return Math.max(0, Math.min(20, 20 * (1 - cv)));
}

// ─── Burnout Risk ─────────────────────────────────────────────────────────────

function computeBurnoutRisk(
  recent7:  RawSessionForIntelligence[],
  recent14: RawSessionForIntelligence[],
  cutoff7:  Date,
  hasEnoughTimingData: boolean,
): BurnoutRisk {
  const signals: BurnoutSignal[] = [];

  // 1. Marathon session (> 3 h) in the last 7 days — uses duration, always available
  if (recent7.some((s) => s.duration_minutes > 180)) {
    signals.push({
      label: "Marathon sessions",
      description: "Sessions longer than 3h — cognitive fatigue sets in after ~90 min",
    });
  }

  // 2. Late-night study (hour ≥ 22) in the last 7 days.
  //    ONLY use session_start_time — studied_at is noon for manual sessions.
  const timedRecent7 = hasEnoughTimingData ? recent7.filter(hasRealSessionStartTime) : [];
  if (timedRecent7.some((s) => new Date(s.session_start_time!).getHours() >= 22)) {
    signals.push({
      label: "Late-night sessions",
      description: "Studying after 10 PM disrupts sleep and memory consolidation",
    });
  }

  // 3. Post-intensity drop: last 7 days < 50% of previous 7 days (after a heavy period)
  const prev7 = recent14.filter((s) => new Date(s.studied_at) < cutoff7);
  const thisWeekMins = recent7.reduce((a, s) => a + s.duration_minutes, 0);
  const lastWeekMins = prev7.reduce((a, s) => a + s.duration_minutes, 0);
  if (lastWeekMins >= 300 && thisWeekMins < lastWeekMins * 0.5) {
    signals.push({
      label: "Post-intensity drop",
      description: "Study time dropped >50% after a heavy week — a classic burnout pattern",
    });
  }

  // 4. Erratic durations (CV > 0.9) in last 14 days — uses duration, always available
  if (recent14.length >= 4) {
    const durations = recent14.map((s) => s.duration_minutes);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    if (mean > 0) {
      const cv = Math.sqrt(durations.reduce((s, v) => s + (v - mean) ** 2, 0) / durations.length) / mean;
      if (cv > 0.9) {
        signals.push({
          label: "Erratic schedule",
          description: "Highly inconsistent session lengths suggest unsustainable habits",
        });
      }
    }
  }

  // 5. Single day > 6 h in last 7 days — aggregated by date, always available
  const dayMap7 = new Map<string, number>();
  for (const s of recent7) {
    const k = s.studied_at.split("T")[0];
    dayMap7.set(k, (dayMap7.get(k) ?? 0) + s.duration_minutes);
  }
  if (Array.from(dayMap7.values()).some((m) => m > 360)) {
    signals.push({
      label: "Overloaded day",
      description: "6+ hours logged in a single day — your brain needs recovery time",
    });
  }

  const level: BurnoutLevel =
    signals.length >= 3 ? "high"     :
    signals.length >= 1 ? "moderate" :
                          "low";

  const advice =
    level === "high"     ? "Take a rest day — recovery is when learning gets consolidated." :
    level === "moderate" ? "Watch your pace — sustainable habits beat short sprints."        :
                           "Great balance! Keep your current rhythm going.";

  return { level, signals, advice };
}

// ─── Best Study Hours ─────────────────────────────────────────────────────────
//
// USES session_start_time EXCLUSIVELY.
// `studied_at` is deliberately NOT used here because manual sessions set it to
// noon (T12:00:00), which would produce a fake "everyone studies at noon" heatmap.

function computeBestStudyHours(sessions: RawSessionForIntelligence[]): BestStudyHours {
  // Only sessions with a real start time feed the heatmap.
  const timedSessions = sessions.filter(hasRealSessionStartTime);
  const timingDataCount = timedSessions.length;
  const hasEnoughTimingData = timingDataCount >= MIN_TIMED_SESSIONS;

  // Return an empty (but structurally valid) heatmap when data is insufficient.
  if (!hasEnoughTimingData) {
    return {
      peakHour: null,
      peakLabel: "—",
      timingDataCount,
      hasEnoughTimingData: false,
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h, label: formatHourLabel(h), minutes: 0, intensity: 0,
      })),
    };
  }

  const totals = new Array<number>(24).fill(0);
  for (const s of timedSessions) {
    // session_start_time is guaranteed non-null here (filter above)
    totals[new Date(s.session_start_time!).getHours()] += s.duration_minutes;
  }

  const max = Math.max(...totals);
  const peakHour = max > 0 ? totals.indexOf(max) : null;

  const hours: HourData[] = totals.map((minutes, hour) => ({
    hour,
    label:     formatHourLabel(hour),
    minutes,
    intensity: max > 0 ? minutes / max : 0,
  }));

  return {
    peakHour,
    peakLabel: peakHour !== null ? formatHourLabel(peakHour) : "—",
    timingDataCount,
    hasEnoughTimingData: true,
    hours,
  };
}

function formatHourLabel(h: number): string {
  if (h === 0)  return "12am";
  if (h < 12)   return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ─── Focus Personality ────────────────────────────────────────────────────────
//
// Time-based archetypes are ONLY assigned when real timing data is available.
// Without it we return a truthful "not enough timing data" fallback.

function computePersonality(
  sessions: RawSessionForIntelligence[],
  bestHours: BestStudyHours,
): FocusPersonality {
  const { peakHour, hasEnoughTimingData, timingDataCount } = bestHours;

  if (!hasEnoughTimingData) {
    if (timingDataCount === 0) {
      // No timed sessions at all — user hasn't used the live timer yet
      return {
        type:        "Focus Windows Unknown",
        emoji:       "🕐",
        description: "Use the live timer when you study — it tracks your real session times and unlocks your focus personality.",
      };
    }
    // Has some timed sessions but not the minimum
    const needed = MIN_TIMED_SESSIONS - timingDataCount;
    return {
      type:        "Pattern Emerging",
      emoji:       "🌱",
      description: `${needed} more timed session${needed !== 1 ? "s" : ""} to reveal your focus personality. Keep using the live timer.`,
    };
  }

  if (peakHour === null) {
    return {
      type:        "Just Getting Started",
      emoji:       "🌱",
      description: "Log a few more sessions to discover your study personality.",
    };
  }

  if (peakHour >= 5  && peakHour <= 8)  return { type: "Early Bird",         emoji: "🐦", description: "You thrive in the quiet of the early morning." };
  if (peakHour >= 9  && peakHour <= 11) return { type: "Morning Scholar",    emoji: "📚", description: "Fresh morning energy powers your deepest focus." };
  if (peakHour >= 12 && peakHour <= 14) return { type: "Midday Powerhouse",  emoji: "☀️", description: "You harness the energy of the day at its peak." };
  if (peakHour >= 15 && peakHour <= 17) return { type: "Afternoon Achiever", emoji: "💪", description: "Your afternoon focus is your secret weapon." };
  if (peakHour >= 18 && peakHour <= 20) return { type: "Evening Studier",    emoji: "🌆", description: "Evenings are your prime time for deep learning." };
  if (peakHour >= 21 && peakHour <= 23) return { type: "Night Owl",          emoji: "🦉", description: "You come alive when the world goes quiet." };
  return                                       { type: "Midnight Warrior",   emoji: "🌙", description: "You push through when everyone else is asleep." };
}

// ─── Weekly Report ────────────────────────────────────────────────────────────

function computeWeeklyReport(
  sessions: RawSessionForIntelligence[],
  now: Date,
): WeeklyReport {
  const dow = now.getDay();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - dow);
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  const thisMins = sessions
    .filter((s) => new Date(s.studied_at) >= startOfThisWeek)
    .reduce((a, s) => a + s.duration_minutes, 0);

  const lastMins = sessions
    .filter((s) => {
      const d = new Date(s.studied_at);
      return d >= startOfLastWeek && d < startOfThisWeek;
    })
    .reduce((a, s) => a + s.duration_minutes, 0);

  let changePercent = 0;
  let trend: WeeklyReport["trend"] = "flat";

  if (lastMins === 0 && thisMins > 0) {
    trend = "new"; changePercent = 100;
  } else if (lastMins > 0) {
    changePercent = Math.round(((thisMins - lastMins) / lastMins) * 100);
    trend = changePercent > 5 ? "up" : changePercent < -5 ? "down" : "flat";
  }

  return { thisWeekMinutes: thisMins, lastWeekMinutes: lastMins, changePercent, trend };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function generateRecommendations(
  consistency: ConsistencyScore,
  burnout:     BurnoutRisk,
  bestHours:   BestStudyHours,
  weekly:      WeeklyReport,
): string[] {
  const recs: string[] = [];

  if (burnout.level === "high") {
    recs.push("🛑 Take a genuine rest day — recovery is when your brain consolidates everything you've learned.");
  }
  if (burnout.signals.some((s) => s.label === "Late-night sessions")) {
    recs.push("🌙 Shift late-night sessions earlier — sleep is when memories are solidified, not just rested.");
  }
  if (burnout.signals.some((s) => s.label === "Marathon sessions")) {
    recs.push("⏱️ Break long sessions into 90-minute blocks with short breaks — focus quality beats raw hours.");
  }

  if (consistency.score < 40) {
    recs.push("📅 Short daily sessions beat occasional marathons — 30 min every day outperforms 3.5 h once a week.");
  } else if (consistency.breakdown.regularity < 8) {
    recs.push("⏰ Standardise your session lengths — predictable durations build a stronger habit loop.");
  }

  // Only include a peak-hour recommendation when we have real timing data.
  if (bestHours.hasEnoughTimingData && bestHours.peakHour !== null) {
    recs.push(`🎯 Your peak focus window is around ${bestHours.peakLabel} — schedule your hardest material then.`);
  } else if (!bestHours.hasEnoughTimingData) {
    recs.push("⏱️ Use the live timer when you study — it reveals your natural focus windows over time.");
  }

  if (weekly.trend === "down" && Math.abs(weekly.changePercent) > 20) {
    recs.push("📈 Study time dipped this week — set a micro-goal (even 20 min) to rebuild momentum.");
  }

  const fillers = [
    "🔄 Active recall (closing your notes and testing yourself) is 3× more effective than re-reading.",
    "📝 Summarise each session in 3 sentences right after — it locks in key concepts before they fade.",
    "🎵 Instrumental music or brown noise can help students who find silence distracting.",
  ];
  let i = 0;
  while (recs.length < 3 && i < fillers.length) recs.push(fillers[i++]);

  return recs.slice(0, 5);
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function emptyIntelligence(): IntelligenceData {
  return {
    phase: 1,
    consistency: {
      score: 0, label: "Starting Out", color: "text-white/40", ringColor: "#6b7280",
      breakdown: { frequency: 0, streak: 0, regularity: 0, recentActivity: 0 },
    },
    burnout: {
      level: "low", signals: [],
      advice: "Start logging sessions to get your personalised burnout analysis.",
    },
    bestHours: {
      peakHour: null, peakLabel: "—",
      timingDataCount: 0, hasEnoughTimingData: false,
      hours: Array.from({ length: 24 }, (_, h) => ({
        hour: h, label: formatHourLabel(h), minutes: 0, intensity: 0,
      })),
    },
    personality: {
      type: "Focus Windows Unknown", emoji: "🕐",
      description: "Use the live timer when you study to unlock your focus personality.",
    },
    weeklyReport: { thisWeekMinutes: 0, lastWeekMinutes: 0, changePercent: 0, trend: "flat" },
    recommendations: [
      "📅 Log your first study sessions to unlock personalised recommendations.",
      "🎯 Aim for at least 3 sessions this week to see your consistency score build.",
      "🔄 Active recall (testing yourself) is 3× more effective than re-reading.",
    ],
  };
}
