-- P4 account-deletion purge (SPEC F1). LOCAL stack only, e.g.
--   psql "postgresql://postgres:postgres@127.0.0.1:5432/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/p4_account_purge.sql
-- Needs the full migration chain (auth.users, delete_user_data, 20261008000300).
-- Runs in one transaction and always rolls back.
BEGIN;
INSERT INTO auth.users (id, aud, role, email, instance_id)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'purge-a@ck.local', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'purge-b@ck.local', '00000000-0000-0000-0000-000000000000');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
SELECT public.apply_workout_operation('purge-sa', 'put:r1:1', 1, 'put', 'r1',
  '{"dateISO":"2026-10-08","row":{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"private note","performance":"performed"}}'::jsonb);
SELECT public.apply_workout_operation('purge-sa', 'final:2', 2, 'finalize', NULL,
  '{"dateISO":"2026-10-08","part":"Push","createdAt":1,"rows":[{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"private note","performance":"performed"}],"logRows":[{"id":"r1","exercise":"Bench","set":1,"weightLbs":"100","reps":"8","notes":"private note","performance":"performed"}]}'::jsonb);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
SELECT public.apply_workout_operation('purge-sb', 'put:r1:1', 1, 'put', 'r1',
  '{"dateISO":"2026-10-08","row":{"id":"r1","exercise":"Squat","set":1,"weightLbs":"200","reps":"5","performance":"performed"}}'::jsonb);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.delete_user_data('00000000-0000-0000-0000-0000000000a1');
RESET ROLE;

DO $$
DECLARE a_left int; b_left int;
BEGIN
  SELECT (SELECT count(*) FROM public.workout_operation_receipts WHERE session_id = 'purge-sa')
       + (SELECT count(*) FROM public.workout_operation_rows WHERE session_id = 'purge-sa')
       + (SELECT count(*) FROM public.workout_operation_sessions WHERE session_id = 'purge-sa')
       + (SELECT count(*) FROM public.workout_log WHERE p4_session_id = 'purge-sa')
    INTO a_left;
  SELECT (SELECT count(*) FROM public.workout_operation_receipts WHERE session_id = 'purge-sb')
       + (SELECT count(*) FROM public.workout_operation_rows WHERE session_id = 'purge-sb')
       + (SELECT count(*) FROM public.workout_operation_sessions WHERE session_id = 'purge-sb')
    INTO b_left;
  IF a_left <> 0 THEN RAISE EXCEPTION 'P4 purge FAIL: % deleted-user P4 rows survive delete_user_data', a_left; END IF;
  IF b_left < 3 THEN RAISE EXCEPTION 'P4 purge FAIL: other user lost P4 rows (% left)', b_left; END IF;
  RAISE NOTICE 'P4 purge PASS: deleted user 0 rows, other user % rows intact', b_left;
END $$;
ROLLBACK;
