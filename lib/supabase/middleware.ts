import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Called on every request by the root middleware.
 *
 * What it does:
 *  1. Creates a Supabase client wired to the raw Request/Response cookies.
 *  2. Calls getUser() — this silently refreshes an expired JWT if needed,
 *     keeping the user logged in without forcing a re-login every hour.
 *  3. Redirects unauthenticated users hitting protected routes → /login.
 *  4. Redirects authenticated users hitting /login or /signup → /.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Always use getUser() in middleware, never getSession().
  // getUser() validates the JWT server-side; getSession() only reads the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthPage = pathname === "/login" || pathname === "/signup";
  // /auth/callback must be reachable without a session — it IS the handler
  // that creates the session after an OAuth redirect.
  const isOAuthCallback = pathname.startsWith("/auth/");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.match(/\.(.*)$/); // files with extensions (images, fonts…)

  if (!isPublicAsset && !user && !isAuthPage && !isOAuthCallback) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
