"use client";

import { memo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { CHART_COLORS, fmtHours } from "@/lib/analytics-utils";
import type { SubjectData } from "@/types";

interface TooltipPayload {
  value: number;
  payload: SubjectData;
}

function CustomTooltip({
  active, payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d0d14] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white">{d.subject}</p>
      <p className="mt-0.5 text-white/50">{fmtHours(d.minutes)} · {d.percentage}%</p>
      <p className="text-white/35">{d.sessions} session{d.sessions !== 1 ? "s" : ""}</p>
    </div>
  );
}

export const SubjectDonutChart = memo(function SubjectDonutChart({
  data, totalMinutes,
}: {
  data: SubjectData[];
  totalMinutes: number;
}) {
  if (data.length === 0) {
    return (
      <Card className="flex h-full min-h-[280px] flex-col items-center justify-center p-5 text-center">
        <p className="text-sm font-medium text-white/40">No subject data yet</p>
        <p className="mt-1 text-xs text-white/25">Log sessions to see distribution.</p>
      </Card>
    );
  }

  const totalHours  = (totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const displayData = data.slice(0, 8);

  return (
    <Card className="p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
        Subject Distribution
      </p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={displayData}
              dataKey="minutes"
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={88}
              paddingAngle={2}
              strokeWidth={0}
            >
              {displayData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white">{totalHours}h</span>
          <span className="text-[10px] text-white/35 uppercase tracking-wider">total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 space-y-1.5">
        {displayData.map((item, i) => (
          <div key={item.subject} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate text-white/60">{item.subject}</span>
            <span className="shrink-0 font-medium text-white/80">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
});
