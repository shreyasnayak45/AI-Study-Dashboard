"use client";

import { memo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/Card";
import type { DailyStudyData } from "@/types";

interface Props {
  data: DailyStudyData[];
  goalMinutes?: number;
}

interface TooltipPayload {
  value: number;
  payload: DailyStudyData;
}

// Defined outside the component — stable reference, no re-creation on render
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
      <p className="mb-1 text-white/50">{d.label}</p>
      <p className="font-semibold text-white">
        {d.hours > 0 ? `${d.hours}h` : "No study"}
      </p>
      {d.minutes > 0 && (
        <p className="text-white/40">{d.minutes} min</p>
      )}
    </div>
  );
}

export const DailyAreaChart = memo(function DailyAreaChart({ data, goalMinutes }: Props) {
  const maxHours = Math.max(...data.map((d) => d.hours), goalMinutes ? goalMinutes / 60 : 0, 1);
  const goalHours = goalMinutes ? Math.round((goalMinutes / 60) * 10) / 10 : undefined;
  const tickInterval = Math.ceil(data.length / 6);

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Daily Study Hours — Last 30 Days
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fill: "#ffffff40", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            domain={[0, maxHours]}
            tick={{ fill: "#ffffff40", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}h`}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#ffffff15", strokeWidth: 1 }} />

          {goalHours !== undefined && (
            <ReferenceLine
              y={goalHours}
              stroke="#6366f1"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              label={{ value: "Goal", fill: "#6366f1", fontSize: 10, position: "insideTopRight" }}
            />
          )}

          <Area
            type="monotone"
            dataKey="hours"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#studyGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
});
