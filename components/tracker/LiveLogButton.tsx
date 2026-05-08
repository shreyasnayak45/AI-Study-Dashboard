"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import { getActiveSession, LIVE_SESSION_EVENT } from "@/lib/live-session";
import { LiveSessionPanel } from "./LiveSessionPanel";
import type { ActiveSession } from "@/types";

// ─── Timer formatter ──────────────────────────────────────────────────────────

function formatElapsed(totalSeconds: number): string {
  const h  = Math.floor(totalSeconds / 3600);
  const m  = Math.floor((totalSeconds % 3600) / 60);
  const s  = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveLogButton() {
  const router = useRouter();

  const [session,   setSession]   = useState<ActiveSession | null>(null);
  const [elapsed,   setElapsed]   = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  // Stay in sync with localStorage across same tab and cross-tab
  useEffect(() => {
    const sync = () => setSession(getActiveSession());
    sync();
    window.addEventListener(LIVE_SESSION_EVENT, sync);
    window.addEventListener("storage",          sync);
    return () => {
      window.removeEventListener(LIVE_SESSION_EVENT, sync);
      window.removeEventListener("storage",          sync);
    };
  }, []);

  // Drift-free tick: always recomputes from startedAt
  useEffect(() => {
    if (!session) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  // ── ACTIVE — recording indicator ─────────────────────────────────────────
  if (session) {
    return (
      <motion.button
        onClick={() => router.push("/tracker")}
        animate={{
          boxShadow: [
            "0 0 14px rgba(239,68,68,0.28)",
            "0 0 30px rgba(239,68,68,0.52)",
            "0 0 14px rgba(239,68,68,0.28)",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        title={`Recording: ${session.subject} — click to view tracker`}
        className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:from-red-500 hover:to-red-600"
      >
        {/* Live pulsing dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-65" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        {/* "REC" label — hidden on small phones */}
        <span className="hidden text-[10px] font-bold uppercase tracking-widest opacity-70 sm:inline">
          Rec
        </span>
        {/* Elapsed time */}
        <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
      </motion.button>
    );
  }

  // ── IDLE — invite to start ────────────────────────────────────────────────
  return (
    <>
      <motion.button
        onClick={() => setPanelOpen(true)}
        animate={{
          boxShadow: [
            "0 0 8px rgba(239,68,68,0.10)",
            "0 0 18px rgba(239,68,68,0.26)",
            "0 0 8px rgba(239,68,68,0.10)",
          ],
        }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{
          scale: 1.03,
          boxShadow: "0 0 22px rgba(239,68,68,0.38)",
        }}
        whileTap={{ scale: 0.97 }}
        className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 bg-gradient-to-r from-red-600/80 to-red-700/70 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:from-red-600/90 hover:to-red-700/80"
      >
        <Radio className="h-4 w-4" />
        Live Log
      </motion.button>

      <LiveSessionPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
