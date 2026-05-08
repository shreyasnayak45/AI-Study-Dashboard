import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler.
 *
 * After the user authenticates with Google, Supabase redirects here with a
 * one-time `code` query parameter.  We exchange it for a session and then
 * redirect to the dashboard (or the `next` param if provided).
 *
 * URL shape:
 *   /auth/callback?code=<oauth-code>&next=/some-page
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful OAuth — redirect to dashboard (or the `next` path).
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Session exchange failed — redirect to login with error context.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("OAuth sign-in failed. Please try again.")}`
    );
  }

  // No code present — something went wrong upstream.
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Authentication was cancelled or failed.")}`
  );
}
