"use client";

/**
 * AuthConnectionsSection
 *
 * Renders two smart settings cards:
 *
 *  1. "Password Login"
 *     • Google-only users  → form to create a password (so they can also sign
 *       in via email + password in addition to Google).
 *     • Email/password users → "Password active" badge + collapsible change form.
 *
 *  2. "Connected Accounts"
 *     • Shows the Google connection row with connect / disconnect controls.
 *     • Disconnect is only enabled when the user also has an email identity
 *       (so they cannot lock themselves out).
 *
 * After any mutation, router.refresh() forces a server re-render so the
 * parent page re-fetches the updated user.identities and the UI reflects the
 * new state without a full page reload.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Lock, Eye, EyeOff, CheckCircle, XCircle,
  Loader2, Link2, Link2Off, ShieldCheck, KeyRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { changePassword, unlinkGoogleAccount } from "@/app/actions/settings";
import type { User } from "@/types";

// ─── Micro-components (self-contained, not exported) ─────────────────────────

type Status = { ok: boolean; text: string };

function StatusMsg({ status }: { status: Status | null }) {
  if (!status) return null;
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium",
        "[animation:status-fade-in_0.18s_ease-out]",
        status.ok
          ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border border-red-500/20 bg-red-500/10 text-red-400",
      )}
    >
      {status.ok
        ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        : <XCircle    className="h-3.5 w-3.5 shrink-0" />}
      {status.text}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
      {children}
    </h2>
  );
}

/** Official Google "G" logo — full colour, correct proportions. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ─── Maps raw Supabase link errors to user-friendly strings ───────────────────

function mapLinkError(msg: string): string {
  if (msg.includes("Identity already exists"))
    return "This Google account is already linked to a different StudyFlow account.";
  if (msg.includes("Manual linking is disabled"))
    return "Google account linking is not enabled for this project. Enable it in your Supabase dashboard under Auth → Settings.";
  if (msg.includes("already linked"))
    return "This Google account is already linked to your profile.";
  return msg;
}

// ─── Section A: Password Login ────────────────────────────────────────────────

interface PasswordSectionProps {
  /** True when user already has an `email` identity (email + password login). */
  hasEmailIdentity: boolean;
}

function PasswordLoginCard({ hasEmailIdentity }: PasswordSectionProps) {
  const router = useRouter();

  // For users with no password, the form starts open.
  // For users who already have one, it starts collapsed behind a "Change" link.
  const [showForm,  setShowForm]  = useState(!hasEmailIdentity);
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [status,    setStatus]    = useState<Status | null>(null);
  const [pending,   startTransition] = useTransition();

  function handleCancel() {
    setShowForm(false);
    setNewPw("");
    setConfirmPw("");
    setStatus(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) {
      setStatus({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setStatus({ ok: false, text: "Passwords do not match." });
      return;
    }
    setStatus(null);
    startTransition(async () => {
      const r = await changePassword(newPw);
      if (r.success) {
        setNewPw(""); setConfirmPw(""); setShowForm(false);
        setStatus({
          ok: true,
          text: hasEmailIdentity
            ? "Password updated successfully."
            : "Password created! You can now sign in with email too.",
        });
        // Re-render server component so user.identities reflects the new
        // email identity that Supabase adds when a password is first set.
        router.refresh();
      } else {
        setStatus({ ok: false, text: r.error ?? "Failed to save password." });
      }
    });
  }

  const passwordForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <Input
          label={hasEmailIdentity ? "New password" : "Create password"}
          type={showPw ? "text" : "password"}
          placeholder="Min. 8 characters"
          icon={<Lock className="h-4 w-4" />}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? "Hide password" : "Show password"}
          className="absolute right-3 top-[2.2rem] text-white/30 transition-colors hover:text-white/60"
        >
          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <Input
        label="Confirm password"
        type={showPw ? "text" : "password"}
        placeholder="Repeat password"
        icon={<Lock className="h-4 w-4" />}
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
      />

      <StatusMsg status={status} />

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} disabled={!newPw || !confirmPw}>
          {hasEmailIdentity ? "Update password" : "Save password"}
        </Button>
        {hasEmailIdentity && (
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <Card className="p-6">
      {hasEmailIdentity ? (
        /* ── Password already exists ── */
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">Password login active</p>
                <p className="text-xs text-white/35">
                  You can sign in with your email address and password.
                </p>
              </div>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={() => { setShowForm(true); setStatus(null); }}
                className="shrink-0 text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
              >
                Change
              </button>
            )}
          </div>

          {/* Status after a successful change (form hidden) */}
          {!showForm && <StatusMsg status={status} />}

          {showForm && (
            <div className="mt-5 border-t border-white/[0.06] pt-5">
              {passwordForm}
            </div>
          )}
        </div>
      ) : (
        /* ── No password — create one ── */
        <div>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] ring-1 ring-white/[0.08]">
              <KeyRound className="h-4 w-4 text-white/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">No password set</p>
              <p className="text-xs text-white/35">
                Add a password to sign in with your email address in addition to Google.
              </p>
            </div>
          </div>
          {passwordForm}
        </div>
      )}
    </Card>
  );
}

// ─── Section B: Connected Accounts ───────────────────────────────────────────

interface ConnectedAccountsProps {
  hasGoogleIdentity: boolean;
  /** Email from the Google identity's metadata, e.g. "user@gmail.com" */
  googleEmail:       string | null;
  /** Whether the user also has an email+password identity (safe to disconnect). */
  hasEmailIdentity:  boolean;
}

function ConnectedAccountsCard({
  hasGoogleIdentity,
  googleEmail,
  hasEmailIdentity,
}: ConnectedAccountsProps) {
  const router = useRouter();
  const [linkLoading,   setLinkLoading]   = useState(false);
  const [linkError,     setLinkError]     = useState("");
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);
  const [unlinkStatus,  setUnlinkStatus]  = useState<Status | null>(null);
  const [unlinkPending, startUnlink]      = useTransition();

  async function handleConnect() {
    setLinkLoading(true);
    setLinkError("");
    const supabase = createClient();
    // Pass next=/settings so the callback route redirects back here after linking.
    const redirectTo = `${window.location.origin}/auth/callback?next=/settings`;
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options:  { redirectTo },
    });
    if (error) {
      setLinkLoading(false);
      setLinkError(mapLinkError(error.message));
    }
    // On success the browser redirects — no setLinkLoading(false) needed.
  }

  function handleDisconnect() {
    if (!unlinkConfirm) { setUnlinkConfirm(true); return; }
    setUnlinkConfirm(false);
    setUnlinkStatus(null);
    startUnlink(async () => {
      const r = await unlinkGoogleAccount();
      if (r.success) {
        setUnlinkStatus({ ok: true, text: "Google account disconnected." });
        router.refresh();
      } else {
        setUnlinkStatus({ ok: false, text: r.error ?? "Failed to disconnect." });
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        {/* Identity row */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]">
            <GoogleLogo className="h-[18px] w-[18px]" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">Google</p>
            {hasGoogleIdentity ? (
              <p className="text-xs font-medium text-emerald-400/80">
                {googleEmail ? `Connected · ${googleEmail}` : "Connected"}
              </p>
            ) : (
              <p className="text-xs text-white/35">Not connected</p>
            )}
          </div>
        </div>

        {/* Action button */}
        {hasGoogleIdentity ? (
          hasEmailIdentity ? (
            /* Safe to disconnect */
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={unlinkPending}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium",
                "transition-all duration-150 disabled:opacity-40",
                unlinkConfirm
                  ? "border border-red-500/30 bg-red-500/20 text-red-400"
                  : "border border-white/[0.08] bg-white/[0.04] text-white/40 hover:border-red-500/20 hover:text-red-400/70",
              )}
            >
              {unlinkPending
                ? <Loader2  className="h-3 w-3 animate-spin" />
                : <Link2Off className="h-3 w-3" />}
              {unlinkConfirm ? "Confirm disconnect" : "Disconnect"}
            </button>
          ) : (
            /* Only sign-in method — disable with hint */
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.06] bg-transparent px-3 py-1.5"
              title="Add a password before disconnecting Google"
            >
              <Lock className="h-3 w-3 text-white/20" />
              <span className="text-[11px] text-white/25">Add password first</span>
            </div>
          )
        ) : (
          /* Connect Google */
          <button
            type="button"
            onClick={handleConnect}
            disabled={linkLoading}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition-all hover:bg-brand-500/20 disabled:opacity-50"
          >
            {linkLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Link2   className="h-3 w-3" />}
            {linkLoading ? "Redirecting…" : "Connect"}
          </button>
        )}
      </div>

      {/* Confirm-disconnect hint */}
      {unlinkConfirm && (
        <p className="mt-3 text-xs text-red-400/60">
          This removes Google sign-in from your account.{" "}
          <button
            type="button"
            onClick={() => setUnlinkConfirm(false)}
            className="underline underline-offset-2 hover:text-red-400"
          >
            Cancel
          </button>
        </p>
      )}

      {/* Link error */}
      {linkError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
          <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {linkError}
        </div>
      )}

      <StatusMsg status={unlinkStatus} />
    </Card>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function AuthConnectionsSection({ user }: { user: User }) {
  const identities       = user.identities ?? [];
  const hasEmailIdentity  = identities.some((i) => i.provider === "email");
  const hasGoogleIdentity = identities.some((i) => i.provider === "google");
  const googleIdentity    = identities.find((i) => i.provider === "google");
  // Google's identity_data carries profile info including the Gmail address.
  const googleEmail = (googleIdentity?.identity_data?.email as string | undefined) ?? null;

  return (
    <>
      {/* ── Password Login ────────────────────────────────────────── */}
      <section>
        <SectionTitle>Password Login</SectionTitle>
        <PasswordLoginCard hasEmailIdentity={hasEmailIdentity} />
      </section>

      {/* ── Connected Accounts ────────────────────────────────────── */}
      <section>
        <SectionTitle>Connected Accounts</SectionTitle>
        <ConnectedAccountsCard
          hasGoogleIdentity={hasGoogleIdentity}
          googleEmail={googleEmail}
          hasEmailIdentity={hasEmailIdentity}
        />
      </section>
    </>
  );
}
