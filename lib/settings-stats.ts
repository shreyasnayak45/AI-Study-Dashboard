// SERVER-ONLY — imports next/headers via lib/supabase/server.
// Do NOT import this file from any "use client" component.
//
// Wrapped in React.cache: layout.tsx and settings/page.tsx both call this
// on the same request — the cache ensures only one Supabase round-trip.
// No service-role key required; uses the standard cookie-based auth client.

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserProfile, UserSettings } from "@/types";

export const getProfileAndSettings = cache(async (): Promise<{
  profile: UserProfile | null;
  settings: UserSettings | null;
}> => {
  const user = await getCurrentUser();
  if (!user) return { profile: null, settings: null };

  const sb = await createClient();
  const [{ data: profile }, { data: settings }] = await Promise.all([
    sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    profile:  profile  as UserProfile  | null,
    settings: settings as UserSettings | null,
  };
});
