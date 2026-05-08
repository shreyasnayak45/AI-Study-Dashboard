"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/task-utils";
import type { Task } from "@/types";

export type FilterKey = "all" | "active" | "completed" | "overdue";

interface TaskFiltersProps {
  tasks: Task[];
  active: FilterKey;
  onChange: (filter: FilterKey) => void;
}

interface TabDef {
  key: FilterKey;
  label: string;
  count: (tasks: Task[]) => number;
  accentClass: string;
}

const TABS: TabDef[] = [
  {
    key: "all",
    label: "All",
    count: (t) => t.length,
    accentClass: "data-[active=true]:text-white data-[active=true]:bg-white/[0.08]",
  },
  {
    key: "active",
    label: "Active",
    count: (t) => t.filter((x) => !x.completed).length,
    accentClass: "data-[active=true]:text-brand-400 data-[active=true]:bg-brand-500/10",
  },
  {
    key: "completed",
    label: "Completed",
    count: (t) => t.filter((x) => x.completed).length,
    accentClass: "data-[active=true]:text-emerald-400 data-[active=true]:bg-emerald-500/10",
  },
  {
    key: "overdue",
    label: "Overdue",
    count: (t) => t.filter((x) => !x.completed && isOverdue(x.due_date)).length,
    accentClass: "data-[active=true]:text-red-400 data-[active=true]:bg-red-500/10",
  },
];

export const TaskFilters = memo(function TaskFilters({ tasks, active, onChange }: TaskFiltersProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
      {TABS.map((tab) => {
        const count    = tab.count(tasks);
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            data-active={isActive}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
              "text-white/40 hover:text-white/65",
              tab.accentClass
            )}
          >
            {tab.label}
            {count > 0 && (
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                isActive ? "bg-white/10" : "bg-white/[0.05] text-white/30"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** Apply a FilterKey to a task array. */
export function applyFilter(tasks: Task[], filter: FilterKey): Task[] {
  switch (filter) {
    case "active":    return tasks.filter((t) => !t.completed);
    case "completed": return tasks.filter((t) => t.completed);
    case "overdue":   return tasks.filter((t) => !t.completed && isOverdue(t.due_date));
    default:          return tasks;
  }
}
