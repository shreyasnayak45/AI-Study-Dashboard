-- Migration: add last_report_sent_at to profiles
--
-- WHY:
--   The automated weekly cron job stamps each user's profile with the exact
--   timestamp of their most recent successfully-delivered report.
--
--   This lets the app surface "Last report sent: May 4" in the UI, and
--   provides an easy audit trail without having to aggregate weekly_report_sends.
--
-- SAFE: additive-only; the column is nullable with no default constraint.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_report_sent_at TIMESTAMPTZ;

-- Optional: fast lookup for admin dashboards / future filtering.
CREATE INDEX IF NOT EXISTS idx_profiles_last_report_sent_at
  ON profiles (last_report_sent_at);

-- RLS: the column lives on the profiles table which already has RLS.
-- The cron handler uses the service-role client (bypasses RLS) to write it.
-- Regular users can read their own row via the existing profiles policy.
