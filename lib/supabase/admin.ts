// SERVER-ONLY — never import from client components.
//
// Admin Supabase client using the SERVICE ROLE key.
// Bypasses Row Level Security — use ONLY in trusted server-side contexts
// (cron handlers, migrations, admin actions). Never expose to the browser.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let _admin: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Returns a Supabase client authenticated with the service-role key.
 * Lazily instantiated and cached for the process lifetime.
 *
 * Throws if SUPABASE_SERVICE_ROLE_KEY is not set — this is intentional;
 * cron handlers should fail fast rather than silently skip auth.
 */
export function getAdminClient() {
  if (_admin) return _admin;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url)    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  if (!svcKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  _admin = createSupabaseClient(url, svcKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });

  return _admin;
}
