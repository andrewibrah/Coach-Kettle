\set ON_ERROR_STOP on
-- Run only in a freshly initialized disposable local cluster; transaction rolls back.
BEGIN;
CREATE TABLE public.profiles (id uuid);
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.pr_tracked_lifts (user_id uuid, lift_name text, is_active boolean);
CREATE TABLE public.pr_lifts (user_id uuid, lift_name text, weight_lbs numeric, reps integer, estimated_1rm numeric, achieved_at timestamptz, updated_at timestamptz);
CREATE TABLE public.pr_history (user_id uuid, lift_name text, weight_lbs numeric, reps integer, estimated_1rm numeric, previous_1rm numeric, improvement_pct numeric, achieved_at timestamptz);
CREATE TABLE public.workout_log (id bigint generated always as identity, user_id uuid, workout_id text, workout_date text, exercise text, set_number integer, weight_lbs text, reps text, notes text, is_cardio boolean default false);
-- Actual legacy cardio types, not an invented widened fixture.
\ir ../migrations/0025_add_cardio_fields.sql
ALTER TABLE public.workout_log ADD COLUMN created_at timestamptz;
CREATE FUNCTION public.epley_1rm(numeric, integer) RETURNS numeric LANGUAGE sql AS $$ SELECT round($1 * (1 + $2::numeric / 30), 1) $$;
\ir ../migrations/20260703000000_pr_integrity_and_training_days.sql
CREATE TRIGGER trg_update_pr_from_workout_log AFTER INSERT ON public.workout_log FOR EACH ROW EXECUTE FUNCTION public.update_pr_from_workout_log();
\if :i3_apply_proposal
\ir ../migrations/20261008000100_in_session_numeric_integrity.sql
\endif
INSERT INTO public.pr_tracked_lifts VALUES ('00000000-0000-0000-0000-000000000001', 'Bench', true);
INSERT INTO public.pr_history VALUES ('00000000-0000-0000-0000-000000000001', 'Bench', 100, 8, 126.7, null, null, '2026-10-08');
INSERT INTO public.workout_log(user_id, workout_id, workout_date, exercise, set_number, weight_lbs, reps) VALUES ('00000000-0000-0000-0000-000000000001', 'bad', '2026-10-08', 'Bench', 1, '100', '99999999999999');
-- Existing reconcile throws integer overflow here despite its regex filter.
SELECT public.reconcile_workout_prs('00000000-0000-0000-0000-000000000001', '2026-10-08');
DO $$
DECLARE token text;
BEGIN
  FOREACH token IN ARRAY ARRAY['', 'NaN', 'Infinity', '-1', '8oops', '100kg'] LOOP
    IF public.i3_load(token) IS NOT NULL THEN RAISE EXCEPTION 'unsafe load accepted: %', token; END IF;
  END LOOP;
  FOREACH token IN ARRAY ARRAY['', 'NaN', 'Infinity', '-1', '8.5', '8oops', '9007199254740992'] LOOP
    IF public.i3_reps(token) IS NOT NULL THEN RAISE EXCEPTION 'unsafe reps accepted: %', token; END IF;
  END LOOP;
  IF public.i3_load('0') <> 0 OR public.i3_load('.5') <> .5 OR public.i3_reps('0') <> 0 OR public.i3_reps('9007199254740991') <> 9007199254740991 THEN RAISE EXCEPTION 'valid compatibility failed'; END IF;
END $$;
INSERT INTO public.workout_log(user_id, workout_id, workout_date, exercise, set_number, weight_lbs, reps, is_cardio, performance, set_kind) VALUES
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, 'NaN', '8', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '100', '8oops', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '', '8', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '0', '12', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '999', '0', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 0, '999', '8', false, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '999', '8', true, null, null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '999', '8', false, 'planned', null),
('00000000-0000-0000-0000-000000000001', 'raw', '2026-10-08', 'Bench', 1, '999', '8', false, 'performed', 'warmup');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.pr_lifts) THEN RAISE EXCEPTION 'excluded evidence produced PR'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workout_log WHERE weight_lbs = 'NaN') THEN RAISE EXCEPTION 'raw evidence lost'; END IF;
END $$;
INSERT INTO public.workout_log(user_id, workout_id, workout_date, exercise, set_number, weight_lbs, reps) VALUES ('00000000-0000-0000-0000-000000000001', 'valid', '2026-10-08', 'Bench', 1, '100', '8');
DO $$ BEGIN
 IF (SELECT estimated_1rm FROM public.pr_lifts) <> 126.7 THEN RAISE EXCEPTION 'valid PR regression'; END IF;
 IF EXISTS (SELECT 1 FROM public.suggest_next_set('00000000-0000-0000-0000-000000000001', 'Bench') WHERE suggested_weight_lbs IS NOT NULL) THEN RAISE EXCEPTION 'unapproved adaptive loading'; END IF;
END $$;
SELECT public.reconcile_workout_prs('00000000-0000-0000-0000-000000000001', '2026-10-08');
ROLLBACK;
