-- ============================================================
-- Migration: program->workout source tracking (#1), schema only.
--
-- Scope note: this migration + the pure day-resolver in
-- lib/programSchedule.ts are the portion of #1 shipped in this pass. Full
-- pipeline wiring (a "Start this workout" entry point, the complete_day
-- edge-function action, and saveWorkout/history persisting these columns)
-- is deferred as a follow-up — GitNexus flags saveWorkout's blast radius at
-- 7 impacted symbols across several execution flows, and wiring it in the
-- same pass as everything else in this bug-fix batch risked a half-tested
-- change to a HIGH-traffic shared function. Landing the schema now means
-- that follow-up doesn't also need a migration + review cycle of its own.
--
-- source_kind is the discriminator (h_debug's structural guardrail) backing
-- a client-side `WorkoutSession.source` union of
-- {kind:'freestyle'} | {kind:'template', templateId} | {kind:'program', programId, programDayId, programWeek}
-- (c_debug's concrete columns, kept nullable and populated only for the
-- matching kind — not three independent optional fields with no stated
-- relationship to each other).
-- ============================================================

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'freestyle'
    CHECK (source_kind IN ('freestyle', 'template', 'program')),
  ADD COLUMN IF NOT EXISTS template_id     UUID REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_id      UUID REFERENCES public.workout_programs(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_day_id  UUID REFERENCES public.program_days(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_week    SMALLINT;

COMMENT ON COLUMN public.workouts.source_kind IS
  'Discriminator for how this workout was started: freestyle (default, no template/program), template, or program. template_id / program_id+program_day_id+program_week are only populated for the matching kind.';

-- ON DELETE SET NULL (not CASCADE) is deliberate: archiving or deleting a
-- program/template must never delete the user's completed workout history.

CREATE INDEX IF NOT EXISTS idx_workouts_program_day
  ON public.workouts (program_id, program_week, program_day_id);

-- Day cursor + explicit start date on the program itself. h_debug's caution:
-- do not infer schedule alignment from created_at (a user's training days
-- can change after a program starts) -- store the day the program actually
-- began instead.
ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS current_day_index SMALLINT NOT NULL DEFAULT 1
    CHECK (current_day_index BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- The ADD COLUMN ... DEFAULT CURRENT_DATE above backfills every pre-existing
-- program with today's date (the day this migration runs), which is exactly
-- the "inferred alignment" this column exists to avoid. Backfill from the
-- real creation date instead — still an approximation (not necessarily the
-- day the user actually started training), but strictly better than the
-- migration-run date, and available on every existing row.
UPDATE public.workout_programs
   SET start_date = created_at::date
 WHERE start_date = CURRENT_DATE;
