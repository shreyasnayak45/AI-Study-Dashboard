"use client";

import { useState, useTransition } from "react";
import { Mail, Loader2, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { triggerTestEmail } from "@/app/actions/email";
import { cn } from "@/lib/utils";

// ─── Shared mini status banner (same visual language as SettingsClient) ────────

function StatusMsg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={cn(
      "mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium",
      "[animation:status-fade-in_0.18s_ease-out]",
      ok
        ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        : "border border-red-500/20 bg-red-500/10 text-red-400"
    )}>
      {ok
        ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        : <XCircle    className="h-3.5 w-3.5 shrink-0" />}
      {text}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

/**
 * Temporary developer section to verify Resend email delivery.
 * Remove once weekly report emails are built and tested in production.
 */
export function EmailTestSection() {
  const [status, setStatus]       = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    setStatus(null);
    startTransition(async () => {
      const result = await triggerTestEmail();
      setStatus(
        result.success
          ? { ok: true,  text: "Test email sent to studyflowapp.official@gmail.com" }
          : { ok: false, text: result.error ?? "Failed to send email" }
      );
    });
  }

  return (
    <section>
      {/* Section title — same style as the rest of SettingsClient */}
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        Developer Tools
      </h2>

      <Card className="p-6">
        {/* Label row */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/10">
            <FlaskConical className="h-3.5 w-3.5 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">Email infrastructure test</p>
            <p className="text-xs text-white/35">
              Sends a test email via Resend to verify delivery is working.
            </p>
          </div>
        </div>

        {/* Row: destination + button */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-3.5 w-3.5 shrink-0 text-white/25" />
            <span className="truncate text-xs text-white/40">
              studyflowapp.official@gmail.com
            </span>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:border-brand-500/40 hover:bg-brand-500/20 disabled:opacity-40"
          >
            {pending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Mail    className="h-3.5 w-3.5" />}
            {pending ? "Sending…" : "Send test"}
          </button>
        </div>

        {status && <StatusMsg ok={status.ok} text={status.text} />}

        {/* Temporary-feature callout */}
        <p className="mt-4 text-[11px] text-white/20">
          This section will be removed once weekly report emails are configured.
        </p>
      </Card>
    </section>
  );
}
