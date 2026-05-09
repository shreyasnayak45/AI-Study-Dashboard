-- Migration: invalidate cached AI insight narratives generated before v3
--
-- v3 enforces the full timing-integrity pipeline: personality, dashboard headline,
-- analytics observations, and intelligence narratives are all sanitised of
-- fabricated time-of-day language before being stored.
--
-- SAFE REWRITE (replaces the original aggressive DELETE):
--   The original used `version < 3 OR content ~ broad-keyword-regex` which would
--   delete newly generated rows because common English words like "morning" or
--   "night" appear in virtually any study advice. This version only deletes rows
--   that are BOTH outdated (version < 3) AND contain specific hallucinated
--   time-of-day personality types that the sanitiser now blocks.
--
-- Already-sanitised rows (version = 3) are never touched.
-- Rows without an intelligence key are never touched.

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
    -- Only delete rows that are BOTH:
    --   (a) below the current intelligence version, AND
    --   (b) contain a fabricated time-of-day personality type
    --       (these are the specific hallucinated values the fix targets).
    --
    -- Neutral rows (no personality, or already-safe personality) are preserved
    -- so users don't lose their cached dashboard/analytics text unnecessarily.
    DELETE FROM public.ai_insights
    WHERE (
      CASE
        WHEN content #>> '{metadata,intelligence_version}' ~ '^[0-9]+$'
          THEN (content #>> '{metadata,intelligence_version}')::integer
        ELSE 0
      END
    ) < 3
    AND content #> '{intelligence,personality}' IS NOT NULL
    AND lower(coalesce(content #>> '{intelligence,personality,type}', ''))
        ~ '(afternoon|morning|night|evening|midday|midnight|dawn|early.bird|night.owl|marathoner)';
  END IF;
END $$;
