-- ============================================================
-- Migration 0043: fix program_templates rest values
--
-- program_exercises.rest_seconds has CHECK (rest IS NULL OR rest BETWEEN 30 AND 600).
-- The PPSh-L 5-day template seeded in 0035 contains `rowing-erg` with rest=0,
-- which makes `programming generate` fail with:
--   new row for relation "program_exercises" violates check constraint
--   "program_exercises_rest_seconds_check"
--
-- This migration rewrites any rest value < 30 inside program_templates.structure
-- to a safe minimum (60s). Idempotent: re-running is a no-op.
-- ============================================================

UPDATE public.program_templates
SET structure = jsonb_set(
    structure,
    '{days}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN day ? 'exercises' THEN
            jsonb_set(
              day,
              '{exercises}',
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN (ex->>'rest') IS NULL THEN ex
                    WHEN (ex->>'rest')::int < 30 THEN jsonb_set(ex, '{rest}', to_jsonb(60))
                    WHEN (ex->>'rest')::int > 600 THEN jsonb_set(ex, '{rest}', to_jsonb(600))
                    ELSE ex
                  END
                )
                FROM jsonb_array_elements(day->'exercises') AS ex
              )
            )
          ELSE day
        END
      )
      FROM jsonb_array_elements(structure->'days') AS day
    )
  )
WHERE structure ? 'days';
