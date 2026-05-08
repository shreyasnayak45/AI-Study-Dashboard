"use client";

import { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getOrGenerateInsight, refreshInsight } from "@/app/actions/ai";
import type { AIDailyInsight } from "@/types";

interface InsightsCardProps {
  /** Pre-fetched server-side cache — null on first visit of the day. */
  initialInsight: AIDailyInsight | null;
}

export function InsightsCard({ initialInsight }: InsightsCardProps) {
  const [insight, setInsight]     = useState(initialInsight);
  const [error,   setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-generate on first visit of the day (when no server-side cache exists)
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
    <Card className="overflow-hidden">
      {/* ── Header row ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-brand-400" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            AI Insights
          </span>
          {timeAgo && !isPending && (
            <span className="text-[10px] text-white/20">· {timeAgo}</span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isPending}
          title="Refresh insights"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/55 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
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
              <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-white/[0.07]" />
              <div className="space-y-2 pt-0.5">
                <div className="h-2.5 w-full    animate-pulse rounded-full bg-white/[0.04]" />
                <div className="h-2.5 w-[85%]   animate-pulse rounded-full bg-white/[0.04]" />
                <div className="h-2.5 w-[70%]   animate-pulse rounded-full bg-white/[0.04]" />
              </div>
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
              <p className="mb-3 text-sm font-semibold text-white/85">
                {insight.content.dashboard.headline}
              </p>
              <ul className="space-y-2">
                {insight.content.dashboard.insights.map((text, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-white/50">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-brand-400/50" />
                    {text}
                  </li>
                ))}
              </ul>
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
              <p className="mb-3 text-sm font-semibold text-white/85">
                {insight.content.dashboard.headline}
              </p>
              <ul className="space-y-2">
                {insight.content.dashboard.insights.map((text, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-white/50">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-brand-400/50" />
                    {text}
                  </li>
                ))}
              </ul>
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
      </div>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diffMs   = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins <  1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return "earlier today";
}
