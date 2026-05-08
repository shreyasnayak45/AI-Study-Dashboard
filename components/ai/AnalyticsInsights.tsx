"use client";

import { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { getOrGenerateInsight, refreshInsight } from "@/app/actions/ai";
import type { AIDailyInsight } from "@/types";

interface AnalyticsInsightsProps {
  initialInsight: AIDailyInsight | null;
}

export function AnalyticsInsights({ initialInsight }: AnalyticsInsightsProps) {
  const [insight, setInsight]        = useState(initialInsight);
  const [error,   setError]          = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!initialInsight) {
      startTransition(async () => {
        const result = await getOrGenerateInsight();
        if (result.success && result.insight) {
          setInsight(result.insight);
        } else if (!result.success) {
          setError(result.error ?? "Generation failed");
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshInsight();
      if (result.success && result.insight) {
        setInsight(result.insight);
      } else {
        setError(result.error ?? "Refresh failed");
      }
    });
  }

  const timeAgo = insight ? formatTimeAgo(new Date(insight.generated_at)) : null;

  return (
    <section>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-brand-400" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            AI Analysis
          </span>
          {timeAgo && !isPending && (
            <span className="text-[10px] text-white/20">· {timeAgo}</span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh analysis"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/55 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* Loading skeleton */}
        {!insight && (isPending || !error) && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {/* Summary line */}
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/[0.06]" />
            {/* Observation cards */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-[84px] animate-pulse rounded-xl bg-white/[0.03]"
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Refreshing over existing insight */}
        {isPending && insight && (
          <motion.div
            key="refreshing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="opacity-40"
          >
            <InsightBody insight={insight} />
          </motion.div>
        )}

        {/* Insight content */}
        {!isPending && insight && (
          <motion.div
            key={insight.generated_at}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <InsightBody insight={insight} />
          </motion.div>
        )}

        {/* Error state */}
        {!isPending && !insight && error && (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-white/25"
          >
            {error}
          </motion.p>
        )}

      </AnimatePresence>
    </section>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function InsightBody({ insight }: { insight: AIDailyInsight }) {
  const { summary, observations } = insight.content.analytics;
  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-white/55">{summary}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {observations.map((text, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
          >
            <div className="mb-2 h-0.5 w-8 rounded-full bg-brand-400/40" />
            <p className="text-xs leading-relaxed text-white/45">{text}</p>
          </motion.div>
        ))}
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diffMs   = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins <  1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return "earlier today";
}
