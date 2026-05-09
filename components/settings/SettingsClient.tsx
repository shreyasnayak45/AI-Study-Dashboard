"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  User, Mail, Bell, Target, Trash2, Download,
  CheckCircle, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { AvatarUpload } from "@/components/profile/AvatarUpload";

// Lazy-loaded: only downloaded when the user clicks "Delete my account".
// Keeps framer-motion out of the initial settings page JS bundle.
const DeleteAccountModal = dynamic(
  () => import("./DeleteAccountModal").then((m) => ({ default: m.DeleteAccountModal })),
  { ssr: false }
);
import {
  updateProfile, updateUserSettings,
  clearAllSessions, exportStudyData,
} from "@/app/actions/settings";
import { AuthConnectionsSection } from "@/components/settings/AuthConnectionsSection";
import { EmailTestSection } from "@/components/settings/EmailTestSection";
import { fmtHours } from "@/lib/analytics-utils";
import { cn } from "@/lib/utils";
import type { User as UserType, UserProfile, UserSettings } from "@/types";

interface Props {
  user:     UserType;
  profile:  UserProfile | null;
  settings: UserSettings | null;
}

type Status = { ok: boolean; text: string };

const SESSION_LENGTHS = [15, 25, 30, 45, 60, 90];
const GOAL_PRESETS    = [60, 90, 120, 180, 240];

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
        checked ? "bg-brand-500" : "bg-white/[0.12]"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ─── Status message ───────────────────────────────────────────────────────────
// Pure CSS — no framer-motion needed for a simple show/hide with fade-in.

function StatusMsg({ status }: { status: Status | null }) {
  if (!status) return null;
  return (
    <div className={cn(
      "mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium",
      "[animation:status-fade-in_0.18s_ease-out]",
      status.ok
        ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        : "border border-red-500/20 bg-red-500/10 text-red-400"
    )}>
      {status.ok
        ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        : <XCircle    className="h-3.5 w-3.5 shrink-0" />}
      {status.text}
    </div>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
      {children}
    </h2>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsClient({ user, profile, settings }: Props) {
  // ── Account ──────────────────────────────────────────────────────
  const [avatarUrl,   setAvatarUrl]    = useState<string | null>(profile?.avatar_url ?? null);
  const [displayName, setDisplayName]  = useState(profile?.display_name ?? "");
  const [accountStatus, setAccountStatus] = useState<Status | null>(null);
  const [accountPending, startAccount]    = useTransition();

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setAccountStatus(null);
    startAccount(async () => {
      const r = await updateProfile({ display_name: displayName });
      setAccountStatus(r.success
        ? { ok: true,  text: "Profile updated." }
        : { ok: false, text: r.error ?? "Update failed" });
    });
  }

  // ── Preferences ──────────────────────────────────────────────────
  const [dailyGoal,  setDailyGoal]  = useState(settings?.daily_goal_minutes      ?? 120);
  const [sessionLen, setSessionLen] = useState(settings?.preferred_session_minutes ?? 30);
  const [notifs,     setNotifs]     = useState(settings?.notifications_enabled    ?? true);
  const [prefsStatus, setPrefsStatus] = useState<Status | null>(null);
  const [prefsPending, startPrefs]    = useTransition();

  function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    setPrefsStatus(null);
    startPrefs(async () => {
      const r = await updateUserSettings({
        daily_goal_minutes:       dailyGoal,
        preferred_session_minutes: sessionLen,
        notifications_enabled:    notifs,
      });
      setPrefsStatus(r.success
        ? { ok: true,  text: "Preferences saved." }
        : { ok: false, text: r.error ?? "Save failed" });
    });
  }

  // ── Danger zone ──────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clearConfirm,    setClearConfirm]    = useState(false);
  const [dangerStatus,    setDangerStatus]    = useState<Status | null>(null);
  const [clearPending,    startClear]         = useTransition();
  const [exportPending,   startExport]        = useTransition();

  function handleClearSessions() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    setClearConfirm(false);
    setDangerStatus(null);
    startClear(async () => {
      const r = await clearAllSessions();
      setDangerStatus(r.success
        ? { ok: true,  text: "All study sessions deleted." }
        : { ok: false, text: r.error ?? "Delete failed" });
    });
  }

  function handleExport() {
    setDangerStatus(null);
    startExport(async () => {
      const r = await exportStudyData();
      if (r.success && r.csv) {
        const blob = new Blob([r.csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `study-sessions-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setDangerStatus({ ok: true, text: "Export downloaded." });
      } else {
        setDangerStatus({ ok: false, text: r.error ?? "Export failed" });
      }
    });
  }

  const email = user.email ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Settings</h1>
        <p className="mt-1.5 text-sm text-white/40">Manage your account, preferences, and data.</p>
      </div>

      <div className="space-y-6">

        {/* ── Account ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle>Account</SectionTitle>
          <Card className="p-6">
            <form onSubmit={handleSaveProfile}>
              {/* Avatar + email row */}
              <div className="mb-6 flex items-center gap-4">
                <AvatarUpload
                  userId={user.id}
                  currentUrl={avatarUrl}
                  displayName={displayName || profile?.display_name}
                  email={email}
                  size="md"
                  onSuccess={(url) => setAvatarUrl(url)}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {displayName.trim() || "No display name set"}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-white/40">
                    <Mail className="h-3 w-3" /> {email}
                  </p>
                </div>
              </div>

              {/* Display name input */}
              <Input
                label="Display name"
                placeholder="Your name"
                icon={<User className="h-4 w-4" />}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              {/* Email read-only */}
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-white/60">Email</label>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-white/40">
                  <Mail className="h-4 w-4 text-white/20" />
                  {email}
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-white/20">
                    Read-only
                  </span>
                </div>
              </div>

              <StatusMsg status={accountStatus} />

              <Button type="submit" loading={accountPending} className="mt-5">
                Save profile
              </Button>
            </form>
          </Card>
        </section>

        {/* ── Preferences ─────────────────────────────────────────── */}
        <section>
          <SectionTitle>Preferences</SectionTitle>
          <Card className="p-6">
            <form onSubmit={handleSavePrefs} className="space-y-6">

              {/* Daily goal */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-white/60">
                    <Target className="h-3.5 w-3.5" /> Daily study goal
                  </label>
                  <span className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-400">
                    {fmtHours(dailyGoal)}
                  </span>
                </div>
                <input
                  type="range"
                  min={15} max={480} step={15}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                  className="w-full cursor-pointer accent-[#6366f1]"
                />
                <div className="mt-2 flex gap-2">
                  {GOAL_PRESETS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setDailyGoal(g)}
                      className={cn(
                        "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                        dailyGoal === g
                          ? "bg-brand-500/20 text-brand-400"
                          : "bg-white/[0.04] text-white/30 hover:text-white/60"
                      )}
                    >
                      {fmtHours(g)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session length */}
              <div>
                <label className="mb-2.5 block text-sm font-medium text-white/60">
                  Preferred session length
                </label>
                <div className="flex flex-wrap gap-2">
                  {SESSION_LENGTHS.map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => setSessionLen(len)}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
                        sessionLen === len
                          ? "border-brand-500/40 bg-brand-500/15 text-brand-400"
                          : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/65"
                      )}
                    >
                      {len}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-white/30" />
                  <div>
                    <p className="text-sm font-medium text-white/70">Notifications</p>
                    <p className="text-xs text-white/30">Study reminders and alerts</p>
                  </div>
                </div>
                <Toggle checked={notifs} onChange={setNotifs} />
              </div>

              <StatusMsg status={prefsStatus} />

              <Button type="submit" loading={prefsPending}>Save preferences</Button>
            </form>
          </Card>
        </section>

        {/* ── Password Login + Connected Accounts ─────────────────── */}
        <AuthConnectionsSection user={user} />

        {/* ── Developer Tools (temporary — remove after weekly reports ship) ── */}
        <EmailTestSection />

        {/* ── Danger zone ─────────────────────────────────────────── */}
        <section>
          <SectionTitle>Data & Account</SectionTitle>
          <Card className="p-6">
            <div className="space-y-4">

              {/* Export */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-white/80">Export study data</p>
                  <p className="text-xs text-white/35">Download all sessions as a CSV file.</p>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exportPending}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
                >
                  {exportPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  Export
                </button>
              </div>

              {/* Clear sessions */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-red-300/80">Clear all study sessions</p>
                  <p className="text-xs text-red-400/40">Permanently delete all your recorded sessions.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSessions}
                  disabled={clearPending}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40",
                    clearConfirm
                      ? "border border-red-500/30 bg-red-500/20 text-red-400"
                      : "border border-red-500/20 bg-red-500/10 text-red-400/70 hover:bg-red-500/20"
                  )}
                >
                  {clearPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  {clearConfirm ? "Confirm delete" : "Clear data"}
                </button>
              </div>
              {clearConfirm && (
                <p className="text-xs text-red-400/60">
                  Click &quot;Confirm delete&quot; again to permanently delete all sessions.{" "}
                  <button
                    type="button"
                    onClick={() => setClearConfirm(false)}
                    className="underline hover:text-red-400"
                  >
                    Cancel
                  </button>
                </p>
              )}

              <StatusMsg status={dangerStatus} />

              {/* Delete account */}
              <div className="border-t border-white/[0.06] pt-4">
                <p className="mb-2 text-xs text-white/30">
                  Deleting your account removes all data and signs you out permanently.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="text-xs font-medium text-red-500/60 transition-colors hover:text-red-400"
                >
                  Delete my account →
                </button>
              </div>
            </div>
          </Card>
        </section>
      </div>

      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </div>
  );
}
