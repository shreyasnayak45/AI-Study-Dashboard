"use client";

// TrackerClient orchestrates all interactive state on the tracker page:
//   - whether the slide-over form is open
//   - which session (if any) is being edited
//
// It receives the pre-fetched sessions from the Server Component above it,
// so the initial render is instant (no client-side fetch waterfall).
//
// After a create/update/delete, the Server Action calls revalidatePath("/tracker"),
// which causes Next.js to re-run the Server Component and push fresh data down.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SessionCard } from "./SessionCard";
import { SessionForm } from "./SessionForm";
import { LiveLogButton } from "./LiveLogButton";
import { formatDuration } from "@/lib/tracker-utils";
import type { StudySession } from "@/types";

interface TrackerClientProps {
  sessions: StudySession[];
}

export function TrackerClient({ sessions }: TrackerClientProps) {
  const [isFormOpen,     setIsFormOpen]     = useState(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);

  function openAdd() {
    setEditingSession(null);
    setIsFormOpen(true);
  }

  function openEdit(session: StudySession) {
    setEditingSession(session);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingSession(null);
  }

  // Quick summary stats derived from the passed sessions
  const totalMinutesThisWeek = (() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    return sessions
      .filter((s) => new Date(s.studied_at).getTime() >= weekAgo)
      .reduce((sum, s) => sum + s.duration_minutes, 0);
  })();

  const uniqueSubjects = [...new Set(sessions.map((s) => s.subject))].length;

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Study Tracker</h1>
          <p className="mt-1 text-sm text-white/40">
            {sessions.length === 0
              ? "Log your first study session below"
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${uniqueSubjects} subject${uniqueSubjects === 1 ? "" : "s"} · ${formatDuration(totalMinutesThisWeek)} this week`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LiveLogButton />
          <Button onClick={openAdd} className="shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Log session</span>
            <span className="sm:hidden">Log</span>
          </Button>
        </div>
      </div>

      {/* Session grid / empty state */}
      {sessions.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onEdit={openEdit}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Slide-over form */}
      <SessionForm
        isOpen={isFormOpen}
        onClose={closeForm}
        editingSession={editingSession}
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] py-20 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10">
        <BookOpen className="h-7 w-7 text-brand-400" />
      </div>
      <h3 className="text-base font-semibold text-white">No sessions yet</h3>
      <p className="mt-1 max-w-xs text-sm text-white/40">
        Log your first study session to start tracking your progress and building streaks.
      </p>
      <Button onClick={onAdd} className="mt-6" size="sm">
        <Plus className="h-4 w-4" />
        Log your first session
      </Button>
    </motion.div>
  );
}
