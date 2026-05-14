import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { getAnalyticsStats, getRawSessions } from "@/lib/analytics-stats";
import { generateInsights, fmtHours } from "@/lib/analytics-utils";
import { getCachedInsight, isCacheStale } from "@/lib/ai-insights";
import { isAIBackendEnabled } from "@/lib/ai-backend";
import { Card } from "@/components/ui/Card";
import { AnalyticsInsights }    from "@/components/ai/AnalyticsInsights";
import { IntelligenceSection } from "@/components/intelligence/IntelligenceSection";
import {
  Clock, Flame, CheckSquare, CalendarDays, TrendingUp,
  Star, Target, BookOpen, BarChart2, Plus,
} from "lucide-react";
import type { Insight, AnalyticsStats } from "@/types";

// Recharts is ~150KB — code-split so it doesn't block the initial JS parse.
// Components are still SSR'd (HTML arrives with the page), the JS chunk
// for Recharts loads in parallel with the rest of the bundle.
const DailyAreaChart = dynamic(
  () => import("@/components/analytics/DailyAreaChart").then((m) => ({ default: m.DailyAreaChart })),
  { loading: () => <ChartCardSkeleton height={280} /> }
);
const WeeklyBarChart = dynamic(
  () => import("@/components/analytics/WeeklyBarChart").then((m) => ({ default: m.WeeklyBarChart })),
  { loading: () => <ChartCardSkeleton height={280} /> }
);
const SubjectDonutChart = dynamic(
  () => import("@/components/analytics/SubjectDonutChart").then((m) => ({ default: m.SubjectDonutChart })),
  { loading: () => <ChartCardSkeleton height={300} /> }
);

// ─── Async server component — streamed via Suspense ───────────────────────────
// Fetches the AI insight independently so charts + stats render immediately
// from the unstable_cache while this resolves in parallel.
async function AIAnalyticsSection() {
  const initialInsight = await getCachedInsight();
  return <AnalyticsInsights initialInsight={initialInsight} />;
}

function AIInsightsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const aiEnabled = isAIBackendEnabled();

  // Fetch stats, sessions, and today's AI insight in parallel.
  // getCachedInsight is React.cache'd — the AIAnalyticsSection Suspense below
  // calls it again and receives the same in-flight promise for free.
  const [stats, rawSessions, initialInsight] = await Promise.all([
    getAnalyticsStats(),
    getRawSessions(),
    getCachedInsight(),
  ]);
  const insights      = generateInsights(stats);
  // Server-computed: does the cached AI insight need a background refresh?
  const cacheIsStale  = initialInsight ? isCacheStale(initialInsight, rawSessions.length) : false;

  const totalHours   = (stats.totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const monthMinutes = stats.daily.reduce((s, d) => s + d.minutes, 0);
  const monthHours   = (monthMinutes / 60).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="p-4 sm:p-6 lg:p-8">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Analytics</h1>
        <p className="mt-1.5 text-sm text-white/40">
          {stats.totalSessions === 0
            ? "Log study sessions to see your stats here."
            : `${stats.totalSessions} session${stats.totalSessions !== 1 ? "s" : ""} recorded · all-time overview`}
        </p>
      </div>

      {/* ── Stat cards — rendered eagerly, no heavy JS needed ────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticStatCard
          label="Total Study Time"
          value={`${totalHours}h`}
          sub={stats.totalSessions > 0 ? `${stats.totalSessions} sessions` : "None yet"}
          icon={Clock}
          iconBg="bg-brand-500/10" iconColor="text-brand-400"
          positive={stats.totalMinutes > 0}
        />
        <AnalyticStatCard
          label="This Month"
          value={`${monthHours}h`}
          sub={stats.activeDays > 0 ? `${stats.activeDays} active days` : "No sessions yet"}
          icon={CalendarDays}
          iconBg="bg-violet-500/10" iconColor="text-violet-400"
          positive={monthMinutes > 0}
        />
        <AnalyticStatCard
          label="Study Streak"
          value={stats.streak > 0 ? `${stats.streak} day${stats.streak !== 1 ? "s" : ""}` : "0 days"}
          sub={
            stats.longestStreak > 0
              ? `Best: ${stats.longestStreak} day${stats.longestStreak !== 1 ? "s" : ""}`
              : "Start studying today"
          }
          icon={Flame}
          iconBg="bg-orange-500/10" iconColor="text-orange-400"
          positive={stats.streak > 0}
        />
        <AnalyticStatCard
          label="Task Completion"
          value={stats.tasksTotal > 0 ? `${stats.taskCompletionRate}%` : "—"}
          sub={
            stats.tasksTotal > 0
              ? `${stats.tasksCompleted} / ${stats.tasksTotal} tasks`
              : "Add tasks to track"
          }
          icon={CheckSquare}
          iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
          positive={stats.taskCompletionRate >= 50}
        />
      </div>

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {stats.totalSessions === 0 ? (
        <EmptyAnalytics />
      ) : (
        <>
          {/* ── Charts row 1 ─────────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DailyAreaChart data={stats.daily} />
            </div>
            <div>
              <SubjectDonutChart data={stats.subjects} totalMinutes={stats.totalMinutes} />
            </div>
          </div>

          {/* ── Charts row 2 ─────────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <WeeklyBarChart data={stats.weekly} />
            <PerformanceCard stats={stats} />
          </div>

          {/* ── Study Intelligence ───────────────────────────────────── */}
          <div className="mt-8">
            <IntelligenceSection
              sessions={rawSessions}
              initialAiInsight={initialInsight?.content?.intelligence ?? null}
              aiEnabled={aiEnabled}
              cacheIsStale={cacheIsStale}
            />
          </div>

          {/* ── Static insights ──────────────────────────────────────── */}
          {insights.length > 0 && (
            <InsightsSection insights={insights} />
          )}

          {/* ── AI Analysis — streams in independently via Suspense ───── */}
          <div className="mt-8">
            <Suspense fallback={<AIInsightsSkeleton />}>
              <AIAnalyticsSection />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function ChartCardSkeleton({ height }: { height: number }) {
  return (
    <div
      className="animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
      style={{ height }}
    />
  );
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function AnalyticStatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, positive,
}: {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string; positive: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-white/35">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          <p className={`mt-1 text-xs font-medium ${positive ? "text-emerald-400" : "text-white/35"}`}>{sub}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );
}

function PerformanceCard({ stats }: { stats: AnalyticsStats }) {
  const rows = [
    {
      label: "Best single day",
      value: stats.bestDayMinutes > 0 ? fmtHours(stats.bestDayMinutes) : "—",
    },
    {
      label: "Longest streak",
      value: stats.longestStreak > 0
        ? `${stats.longestStreak} day${stats.longestStreak !== 1 ? "s" : ""}`
        : "—",
    },
    {
      label: "Daily average",
      value: stats.avgDailyMinutes > 0 ? fmtHours(stats.avgDailyMinutes) : "—",
    },
    {
      label: "Active study days",
      value: stats.activeDays > 0 ? `${stats.activeDays} days` : "—",
    },
  ];

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Performance Stats
      </p>
      <div className="space-y-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/50">{label}</span>
            <span className="text-sm font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>
      {stats.tasksTotal > 0 && (
        <>
          <div className="my-4 border-t border-white/[0.06]" />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Tasks completed</span>
              <span className="font-semibold text-white">
                {stats.tasksCompleted} / {stats.tasksTotal}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${stats.taskCompletionRate}%` }}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

const ICON_MAP: Record<Insight["icon"], React.ComponentType<{ className?: string }>> = {
  flame:          Flame,
  target:         Target,
  "trending-up":  TrendingUp,
  star:           Star,
  calendar:       CalendarDays,
  "book-open":    BookOpen,
};

const COLOR_MAP: Record<Insight["color"], { bg: string; icon: string; title: string }> = {
  brand:   { bg: "bg-brand-500/10",   icon: "text-brand-400",   title: "text-brand-300"   },
  emerald: { bg: "bg-emerald-500/10", icon: "text-emerald-400", title: "text-emerald-300" },
  orange:  { bg: "bg-orange-500/10",  icon: "text-orange-400",  title: "text-orange-300"  },
  violet:  { bg: "bg-violet-500/10",  icon: "text-violet-400",  title: "text-violet-300"  },
  red:     { bg: "bg-red-500/10",     icon: "text-red-400",     title: "text-red-300"     },
};

function InsightsSection({ insights }: { insights: Insight[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
        Insights
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => {
          const Icon   = ICON_MAP[insight.icon];
          const colors = COLOR_MAP[insight.color];
          return (
            <Card key={insight.key} className="p-4">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${colors.bg}`}>
                <Icon className={`h-5 w-5 ${colors.icon}`} />
              </div>
              <p className={`text-sm font-semibold ${colors.title}`}>{insight.title}</p>
              <p className="mt-1 text-xs text-white/40">{insight.description}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function EmptyAnalytics() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
        <BarChart2 className="h-7 w-7 text-brand-400" />
      </div>
      <h3 className="text-base font-semibold text-white">No data yet</h3>
      <p className="mt-1 max-w-xs text-sm text-white/40">
        Log study sessions in the Tracker to see charts, streaks, and insights here.
      </p>
      <Link
        href="/tracker"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-400 transition-colors hover:bg-brand-500/20"
      >
        <Plus className="h-4 w-4" /> Log first session
      </Link>
    </div>
  );
}
