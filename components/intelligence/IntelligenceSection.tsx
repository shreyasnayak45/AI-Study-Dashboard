"use client";

/**
 * Thin client-component shell whose only job is to host the ssr:false dynamic
 * import. next/dynamic with ssr:false is not allowed in Server Components — it
 * must live in a "use client" file.
 *
 * Passes aiEnabled and initialAiInsight straight through to IntelligenceDashboard
 * so it can hydrate immediately with cached AI text (no loading flash on repeat
 * visits) or auto-generate on first visit.
 */

import dynamic from "next/dynamic";
import type { RawSessionForIntelligence, AIIntelligenceInsight } from "@/types";

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {/* Section header placeholder */}
      <div className="h-7 w-40 animate-pulse rounded-lg bg-white/[0.04]" />
      {/* Row 1: 3 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[192, 160, 160].map((h, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            style={{ height: h }}
          />
        ))}
      </div>
      {/* Row 2: heatmap */}
      <div className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
      {/* Row 3: 2 cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[160, 160].map((h, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}

const IntelligenceDashboard = dynamic(
  () =>
    import("@/components/intelligence/IntelligenceDashboard").then((m) => ({
      default: m.IntelligenceDashboard,
    })),
  { ssr: false, loading: () => <Skeleton /> }
);

interface Props {
  sessions:         RawSessionForIntelligence[];
  initialAiInsight: AIIntelligenceInsight | null;
  aiEnabled:        boolean;
  cacheIsStale:     boolean;
}

export function IntelligenceSection({ sessions, initialAiInsight, aiEnabled, cacheIsStale }: Props) {
  return (
    <IntelligenceDashboard
      sessions={sessions}
      initialAiInsight={initialAiInsight}
      aiEnabled={aiEnabled}
      cacheIsStale={cacheIsStale}
    />
  );
}
