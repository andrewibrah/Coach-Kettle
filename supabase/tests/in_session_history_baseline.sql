-- H1 completed-session history baseline. LOCAL disposable stack only, e.g.
--   psql "postgresql://postgres:postgres@127.0.0.1:55122/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/in_session_history_baseline.sql
-- Needs the full migration chain through 20261008000400. One transaction, always rolls back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, aud, role, email, instance_id)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'h1-a@ck.local', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'h1-b@ck.local', '00000000-0000-0000-0000-000000000000');

-- Seeded as owner: clients cannot write these tables directly since 20261008000300.
INSERT INTO public.workout_operation_sessions (session_id, user_id, date_iso, state) VALUES
  ('h1-sq-yday',     '00000000-0000-0000-0000-0000000000a1', '2026-10-12', 'finalized'),
  ('h1-sq-live',     '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'open'),
  ('h1-sq-live-row', '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'open'),
  ('h1-sq-del',      '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'deleted');

INSERT INTO public.workouts (id, user_id, "dateISO", part, "createdAt") VALUES
  ('h1-sq-yday',      '00000000-0000-0000-0000-0000000000a1', '2026-10-12', 'Legs', 100),
  -- Anomalous open/deleted sessions that still have a workouts row must not count.
  ('h1-sq-live-row',  '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'Legs', 200),
  ('h1-sq-del',       '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'Legs', 300),
  -- Two completed same-day sessions, plus a later calendar date with an OLDER createdAt.
  ('h1-dl-am',        '00000000-0000-0000-0000-0000000000a1', '2026-10-12', 'Pull', 1000),
  ('h1-dl-pm',        '00000000-0000-0000-0000-0000000000a1', '2026-10-12', 'Pull', 2000),
  ('h1-dl-late-date', '00000000-0000-0000-0000-0000000000a1', '2026-10-13', 'Pull', 500),
  -- Legacy workouts with no P4 session row.
  ('h1-b-old',        '00000000-0000-0000-0000-0000000000a1', '2026-09-01', 'Push', 10),
  ('h1-b-new',        '00000000-0000-0000-0000-0000000000a1', '2026-09-08', 'Push', 20),
  ('h1-ohp-1',        '00000000-0000-0000-0000-0000000000a1', '2026-10-01', 'Push', 50),
  ('h1-ohp-2',        '00000000-0000-0000-0000-0000000000a1', '2026-10-02', 'Push', 60),
  ('h1-row-b',        '00000000-0000-0000-0000-0000000000b2', '2026-10-12', 'Pull', 100),
  -- Legacy workouts with NULL createdAt: recency must fall back to the date, not the ID.
  ('zz-fs-old',       '00000000-0000-0000-0000-0000000000a1', '2026-01-01', 'Legs', NULL),
  ('aa-fs-new',       '00000000-0000-0000-0000-0000000000a1', '2026-06-01', 'Legs', NULL);

INSERT INTO public.workout_log (user_id, workout_id, workout_date, exercise, set_number, weight_lbs, reps, created_at, is_cardio, performance, set_kind, p4_session_id, p4_row_id) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'zz-fs-old',       '2026-01-01', 'Front Squat',      1, '135', '5',  '2026-01-01', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'aa-fs-new',       '2026-06-01', 'Front Squat',      1, '155', '5',  '2026-06-01', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-sq-yday',      '2026-10-12', 'Squat',            1, '225', '5',  '2026-10-12', false, 'performed', 'work',    'h1-sq-yday',     'r1'),
  -- Realistic live session: open session, log rows, no workouts row.
  ('00000000-0000-0000-0000-0000000000a1', 'h1-sq-live',      '2026-10-13', 'Squat',            1, '245', '5',  '2026-10-13', false, 'performed', 'work',    'h1-sq-live',     'r1'),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-sq-live-row',  '2026-10-13', 'Squat',            1, '250', '5',  '2026-10-13', false, 'performed', 'work',    'h1-sq-live-row', 'r1'),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-sq-del',       '2026-10-13', 'Squat',            1, '255', '5',  '2026-10-13', false, 'performed', 'work',    'h1-sq-del',      'r1'),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-dl-am',        '2026-10-12', 'Deadlift',         1, '315', '5',  '2026-10-12', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-dl-pm',        '2026-10-12', 'Deadlift',         1, '275', '3',  '2026-10-12', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-dl-pm',        '2026-10-12', 'Deadlift',         2, '275', '3',  '2026-10-12', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-dl-late-date', '2026-10-13', 'Deadlift',         1, '405', '1',  '2026-10-13', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-b-old',        '2026-09-01', 'bench',            1, '135', '10', '2026-09-01', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-b-new',        '2026-09-08', 'Bench Press',      1, '185', '5',  '2026-09-08', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-b-new',        '2026-09-08', E'  BENCH \t press ', 2, '185', '4', '2026-09-08', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   1, '45',  '10', '2026-10-01', false, 'performed', 'warmup',  NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   2, '95',  '5',  '2026-10-01', true,  'performed', NULL,      NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   3, '95',  '5',  '2026-10-01', false, 'planned',   'work',    NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   4, '0',   '10', '2026-10-01', false, 'performed', 'work',    NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   5, '95',  '5',  '2026-10-01', false, 'performed', 'work',    NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   6, '85',  '8',  '2026-10-01', false, 'performed', 'backoff', NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-1',        '2026-10-01', 'Overhead Press',   7, 'NaN', '5',  '2026-10-01', false, 'performed', 'work',    NULL, NULL),
  -- A later workout holding only ineligible (warmup) sets is not a baseline.
  ('00000000-0000-0000-0000-0000000000a1', 'h1-ohp-2',        '2026-10-02', 'Overhead Press',   1, '50',  '10', '2026-10-02', false, 'performed', 'warmup',  NULL, NULL),
  ('00000000-0000-0000-0000-0000000000b2', 'h1-row-b',        '2026-10-12', 'Barbell Row',      1, '135', '8',  '2026-10-12', false, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-0000000000b2', 'h1-row-b',        '2026-10-12', 'Bench Press',      1, '500', '1',  '2026-10-12', false, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  n int := 0;
  total constant int := 24;
  bench constant text[] := ARRAY['bench press', 'bench', 'flat bench', 'bb bench', 'barbell bench', 'bench presses'];
  c int; ids text; r record;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.exercise_history_baseline(text[],text)'::regprocedure) THEN
    RAISE EXCEPTION 'H1 FAIL: baseline must be SECURITY INVOKER'; END IF; n := n + 1;
  IF has_function_privilege('anon', 'public.exercise_history_baseline(text[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H1 FAIL: anon can execute baseline'; END IF; n := n + 1;
  IF NOT has_function_privilege('authenticated', 'public.exercise_history_baseline(text[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H1 FAIL: authenticated cannot execute baseline'; END IF; n := n + 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'H1 FAIL: not running under RLS role'; END IF; n := n + 1;

  -- Completed yesterday vs live/open/deleted today.
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(ARRAY['squat']);
  IF c <> 1 OR ids <> 'h1-sq-yday' THEN RAISE EXCEPTION 'H1 FAIL: squat baseline % rows from %, want yesterday', c, ids; END IF; n := n + 1;
  SELECT * INTO r FROM public.exercise_history_baseline(ARRAY['squat']);
  IF r.workout_date <> '2026-10-12' OR r.weight_lbs <> 225 OR r.reps <> 5 OR r.e1rm <> 262.5 OR r.set_number <> 1 OR r.set_kind <> 'work' THEN
    RAISE EXCEPTION 'H1 FAIL: squat row shape %', r; END IF; n := n + 1;

  -- Two completed same-day sessions: only the latest by createdAt, never merged, not MAX(date).
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(ARRAY['deadlift']);
  IF c <> 2 OR ids <> 'h1-dl-pm' THEN RAISE EXCEPTION 'H1 FAIL: deadlift baseline % rows from %, want h1-dl-pm only', c, ids; END IF; n := n + 1;
  IF EXISTS (SELECT 1 FROM public.exercise_history_baseline(ARRAY['deadlift']) WHERE weight_lbs <> 275) THEN
    RAISE EXCEPTION 'H1 FAIL: deadlift merged another session'; END IF; n := n + 1;

  -- Canonical + typed alias rows (including case/whitespace variants).
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(bench);
  IF c <> 2 OR ids <> 'h1-b-new' THEN RAISE EXCEPTION 'H1 FAIL: bench variants % rows from %', c, ids; END IF; n := n + 1;
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(bench, 'h1-b-new');
  IF c <> 1 OR ids <> 'h1-b-old' THEN RAISE EXCEPTION 'H1 FAIL: legacy typed alias % rows from %', c, ids; END IF; n := n + 1;
  IF (SELECT weight_lbs FROM public.exercise_history_baseline(bench, 'h1-b-new')) <> 135 THEN
    RAISE EXCEPTION 'H1 FAIL: legacy alias load'; END IF; n := n + 1;
  -- Without the alias in p_names, distinct names are never merged.
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['bench press'], 'h1-b-new');
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: unmapped alias matched (% rows)', c; END IF; n := n + 1;
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['  BENCH   Press ']);
  IF c <> 2 THEN RAISE EXCEPTION 'H1 FAIL: p_names not normalized (% rows)', c; END IF; n := n + 1;

  -- Warmup/cardio/planned/zero/invalid load excluded; backoff kept with its kind.
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(ARRAY['overhead press']);
  IF c <> 2 OR ids <> 'h1-ohp-1' THEN RAISE EXCEPTION 'H1 FAIL: ohp % rows from %', c, ids; END IF; n := n + 1;
  IF EXISTS (SELECT 1 FROM public.exercise_history_baseline(ARRAY['overhead press']) WHERE set_number NOT IN (5, 6)) THEN
    RAISE EXCEPTION 'H1 FAIL: ineligible set returned'; END IF; n := n + 1;
  SELECT * INTO r FROM public.exercise_history_baseline(ARRAY['overhead press']) WHERE set_number = 6;
  IF r.set_kind <> 'backoff' OR r.weight_lbs <> 85 OR r.reps <> 8 OR r.e1rm <> 107.7 THEN
    RAISE EXCEPTION 'H1 FAIL: backoff row %', r; END IF; n := n + 1;
  IF (SELECT e1rm FROM public.exercise_history_baseline(ARRAY['overhead press']) WHERE set_number = 5) <> 110.8 THEN
    RAISE EXCEPTION 'H1 FAIL: work e1rm'; END IF; n := n + 1;

  -- NULL createdAt (legacy): newest date wins, never alphabetical ID.
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(ARRAY['front squat']);
  IF c <> 1 OR ids <> 'aa-fs-new' THEN RAISE EXCEPTION 'H1 FAIL: null createdAt baseline % rows from %, want aa-fs-new', c, ids; END IF; n := n + 1;

  -- p_exclude_session excluded.
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['squat'], 'h1-sq-yday');
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: excluded session returned (% rows)', c; END IF; n := n + 1;

  -- Other user's rows invisible; no history returns 0 rows.
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['barbell row']);
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: other user rows visible (% rows)', c; END IF; n := n + 1;
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['curl']);
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: no-history returned % rows', c; END IF; n := n + 1;
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY[]::text[]);
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: empty names returned % rows', c; END IF; n := n + 1;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  SELECT count(*), string_agg(DISTINCT workout_id, ',') INTO c, ids FROM public.exercise_history_baseline(bench);
  IF c <> 1 OR ids <> 'h1-row-b' THEN RAISE EXCEPTION 'H1 FAIL: user B bench % rows from %', c, ids; END IF; n := n + 1;
  SELECT count(*) INTO c FROM public.exercise_history_baseline(ARRAY['squat']);
  IF c <> 0 THEN RAISE EXCEPTION 'H1 FAIL: user B sees user A squat (% rows)', c; END IF; n := n + 1;

  RESET ROLE;
  IF n <> total THEN RAISE EXCEPTION 'H1 FAIL: ran %/% assertions', n, total; END IF;
  RAISE NOTICE 'H1 baseline fixture: %/%', n, total;
END $$;
ROLLBACK;
