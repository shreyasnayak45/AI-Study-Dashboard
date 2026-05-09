-- Migration: clean pre-v2 AI timing personalities from cached insights
--
-- Older cached intelligence payloads could include fabricated time-based
-- personality names derived before session_start_time integrity was enforced.
-- This one-time cleanup replaces those stale personality blobs with the same
-- timing-unknown fallback the app now injects at load/render boundaries.

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
    UPDATE public.ai_insights
    SET content = jsonb_set(
      jsonb_set(
        content,
        '{intelligence,personality}',
        jsonb_build_object(
          'type', 'Focus Patterns Unknown',
          'emoji', '🕐',
          'tagline', 'Learning Your Study Rhythm',
          'insight', 'Use the live timer during study sessions to unlock personalized focus insights and timing analysis.'
        ),
        true
      ),
      '{metadata}',
      coalesce(content -> 'metadata', '{}'::jsonb) || jsonb_build_object('intelligence_version', 2),
      true
    )
    WHERE content #> '{intelligence,personality}' IS NOT NULL
      AND (
        CASE
          WHEN content #>> '{metadata,intelligence_version}' ~ '^[0-9]+$'
            THEN (content #>> '{metadata,intelligence_version}')::integer
          ELSE 0
        END
      ) < 2
      AND concat_ws(
        ' ',
        lower(coalesce(content #>> '{intelligence,personality,type}', '')),
        lower(coalesce(content #>> '{intelligence,personality,tagline}', '')),
        lower(coalesce(content #>> '{intelligence,personality,insight}', ''))
      ) ~ '(morning|afternoon|evening|night|midnight|dawn|bird|owl|marathon)';
  END IF;
END $$;
