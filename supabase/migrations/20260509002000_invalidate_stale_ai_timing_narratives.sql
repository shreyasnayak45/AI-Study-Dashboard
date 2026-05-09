-- Migration: invalidate cached AI insight narratives generated before v3
--
-- v3 extends the timing integrity fix beyond the personality card to the
-- dashboard and analytics summary text. Removing older rows forces a fresh
-- generation instead of letting stale wording like "Focused Afternoon" survive.

DO $$
BEGIN
  IF to_regclass('public.ai_insights') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'ai_insights'
         AND column_name = 'content'
     )
  THEN
    DELETE FROM public.ai_insights
    WHERE (
      CASE
        WHEN content #>> '{metadata,intelligence_version}' ~ '^[0-9]+$'
          THEN (content #>> '{metadata,intelligence_version}')::integer
        ELSE 0
      END
    ) < 3
    OR lower(content::text) ~ '(focused afternoon|morning|afternoon|evening|night|peak focus|peak hours|focus windows|time-of-day|timing-based)';
  END IF;
END $$;
