import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTrackerStats, formatDuration, formatStudyDate } from "@/lib/tracker-stats";
import { getTaskStats } from "@/lib/task-stats";
import { getCachedInsight } from "@/lib/ai-insights";
import { isAIEnabled } from "@/lib/gemini";
import { Card } from "@/components/ui/Card";
import { SubjectBadge } from "@/components/tracker/SubjectBadge";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { MiniWeeklyChart } from "@/components/analytics/MiniWeeklyChart";
import { InsightsCard } from "@/components/ai/InsightsCard";
import { LiveLogButton } from "@/components/tracker/LiveLogButton";
import { formatDueDate, dueDateStyle } from "@/lib/task-utils";
import {
  Clock, BookOpen, Flame, CheckSquare,
  ArrowRight, Plus, Calendar, AlertCircle, BarChart2,
} from "lucide-react";

export default async function DashboardPage() {
  const aiEnabled = isAIEnabled();

  const [{ data: { user } }, trackerStats, taskStats, initialInsight] = await Promise.all([
    createClient().then((sb) => sb.auth.getUser()),
    getTrackerStats(),
    getTaskStats(),
    aiEnabled ? getCachedInsight() : Promise.resolve(null),
  ]);
  const miniData = trackerStats.miniData;

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";
  const hour      = new Date().getHours();
  const greeting  =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const todayHours = (trackerStats.todayMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const weekHours  = (trackerStats.weekMinutes  / 60).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="p-4 sm:p-6 lg:p-8">

      {/* ── Welcome ───────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1.5 text-sm text-white/40">
            {trackerStats.totalSessions === 0 && taskStats.total === 0
              ? "Your dashboard is ready — log a session or add a task to get started."
              : buildSubtitle(trackerStats.totalSessions, weekHours, taskStats.active, taskStats.overdue)}
          </p>
        </div>
        <LiveLogButton />
      </div>

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Study Hours Today"
          value={`${todayHours}h`}
          sub={trackerStats.todayMinutes > 0 ? `${trackerStats.todayMinutes} min logged` : "Log a session →"}
          icon={Clock}
          iconBg="bg-brand-500/10"
          iconColor="text-brand-400"
          positive={trackerStats.todayMinutes > 0}
          href="/tracker"
        />
        <StatCard
          label="This Week"
          value={`${weekHours}h`}
          sub={trackerStats.weekMinutes > 0 ? `${formatDuration(trackerStats.weekMinutes)} total` : "Nothing yet"}
          icon={BookOpen}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-400"
          positive={trackerStats.weekMinutes > 0}
          href="/tracker"
        />
        <StatCard
          label="Study Streak"
          value={trackerStats.streak === 0 ? "0 days" : `${trackerStats.streak} day${trackerStats.streak === 1 ? "" : "s"}`}
          sub={trackerStats.streak > 0 ? "Keep it up! 🔥" : "Study today to start"}
          icon={Flame}
          iconBg="bg-orange-500/10"
          iconColor="text-orange-400"
          positive={trackerStats.streak > 0}
          href="/tracker"
        />
        <StatCard
          label="Tasks"
          value={taskStats.total === 0 ? "—" : `${taskStats.completed} / ${taskStats.total}`}
          sub={
            taskStats.overdue > 0
              ? `${taskStats.overdue} overdue ⚠️`
              : taskStats.active > 0
              ? `${taskStats.active} remaining`
              : taskStats.total > 0
              ? "All done! 🎉"
              : "Add tasks →"
          }
          icon={CheckSquare}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
          positive={taskStats.total > 0 && taskStats.overdue === 0}
          href="/tasks"
        />
      </div>

      {/* ── AI Insights ───────────────────────────────────────────── */}
      {aiEnabled && (
        <div className="mt-6">
          <InsightsCard initialInsight={initialInsight} />
        </div>
      )}

      {/* ── Two-column lower section ──────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Recent study sessions */}
        <section>
          <SectionHeader title="Recent sessions" href="/tracker" linkLabel="View all" />
          {trackerStats.recentSessions.length === 0 ? (
            <EmptySection
              icon={<BookOpen className="h-5 w-5 text-brand-400" />}
              iconBg="bg-brand-500/10"
              message="No sessions logged yet"
              sub="Head to the Tracker to record one."
              cta="Log first session"
              href="/tracker"
            />
          ) : (
            <div className="space-y-2">
              {trackerStats.recentSessions.map((s) => (
                <Card key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                  <SubjectBadge subject={s.subject} />
                  <div className="flex flex-1 items-center gap-3 overflow-hidden">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white">
                      <Clock className="h-3.5 w-3.5 text-white/30" />
                      {formatDuration(s.duration_minutes)}
                    </span>
                    {s.notes && (
                      <span className="hidden truncate text-xs text-white/35 sm:block">{s.notes}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-white/30">{formatStudyDate(s.studied_at)}</span>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming tasks */}
        <section>
          <SectionHeader title="Upcoming tasks" href="/tasks" linkLabel="View all" />
          {taskStats.upcomingTasks.length === 0 ? (
            taskStats.active > 0 ? (
              // Tasks exist but none have due dates
              <Card className="px-5 py-4">
                <p className="text-sm text-white/50">
                  {taskStats.active} active task{taskStats.active !== 1 ? "s" : ""} — none have due dates yet.
                </p>
                <Link href="/tasks" className="mt-1 block text-xs text-brand-400 hover:text-brand-300">
                  Set due dates →
                </Link>
              </Card>
            ) : (
              <EmptySection
                icon={<CheckSquare className="h-5 w-5 text-emerald-400" />}
                iconBg="bg-emerald-500/10"
                message="No upcoming tasks"
                sub="Add tasks with due dates to see them here."
                cta="Add first task"
                href="/tasks"
              />
            )
          ) : (
            <div className="space-y-2">
              {taskStats.upcomingTasks.map((t) => {
                const dueLabel = formatDueDate(t.due_date);
                const style    = dueDateStyle(t.due_date, t.completed);
                return (
                  <Card key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                    <PriorityBadge priority={t.priority} />
                    <span className="flex-1 truncate text-sm text-white/80">{t.title}</span>
                    {dueLabel && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${style.bg} ${style.text}`}>
                        {dueLabel}
                      </span>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Overdue alert banner */}
          {taskStats.overdue > 0 && (
            <Link href="/tasks" className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 transition-colors hover:bg-red-500/15">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>
                <strong className="font-semibold">{taskStats.overdue}</strong> task
                {taskStats.overdue !== 1 ? "s are" : " is"} overdue
              </span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-red-400" />
            </Link>
          )}
        </section>
      </div>

      {/* ── Mini weekly chart ─────────────────────────────────────── */}
      <div className="mt-6">
        <SectionHeader title="Study this week" href="/analytics" linkLabel="Full analytics" />
        <Card className="px-5 py-4">
          {trackerStats.weekMinutes > 0 ? (
            <>
              <MiniWeeklyChart data={miniData} />
              <p className="mt-2 text-xs text-white/30">
                {miniData.filter((d) => d.minutes > 0).length} active day{miniData.filter((d) => d.minutes > 0).length !== 1 ? "s" : ""} this week
                <span className="mx-1.5 text-white/15">·</span>
                {(trackerStats.weekMinutes / 60).toFixed(1).replace(/\.0$/, "")}h total
              </p>
            </>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10">
                <BarChart2 className="h-4.5 w-4.5 text-brand-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">No sessions this week yet</p>
                <Link href="/tracker" className="text-xs text-brand-400 hover:text-brand-300">
                  Log a session →
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSubtitle(sessions: number, weekHours: string, active: number, overdue: number): string {
  const parts: string[] = [];
  if (sessions > 0) parts.push(`${weekHours}h studied this week`);
  if (active  > 0)  parts.push(`${active} task${active !== 1 ? "s" : ""} remaining`);
  if (overdue > 0)  parts.push(`${overdue} overdue ⚠️`);
  return parts.join(" · ") || "Let's make today count.";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string; positive: boolean; href: string;
}

function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor, positive, href }: StatCardProps) {
  return (
    <Link href={href}>
      <Card className="p-5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]">
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
    </Link>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">{title}</h2>
      <Link href={href} className="flex items-center gap-1 text-xs text-brand-400 transition-colors hover:text-brand-300">
        {linkLabel} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function EmptySection({
  icon, iconBg, message, sub, cta, href,
}: {
  icon: React.ReactNode; iconBg: string; message: string; sub: string; cta: string; href: string;
}) {
  return (
    <Card className="p-6 text-center">
      <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl ${iconBg}`}>{icon}</div>
      <p className="text-sm font-medium text-white/60">{message}</p>
      <p className="mt-0.5 text-xs text-white/35">{sub}</p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/20"
      >
        <Plus className="h-3.5 w-3.5" /> {cta}
      </Link>
    </Card>
  );
}
