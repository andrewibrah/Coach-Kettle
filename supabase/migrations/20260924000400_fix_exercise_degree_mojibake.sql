-- Class: data fix (no schema change).
-- Four rows from the exercise dataset seed (20260708000100) carry 'в°', a
-- cp1251 mojibake of the degree sign, in name. It came from the upstream
-- dataset (scripts/transform-exercises.mjs copies names verbatim), and the
-- client formatter does not mask it. No other column in these rows, and no
-- other row, contains 'в°', 'Â°' or 'â€'. The seed itself is not edited.
-- Idempotent: the LIKE filter makes a re-run a no-op. The LOWER(name) index
-- updates itself; trg_exercises_updated_at bumps updated_at on the four rows.
BEGIN;
UPDATE public.exercises
SET name = replace(name, 'в°', '°')
WHERE slug IN ('sled-45-calf-press', 'sled-45-leg-press', 'sled-45-leg-press-back-pov', 'sled-45-leg-wide-press')
  AND name LIKE '%в°%';
COMMIT;
