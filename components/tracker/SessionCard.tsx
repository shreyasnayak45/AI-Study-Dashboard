"use client";

import { memo, useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Trash2, Clock, FileText, AlertTriangle, X } from "lucide-react";
import { SubjectBadge } from "./SubjectBadge";
import { deleteSession } from "@/app/actions/tracker";
import { formatDuration, formatStudyDate } from "@/lib/tracker-utils";
import { useLongPress } from "@/hooks/useLongPress";
import { useTouchDevice } from "@/hooks/useTouchDevice";
import type { StudySession } from "@/types";

interface SessionCardProps {
  session: StudySession;
  onEdit: (session: StudySession) => void;
}

export const SessionCard = memo(function SessionCard({ session, onEdit }: SessionCardProps) {
  const isTouch = useTouchDevice();
  const cardRef = useRef<HTMLDivElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [isPending,     startTransition]  = useTransition();
  const [deleteError,   setDeleteError]   = useState("");

  // ── Long-press (touch only) ───────────────────────────────────────────────
  const { handlers: lpHandlers, isPressing } = useLongPress(() => {
    setMobileOpen(true);
  });

  // Dismiss mobile action bar when tapping outside the card
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    return () => document.removeEventListener("touchstart", handler);
  }, [mobileOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleDelete() {
    setDeleteError("");
    startTransition(async () => {
      const result = await deleteSession(session.id);
      if (!result.success) {
        setDeleteError(result.error ?? "Delete failed");
        setConfirmDelete(false);
      }
      // On success revalidatePath re-renders the page — card disappears automatically
    });
  }

  function handleEdit() {
    setMobileOpen(false);
    onEdit(session);
  }

  function handleDeleteRequest() {
    setMobileOpen(false);
    setConfirmDelete(true);
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        // Subtle sink during long-press hold — gives implicit progress feedback
        scale: isPressing ? 0.975 : 1,
      }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{
        opacity: { duration: 0.2 },
        y:       { duration: 0.2 },
        scale:   isPressing
          ? { duration: 0.6, ease: "linear" }
          : { duration: 0.12, ease: "easeOut" },
      }}
      // Touch handlers only wired on touch devices, and only when the mobile
      // action bar is closed. When mobileOpen/confirmDelete is true the action
      // bar buttons are visible — we must NOT let their touchstart events bubble
      // up here and restart the 600ms timer (which would re-open the bar after
      // the user taps Edit/Cancel). Disabling the handlers entirely is the
      // cleanest guard; individual buttons also stopPropagation as a second layer.
      {...(isTouch && !mobileOpen && !confirmDelete ? lpHandlers : {})}
      className={`group relative select-none overflow-hidden rounded-2xl border p-5 transition-colors ${
        mobileOpen
          ? "border-brand-500/30 bg-brand-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.10] hover:bg-white/[0.05]"
      }`}
    >
      {/* ── Long-press progress ring (touch only) ─────────────────────────── */}
      <AnimatePresence>
        {isTouch && isPressing && (
          <motion.span
            key="press-ring"
            className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-brand-400/60"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1.015 }}
            exit={{ opacity: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* ── Top row: subject badge + desktop hover actions ────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <SubjectBadge subject={session.subject} />

        {/* ── Desktop hover actions (opacity-0 → group-hover:opacity-100) ── */}
        {/* These are intentionally kept exactly as they were.               */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onEdit(session)}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            title="Edit session"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Delete session"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Duration + date ───────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-white">
          <Clock className="h-4 w-4 text-white/30" />
          <span className="text-sm font-semibold">{formatDuration(session.duration_minutes)}</span>
        </div>
        <span className="text-sm text-white/35">{formatStudyDate(session.studied_at)}</span>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {session.notes && (
        <div className="mt-2.5 flex items-start gap-1.5">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
          <p className="line-clamp-2 text-xs text-white/40">{session.notes}</p>
        </div>
      )}

      {/* ── Mobile action bar (touch long-press only) ─────────────────────── */}
      <AnimatePresence>
        {isTouch && mobileOpen && (
          <motion.div
            key="mobile-actions"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="mt-3.5 flex items-center gap-2 border-t border-white/[0.06] pt-3.5"
          >
            {/*
              Each button stops touchstart propagation (secondary guard against
              re-triggering the long-press timer) and uses onClick instead of
              onTouchEnd — onClick is fired by the browser after touchend and
              avoids the asymmetric stopPropagation that was leaving the 600ms
              timer running and re-opening the action bar.
              touch-action: manipulation removes the 300ms click delay on older
              mobile browsers without disabling scroll.
            */}
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={handleEdit}
              style={{ touchAction: "manipulation" }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.05] py-2.5 text-xs font-medium text-white/60 active:bg-white/[0.10]"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={handleDeleteRequest}
              style={{ touchAction: "manipulation" }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/10 py-2.5 text-xs font-medium text-red-400 active:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => setMobileOpen(false)}
              style={{ touchAction: "manipulation" }}
              className="flex items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-white/30 active:bg-white/[0.06]"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation (shared desktop + mobile) ─────────────────── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="flex-1 text-xs text-red-300">Delete this session?</span>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-2 py-1 text-xs text-white/40 transition-colors hover:text-white/60"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {deleteError && (
        <p className="mt-2 text-xs text-red-400">{deleteError}</p>
      )}
    </motion.div>
  );
});
