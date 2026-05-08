"use client";

import { memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card } from "@/components/ui/Card";
import type { WeeklyStudyData } from "@/types";

interface TooltipPayload {
  value: number;
  payload: WeeklyStudyData;
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
      <p className="mb-1 text-white/50">Week of {d.label}</p>
      <p className="font-semibold text-white">
        {d.hours > 0 ? `${d.hours}h` : "No study"}
      </p>
      {d.minutes > 0 && (
        <p className="text-white/40">{d.minutes} min total</p>
      )}
    </div>
  );
}

export const WeeklyBarChart = memo(function WeeklyBarChart({ data }: { data: WeeklyStudyData[] }) {
  const maxHours    = Math.max(...data.map((d) => d.hours), 1);
  const tickInterval = Math.ceil(data.length / 4) - 1;

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Weekly Trend — Last 12 Weeks
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff06" }} />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.minutes > 0 ? "#6366f1" : "#ffffff0d"}
                opacity={entry.minutes > 0 ? (i === data.length - 1 ? 1 : 0.75) : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
});
