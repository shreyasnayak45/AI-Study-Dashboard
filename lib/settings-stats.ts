// SERVER-ONLY — imports next/headers via lib/supabase/server.
// Do NOT import this file from any "use client" component.
//
// Two-layer caching strategy:
//   1. unstable_cache  — persists results across requests, per user, for 60 s.
//      Tag: "profile-settings" — invalidated when profile/settings are updated.
//   2. React.cache     — deduplicates within a single render pass
//      (layout.tsx and settings/page.tsx both call this — one DB trip).

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserProfile, UserSettings } from "@/types";

// ─── Layer 1: persisted cross-request cache keyed by userId ───────────────────

const _fetchProfileAndSettings = unstable_cache(
  async (userId: string): Promise<{ profile: UserProfile | null; settings: UserSettings | null }> => {
    const sb = await createClient();
    const [{ data: profile }, { data: settings }] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    return {
      profile:  profile  as UserProfile  | null,
      settings: settings as UserSettings | null,
    };
  },
  ["profile-settings"],
  { revalidate: 60, tags: ["profile-settings"] }
);

// ─── Layer 2: React.cache for same-render deduplication ───────────────────────

export const getProfileAndSettings = cache(async (): Promise<{
  profile: UserProfile | null;
  settings: UserSettings | null;
}> => {
  const user = await getCurrentUser();
  if (!user) return { profile: null, settings: null };
  return _fetchProfileAndSettings(user.id);
});
