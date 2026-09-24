-- Run only in a disposable database with 0032, 20260708000000, the exercise
-- dataset seed (20260708000100) and 20260924000400 applied. Read-only.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  -- Whole-row text covers name, aliases, instructions and every other column.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e::text LIKE '%в°%' OR e::text LIKE '%Â°%' OR e::text LIKE '%â€%'
  ), 'exercise rows still contain mojibake';
  -- Exact names (a DELETE of the rows would also leave zero mojibake rows).
  ASSERT (SELECT jsonb_object_agg(slug, name) FROM public.exercises WHERE slug IN
    ('sled-45-calf-press','sled-45-leg-press','sled-45-leg-press-back-pov','sled-45-leg-wide-press'))
    = '{"sled-45-calf-press":"sled 45° calf press","sled-45-leg-press":"sled 45° leg press","sled-45-leg-press-back-pov":"sled 45° leg press (back pov)","sled-45-leg-wide-press":"sled 45° leg wide press"}'::jsonb,
    'corrected sled names';
  -- The row that was already correct is untouched.
  ASSERT (SELECT name FROM public.exercises WHERE slug = 'sled-45-leg-press-side-pov') = 'sled 45° leg press (side pov)',
    'already-correct sibling row changed';
END $$;
ROLLBACK;
\echo 'exercise mojibake SQL tests passed'
