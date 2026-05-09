-- Migration: weekly_report_sends — deduplication log for automated weekly reports
--
-- WHY:
--   The Sunday 7 PM IST cron job must never send the same user two reports
--   for the same ISO week (e.g. network retries, manual re-triggers).
--   This table records every send attempt; the cron handler checks it before
--   generating each report.
--
-- report_week_id format: "YYYY-Www"  e.g. "2026-W19"
--   Derived from the week's Monday date using ISO week numbering.
--   Unique per (user_id, report_week_id) — enforced by the UNIQUE constraint.
--
-- SAFE: brand-new table; no existing rows affected.

CREATE TABLE IF NOT EXISTS weekly_report_sends (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_week_id   TEXT        NOT NULL,        -- "2026-W19"
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message    TEXT,
  UNIQUE (user_id, report_week_id)
);

-- Fast duplicate-check lookup
CREATE INDEX IF NOT EXISTS idx_weekly_report_sends_lookup
  ON weekly_report_sends (user_id, report_week_id);

-- RLS: service-role bypasses; regular users should not read/write this table.
ALTER TABLE weekly_report_sends ENABLE ROW LEVEL SECURITY;

-- No policies intentionally — only the service-role key (used by the cron handler)
-- can access this table. Anon / authenticated roles are blocked by default.
