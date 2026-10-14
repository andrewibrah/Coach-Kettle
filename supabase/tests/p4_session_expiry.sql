-- D08 decision (2026-10-13): a session still open 24 hours after creation is auto-closed, keeping
-- the sets it already has (like an End), and locked. A later End from the phone with a higher
-- revision still wins. LOCAL stack only (needs auth.users, pg_cron and the full chain):
--   psql "postgresql://postgres:postgres@127.0.0.1:5432/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/p4_session_expiry.sql
-- Runs in one transaction and always rolls back.
BEGIN;
INSERT INTO auth.users (id, aud, role, email, instance_id)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'expiry-a@ck.local', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'expiry-b@ck.local', '00000000-0000-0000-0000-000000000000');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
-- Old session: two performed sets and one incomplete correction.
SELECT public.apply_workout_operation('exp-old', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"kept","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-old', 'put:r2:11', 11, 'put', 'r2',
  '{"dateISO":"2026-10-12","row":{"id":"r2","exercise":"Bench","set":2,"weightLbs":"100","reps":"6","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-old', 'revise:r3:12', 12, 'revise', 'r3',
  '{"dateISO":"2026-10-12","row":{"id":"r3","exercise":"Bench","set":3,"weightLbs":"","reps":"","notes":"skipped"}}'::jsonb);
-- Old session whose only row was dropped: nothing to keep.
SELECT public.apply_workout_operation('exp-empty', 'drop:x:10', 10, 'drop', 'x',
  '{"dateISO":"2026-10-12","row":{"id":"x","exercise":"Bench","set":1,"weightLbs":"","reps":"","notes":""}}'::jsonb);
-- Old session whose only set was retracted (revised to incomplete): nothing performed to keep.
SELECT public.apply_workout_operation('exp-ret', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-ret', 'revise:r1:11', 11, 'revise', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Bench","set":1,"weightLbs":"","reps":"","notes":""}}'::jsonb);
-- Boundary: just under 24 h stays open; just over closes.
SELECT public.apply_workout_operation('exp-2359', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Row","set":1,"weightLbs":"80","reps":"10","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-2401', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Row","set":1,"weightLbs":"80","reps":"10","notes":"","performance":"performed"}}'::jsonb);
-- Two exercises logged in order: Bench 1, Bench 2, Squat 1, Squat 2 (revisions are epoch ms).
SELECT public.apply_workout_operation('exp-order', 'put:b1:100', 100, 'put', 'b1',
  '{"dateISO":"2026-10-12","row":{"id":"b1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-order', 'put:b2:101', 101, 'put', 'b2',
  '{"dateISO":"2026-10-12","row":{"id":"b2","exercise":"Bench","set":2,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-order', 'put:s1:102', 102, 'put', 's1',
  '{"dateISO":"2026-10-12","row":{"id":"s1","exercise":"Squat","set":1,"weightLbs":"200","reps":"5","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-order', 'put:s2:103', 103, 'put', 's2',
  '{"dateISO":"2026-10-12","row":{"id":"s2","exercise":"Squat","set":2,"weightLbs":"200","reps":"5","notes":"","performance":"performed"}}'::jsonb);
-- A later correction of Bench 1 must not move it after the squats.
SELECT public.apply_workout_operation('exp-order', 'put:b1:104', 104, 'put', 'b1',
  '{"dateISO":"2026-10-12","row":{"id":"b1","exercise":"Bench","set":1,"weightLbs":"105","reps":"8","notes":"","performance":"performed"}}'::jsonb);
-- Exercise grouping must beat both row-id and first-revision order: Bench z1, Squat a1, Bench m1.
SELECT public.apply_workout_operation('exp-group', 'put:z1:100', 100, 'put', 'z1',
  '{"dateISO":"2026-10-12","row":{"id":"z1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-group', 'put:a1:101', 101, 'put', 'a1',
  '{"dateISO":"2026-10-12","row":{"id":"a1","exercise":"Squat","set":1,"weightLbs":"200","reps":"5","notes":"","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('exp-group', 'put:m1:102', 102, 'put', 'm1',
  '{"dateISO":"2026-10-12","row":{"id":"m1","exercise":"Bench","set":2,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
-- A session that can never close (its id clashes with another user's history row): oldest of all.
SELECT public.apply_workout_operation('exp-stuck', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-12","row":{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"","performance":"performed"}}'::jsonb);
-- Fresh session: must stay open.
SELECT public.apply_workout_operation('exp-new', 'put:r1:10', 10, 'put', 'r1',
  '{"dateISO":"2026-10-13","row":{"id":"r1","exercise":"Squat","set":1,"weightLbs":"200","reps":"5","notes":"","performance":"performed"}}'::jsonb);
RESET ROLE;
-- A different caller identity must be restored after closing other users' sessions.
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.workout_operation_sessions SET created_at = now() - interval '25 hours'
WHERE session_id IN ('exp-old', 'exp-empty', 'exp-ret', 'exp-order', 'exp-group');
UPDATE public.workout_operation_sessions SET created_at = now() - interval '23 hours 59 minutes' WHERE session_id = 'exp-2359';
UPDATE public.workout_operation_sessions SET created_at = now() - interval '30 hours' WHERE session_id = 'exp-stuck';
INSERT INTO public.workouts (id, user_id, "dateISO", part, "createdAt") VALUES ('exp-stuck', '00000000-0000-0000-0000-0000000000e2', '2026-10-12', 'Other', 1);
-- Only this test's sessions may be due, whatever else the local database holds.
CREATE TEMP TABLE expiry_preexisting ON COMMIT DROP AS
  SELECT session_id FROM public.workout_operation_sessions
  WHERE state = 'open' AND created_at <= now() - interval '24 hours' AND session_id NOT LIKE 'exp-%';
UPDATE public.workout_operation_sessions SET created_at = now() - interval '24 hours 1 minute' WHERE session_id = 'exp-2401';

DO $$
DECLARE closed int; again int; snapshot jsonb; before text := current_setting('request.jwt.claim.sub', true);
BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public.expire_open_workout_sessions(timestamptz,integer)', 'EXECUTE'), 'authenticated can expire';
  ASSERT NOT has_function_privilege('anon', 'public.expire_open_workout_sessions(timestamptz,integer)', 'EXECUTE'), 'anon can expire';
  ASSERT NOT has_function_privilege('service_role', 'public.expire_open_workout_sessions(timestamptz,integer)', 'EXECUTE'), 'service_role can force-close sessions';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'expire-open-workout-sessions') = 1, 'cron job not scheduled';

  -- L2: a session that keeps failing must not starve the queue. With a batch of 1, the first run
  -- fails on the oldest (stuck) session; the next run must move on to a good one.
  PERFORM public.expire_open_workout_sessions(now(), 1);
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-stuck') = 'open', 'stuck session closed';
  ASSERT (SELECT expire_failed_at FROM public.workout_operation_sessions WHERE session_id = 'exp-stuck') IS NOT NULL, 'failure not recorded';
  ASSERT public.expire_open_workout_sessions(now(), 1) = 1, 'a failing session starved the queue';

  closed := public.expire_open_workout_sessions();
  ASSERT closed = 5 + (SELECT count(*) FROM expiry_preexisting), format('expected the 5 remaining due test sessions closed, got %s', closed);
  -- History groups adjacent rows by exercise: keep each exercise together, in logging order.
  ASSERT (SELECT string_agg(r->>'id', ',' ORDER BY o) FROM public.workouts w,
          jsonb_array_elements(w.rows_json::jsonb) WITH ORDINALITY AS x(r, o) WHERE w.id = 'exp-order') = 'b1,b2,s1,s2',
    'auto-closed snapshot interleaves exercises';
  ASSERT (SELECT string_agg(r->>'id', ',' ORDER BY o) FROM public.workouts w,
          jsonb_array_elements(w.rows_json::jsonb) WITH ORDINALITY AS x(r, o) WHERE w.id = 'exp-group') = 'z1,m1,a1',
    'snapshot not grouped by exercise first appearance';
  -- The latest committed receipt of a corrected row wins (b1 was corrected from 100 to 105).
  ASSERT (SELECT r->>'weightLbs' FROM public.workouts w, jsonb_array_elements(w.rows_json::jsonb) r
          WHERE w.id = 'exp-order' AND r->>'id' = 'b1') = '105', 'snapshot used a stale receipt';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-2359') = 'open', 'closed before 24 h';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-2401') = 'finalized', 'not closed after 24 h';
  -- Retracted-only: locked, but no history row (it would read as "workout done" for daily feedback).
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-ret') = 'finalized', 'retracted session not locked';
  ASSERT NOT EXISTS (SELECT 1 FROM public.workouts WHERE id = 'exp-ret'), 'retracted-only session produced a history row';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-old') = 'finalized', 'old session not closed';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-empty') = 'finalized', 'empty session not locked';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-new') = 'open', 'fresh session was closed';
  -- Sets kept: history row with the full snapshot, and the performed log rows survive.
  SELECT rows_json::jsonb INTO snapshot FROM public.workouts WHERE id = 'exp-old';
  ASSERT snapshot IS NOT NULL, 'no history row for the auto-closed session';
  ASSERT jsonb_array_length(snapshot) = 3, format('snapshot has %s rows', jsonb_array_length(snapshot));
  ASSERT (SELECT array_agg(r->>'id' ORDER BY r->>'id') FROM jsonb_array_elements(snapshot) r) = ARRAY['r1','r2','r3'], 'wrong snapshot rows';
  ASSERT (SELECT count(*) FROM public.workout_log WHERE p4_session_id = 'exp-old') = 2, 'performed sets lost';
  ASSERT (SELECT notes FROM public.workout_log WHERE p4_session_id = 'exp-old' AND p4_row_id = 'r1') = 'kept', 'set content changed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.workouts WHERE id = 'exp-empty'), 'empty session produced a history row';
  ASSERT current_setting('request.jwt.claim.sub', true) IS NOT DISTINCT FROM before, 'caller identity not restored';

  again := public.expire_open_workout_sessions();
  ASSERT again = 0, 'second run closed sessions again';
  ASSERT (SELECT state FROM public.workout_operation_sessions WHERE session_id = 'exp-stuck') = 'open', 'stuck session should stay open (retried later)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
DO $$
BEGIN
  -- H1 interaction: an auto-closed session counts as a completed session for next-set baselines.
  -- The baseline returns the latest completed session for the lift; both Bench candidates here are auto-closed.
  ASSERT EXISTS (SELECT 1 FROM public.exercise_history_baseline(ARRAY['Bench']) b WHERE b.workout_id IN ('exp-old', 'exp-order')),
    'auto-closed session missing from the H1 history baseline';
  ASSERT NOT EXISTS (SELECT 1 FROM public.exercise_history_baseline(ARRAY['Bench']) b WHERE b.workout_id = 'exp-empty'),
    'empty locked session appeared in the H1 history baseline';
  BEGIN
    PERFORM public.apply_workout_operation('exp-old', 'put:r4:20', 20, 'put', 'r4',
      '{"dateISO":"2026-10-12","row":{"id":"r4","exercise":"Bench","set":4,"weightLbs":"100","reps":"5","notes":"","performance":"performed"}}'::jsonb);
    RAISE EXCEPTION 'late live set accepted after auto-close';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Session finalized' THEN RAISE; END IF;
  END;
  -- The phone's later End (client revisions are epoch ms) still wins with its full snapshot.
  PERFORM public.apply_workout_operation('exp-old', 'finalize:exp-old:1791900000000', 1791900000000, 'finalize', NULL,
    '{"dateISO":"2026-10-12","part":"Push","createdAt":1791900000000,"rows":[{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"kept","performance":"performed"}],"logRows":[{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"kept","performance":"performed"}]}'::jsonb);
  ASSERT (SELECT part FROM public.workouts WHERE id = 'exp-old') = 'Push', 'phone End did not win';
  ASSERT (SELECT count(*) FROM public.workout_log WHERE p4_session_id = 'exp-old') = 1, 'phone snapshot not authoritative';
  RAISE NOTICE 'P4 expiry PASS: 6 closed (exercise grouping and order kept, latest receipt, failing session does not starve) (24h boundary pinned, retracted-only locked without history), sets kept, counted by H1 baseline, fresh open, late set rejected, phone End wins';
END $$;
ROLLBACK;
