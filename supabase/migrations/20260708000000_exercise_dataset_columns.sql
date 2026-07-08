-- ============================================================
-- Additive columns + relaxed body_part CHECK for the
-- open-source exercise dataset import (ExerciseDB OSS, 1,324 rows).
-- Backward-compatible with the 18 curated rows from 0032.
-- ============================================================

-- 1. Additive columns (all nullable / defaulted → existing rows unaffected)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS instructions JSONB,          -- {en,es,it,tr,ru,zh} localized instruction strings
  ADD COLUMN IF NOT EXISTS media_id     TEXT,           -- ExerciseDB CDN ref e.g. "7HcfMBP"
  ADD COLUMN IF NOT EXISTS target       TEXT,           -- primary target muscle (dataset `target`)
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'curated';  -- provenance

-- 2. Widen body_part CHECK to admit the dataset's anatomical labels (superset of the 12).
--    0032 did not name the constraint, so Postgres auto-named it exercises_body_part_check.
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_body_part_check;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_body_part_check
  CHECK (body_part IN (
    'Push','Pull','Legs','Abs','Chest','Back','Bis','Tris','Shoulders','Cardio','Mobility','Full Body',
    'Upper Arms','Lower Arms','Upper Legs','Lower Legs','Waist','Neck'
  ));

-- category CHECK is unchanged — the import heuristic only emits
-- compound/isolation/cardio, so 0032's constraint still holds.

-- 3. Provenance index so OSS rows can be bulk-managed / purged cleanly.
CREATE INDEX IF NOT EXISTS idx_exercises_source ON public.exercises (source);
