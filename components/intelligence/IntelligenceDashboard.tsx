"use client";

/**
 * IntelligenceDashboard — client-only (loaded with ssr:false in IntelligenceSection).
 *
 * WHY ssr:false?
 * ──────────────
 * computeIntelligence calls new Date(s.studied_at).getHours() for the 24-hour
 * heatmap and burnout detection. On the server this returns UTC hours; in the
 * browser it returns the user's local hours. ssr:false guarantees correct timezone.
 *
 * PERFORMANCE MODEL — "show instantly, update silently"
 * ──────────────────────────────────────────────────────
 * Rule-based content (ring score, heatmap, fallback text) renders immediately
 * on mount with NO skeletons. Gemini text arrives in the background and swaps
 * in with no layout shift. The only loading indicator is a tiny spinner in the
 * section header. Users always see a complete, usable UI.
 *
 * Auto-trigger logic (runs once on mount via useEffect):
 *   - No cache → getOrGenerateInsight() runs in background; rule-based shown
 *   - Stale cache → refreshInsight() runs in background; stale AI text shown
 *   - Fresh cache → render immediately; no Gemini call needed
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ConsistencyRing } from "@/components/intelligence/ConsistencyRing";
import { BurnoutCard }     from "@/components/intelligence/BurnoutCard";
import { HourlyHeatmap }   from "@/components/intelligence/HourlyHeatmap";
import { computeIntelligence } from "@/lib/intelligence";
import { fmtHours } from "@/lib/analytics-utils";
import { getOrGenerateInsight, refreshInsight } from "@/app/actions/ai";
import type {
  RawSessionForIntelligence,
  WeeklyReport,
  AIIntelligenceInsight,
} from "@/types";

interface Props {
  sessions:         RawSessionForIntelligence[];
  initialAiInsight: AIIntelligenceInsight | null;
  aiEnabled:        boolean;
  cacheIsStale:     boolean;  // server-computed; triggers silent background refresh
}

export function IntelligenceDashboard({
  sessions,
  initialAiInsight,
  aiEnabled,
  cacheIsStale,
}: Props) {
  const [aiInsight,  setAiInsight]     = useState<AIIntelligenceInsight | null>(initialAiInsight);
  const [aiError,    setAiError]       = useState<string | null>(null);
  const [isPending,  startTransition]  = useTransition();

  // Rule-based data — always computed; drives ALL visual components.
  const intel = useMemo(() => computeIntelligence(sessions), [sessions]);
  const { consistency, burnout, bestHours, weeklyReport } = intel;

  // Auto-trigger: runs once on mount, never blocks render.
  useEffect(() => {
    if (!aiEnabled) return;

    if (!aiInsight) {
      // First visit of the day — no cache yet. Generate in background;
      // rule-based content remains fully visible while we wait.
      startTransition(async () => {
        const result = await getOrGenerateInsight();
        if (result.success && result.insight?.content?.intelligence) {
          setAiInsight(result.insight.content.intelligence);
        }
        // Silently swallow errors — rule-based fallback stays.
      });
    } else if (cacheIsStale) {
      // Cache exists but is stale (5+ new sessions since last generation).
      // Refresh silently while continuing to show the existing AI text.
      startTransition(async () => {
        const result = await refreshInsight();
        if (result.success && result.insight?.content?.intelligence) {
          setAiInsight(result.insight.content.intelligence);
        }
      });
    }
    // Empty deps: intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleManualRefresh() {
    setAiError(null);
    startTransition(async () => {
      const result = await refreshInsight();
      if (result.success && result.insight?.content?.intelligence) {
        setAiInsight(result.insight.content.intelligence);
      } else if (!result.success) {
        setAiError(result.error ?? "Refresh failed — try again shortly.");
      }
    });
  }

  // Shorthand resolved values
  const aiConsistency = aiInsight?.consistencyNarrative ?? null;
  const aiWeekly      = aiInsight?.weeklyNarrative      ?? null;
  const aiRecs        = aiInsight?.recommendations      ?? null;

  return (
    <section>
      {/* ── Section header ── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15">
            <Zap className="h-3.5 w-3.5 text-brand-400" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Study Intelligence
          </h2>

          {/* Subtle status indicator — never blocks content */}
          {aiEnabled && isPending && (
            <span className="flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/25">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              {aiInsight ? "Updating" : "Analysing"}
            </span>
          )}
          {aiEnabled && aiInsight && !isPending && (
            <span className="flex items-center gap-1 text-[10px] text-white/18">
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </span>
          )}
        </div>

        {aiEnabled && (
          <button
            onClick={handleManualRefresh}
            disabled={isPending}
            title="Refresh AI analysis"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/55 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </div>

      {/* ── Motivational banner — only when AI text is ready, 0 height otherwise ── */}
      {aiInsight?.motivationalMessage && !isPending && (
        <div className="mb-4 rounded-xl border border-brand-500/10 bg-brand-500/[0.04] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/60">
            {aiInsight.motivationalMessage}
          </p>
        </div>
      )}

      {/* ── Row 1: Consistency · Burnout · Personality ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConsistencyRing
          consistency={consistency}
          aiLabel={aiConsistency?.label}
          aiTagline={aiConsistency?.tagline}
        />
        <BurnoutCard
          burnout={burnout}
          aiAnalysis={aiInsight?.burnoutAnalysis ?? null}
        />
        {/* Personality — always renders; AI text updates in place */}
        <PersonalityCard
          ai={aiInsight?.personality ?? null}
          fallback={intel.personality}
          peakLabel={bestHours.peakLabel}
        />
      </div>

      {/* ── Row 2: Heatmap ── */}
      <div className="mt-4">
        <HourlyHeatmap bestHours={bestHours} />
      </div>

      {/* ── Row 3: Weekly report · Recommendations ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WeeklyReportCard report={weeklyReport} aiNarrative={aiWeekly} />
        <RecommendationsCard aiRecs={aiRecs} fallbackRecs={intel.recommendations} />
      </div>

      {aiError && (
        <p className="mt-3 text-center text-xs text-white/25">{aiError}</p>
      )}
    </section>
  );
}

// ─── Personality card ─────────────────────────────────────────────────────────

function PersonalityCard({
  ai,
  fallback,
  peakLabel,
}: {
  ai:        AIIntelligenceInsight["personality"] | null;
  fallback:  { type: string; emoji: string; description: string };
  peakLabel: string;
}) {
  // Always show content — AI text replaces fallback when it arrives
  const emoji       = ai?.emoji   || fallback.emoji;
  const type        = ai?.type    || fallback.type;
  const tagline     = ai?.tagline ?? null;
  const description = ai?.insight || fallback.description;

  return (
    <Card className="flex flex-col p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Focus Personality
      </p>
      <div className="flex flex-1 flex-col items-center justify-center py-2 text-center">
        <span className="text-4xl" aria-hidden="true">{emoji}</span>
        <p className="mt-3 text-base font-bold text-white">{type}</p>
        {tagline && (
          <p className="mt-0.5 text-xs font-medium text-brand-400/80">{tagline}</p>
        )}
        <p className="mt-2 max-w-[200px] text-xs leading-relaxed text-white/45">
          {description}
        </p>
        {peakLabel !== "—" && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span className="text-xs font-medium text-brand-400">Peak: {peakLabel}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Weekly report card ───────────────────────────────────────────────────────

function WeeklyReportCard({
  report,
  aiNarrative,
}: {
  report:      WeeklyReport;
  aiNarrative: string | null;
}) {
  const { thisWeekMinutes, lastWeekMinutes, changePercent, trend } = report;

  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-white/40";
  const trendBg    = trend === "up" ? "bg-emerald-500/10" : trend === "down" ? "bg-red-500/10" : "bg-white/[0.04]";
  const maxMins    = Math.max(thisWeekMinutes, lastWeekMinutes, 1);

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        This Week vs Last Week
      </p>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-white">{fmtHours(thisWeekMinutes)}</p>
          <p className="mt-0.5 text-xs text-white/35">this week</p>
        </div>
        {trend === "new" ? (
          <div className="rounded-full bg-brand-500/10 px-3 py-1.5">
            <span className="text-xs font-semibold text-brand-400">First week</span>
          </div>
        ) : trend !== "flat" ? (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${trendBg}`}>
            <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
            <span className={`text-sm font-semibold ${trendColor}`}>
              {trend === "up" ? "+" : ""}{changePercent}%
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        <CompareBar label="This week" minutes={thisWeekMinutes} max={maxMins} color="bg-brand-500"  />
        <CompareBar label="Last week" minutes={lastWeekMinutes} max={maxMins} color="bg-white/20" />
      </div>

      {/* AI narrative appears below the bars when ready — no layout shift */}
      {aiNarrative && (
        <p className="mt-4 border-t border-white/[0.05] pt-3 text-xs leading-relaxed text-white/40">
          {aiNarrative}
        </p>
      )}
    </Card>
  );
}

function CompareBar({ label, minutes, max, color }: { label: string; minutes: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-white/40">{label}</span>
        <span className="text-xs font-semibold text-white/70">{fmtHours(minutes)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${max > 0 ? (minutes / max) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

// ─── Recommendations card ─────────────────────────────────────────────────────

type AIRec = { emoji: string; title: string; detail: string };

function RecommendationsCard({
  aiRecs,
  fallbackRecs,
}: {
  aiRecs:       AIRec[] | null;
  fallbackRecs: string[];
}) {
  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Personalised Recommendations
      </p>
      {aiRecs ? (
        <ul className="space-y-4">
          {aiRecs.map((rec, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">{rec.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/70">{rec.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/40">{rec.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {fallbackRecs.map((rec, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-sm leading-none" aria-hidden="true">{rec.charAt(0)}</span>
              <p className="text-xs leading-relaxed text-white/55">{rec.slice(2)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
