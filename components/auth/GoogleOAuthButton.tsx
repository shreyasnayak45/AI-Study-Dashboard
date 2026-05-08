"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface GoogleOAuthButtonProps {
  /** Label shown on the button — defaults to "Continue with Google" */
  label?: string;
  /** Called with an error message if the OAuth redirect fails to initiate */
  onError?: (message: string) => void;
}

export function GoogleOAuthButton({
  label = "Continue with Google",
  onError,
}: GoogleOAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();

    // Build the callback URL that works on both localhost and production.
    // window.location.origin resolves to the correct host automatically.
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          // Request offline access so Supabase gets a refresh token.
          access_type: "offline",
          // Always show the account picker so users can choose accounts.
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setLoading(false);
      onError?.(error.message);
    }
    // On success the browser is redirected — no need to setLoading(false).
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="
        group relative flex w-full items-center justify-center gap-3 rounded-xl
        border border-white/[0.10] bg-white/[0.04]
        px-4 py-3 text-sm font-medium text-white/80
        transition-all duration-200
        hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white
        active:scale-[0.98]
        disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
      "
    >
      {loading ? (
        /* Spinner */
        <svg
          className="h-4 w-4 animate-spin text-white/50"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        /* Official Google "G" logo colours */
        <svg
          className="h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      )}
      <span>{loading ? "Redirecting…" : label}</span>
    </button>
  );
}
