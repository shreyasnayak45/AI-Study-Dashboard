import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfileAndSettings } from "@/lib/settings-stats";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  // getCurrentUser() is React.cache'd — reuses the auth call already made by
  // the dashboard layout, so this page adds ZERO extra Supabase round-trips.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { profile, settings } = await getProfileAndSettings();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <SettingsClient user={user} profile={profile} settings={settings} />
    </div>
  );
}
