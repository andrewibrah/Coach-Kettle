-- delete_user_data (20260924000900): two-user purge, ACL, idempotency and the §0 variant
-- where workouts/chats have no user_id column. Run ONLY against a disposable database
-- (delete_user_data_disposable.sh, or a local Supabase stack) where 0007, 0020,
-- subscription_events and the workouts/workout_log/chats tables exist and the migration is
-- applied. All fixtures are rolled back. Any failed ASSERT aborts with a non-zero exit.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE cfg text[];
BEGIN
 ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.delete_user_data(uuid)'::regprocedure), 'not SECURITY DEFINER';
 SELECT proconfig INTO cfg FROM pg_proc WHERE oid = 'public.delete_user_data(uuid)'::regprocedure;
 ASSERT cfg = ARRAY['search_path=pg_catalog, public'], 'search_path not pinned: ' || coalesce(cfg::text, 'null');
 ASSERT NOT has_function_privilege('authenticated', 'public.delete_user_data(uuid)', 'EXECUTE'), 'authenticated can EXECUTE';
 ASSERT NOT has_function_privilege('anon', 'public.delete_user_data(uuid)', 'EXECUTE'), 'anon can EXECUTE';
 ASSERT has_function_privilege('service_role', 'public.delete_user_data(uuid)', 'EXECUTE'), 'service_role cannot EXECUTE';
END $$;

INSERT INTO auth.users(id) VALUES
 ('a0000000-0000-4000-8000-00000000000a'), ('b0000000-0000-4000-8000-00000000000b');
INSERT INTO public.workouts(id, user_id) VALUES
 ('wa1', 'a0000000-0000-4000-8000-00000000000a'), ('wa2', 'a0000000-0000-4000-8000-00000000000a'),
 ('wb1', 'b0000000-0000-4000-8000-00000000000b');
INSERT INTO public.workout_log(workout_id, user_id) VALUES
 ('wa1', 'a0000000-0000-4000-8000-00000000000a'), ('wa1', 'a0000000-0000-4000-8000-00000000000a'),
 ('wa2', 'a0000000-0000-4000-8000-00000000000a'), ('wb1', 'b0000000-0000-4000-8000-00000000000b');
INSERT INTO public.chats(user_id, content) VALUES
 ('a0000000-0000-4000-8000-00000000000a', 'a says'), ('b0000000-0000-4000-8000-00000000000b', 'b says');
INSERT INTO public.event_logs(source, level, message, user_id) VALUES
 ('app', 'info', 'a1', 'a0000000-0000-4000-8000-00000000000a'),
 ('app', 'info', 'a2', 'a0000000-0000-4000-8000-00000000000a'),
 ('app', 'info', 'b1', 'b0000000-0000-4000-8000-00000000000b'),
 ('app', 'info', 'anon', NULL);
INSERT INTO public.subscription_events(user_id, event_type, raw_payload, idempotency_key) VALUES
 ('a0000000-0000-4000-8000-00000000000a', 'revenuecat_webhook', '{"app_user_id":"a0000000-0000-4000-8000-00000000000a","email":"a@example.invalid"}', 'rc:a1'),
 ('a0000000-0000-4000-8000-00000000000a', 'purchase_verified', '{"receipt":"a"}', 'otx_a_verified'),
 ('b0000000-0000-4000-8000-00000000000b', 'revenuecat_webhook', '{"app_user_id":"b0000000-0000-4000-8000-00000000000b"}', 'rc:b1');

-- authenticated (a signed-in client) cannot call it, even for its own uid.
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE raised boolean := false;
BEGIN
 BEGIN
  PERFORM public.delete_user_data('a0000000-0000-4000-8000-00000000000a');
 EXCEPTION WHEN insufficient_privilege THEN raised := true;
 END;
 ASSERT raised, 'authenticated executed delete_user_data';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE raised boolean := false;
BEGIN
 BEGIN
  PERFORM public.delete_user_data('b0000000-0000-4000-8000-00000000000b');
 EXCEPTION WHEN insufficient_privilege THEN raised := true;
 END;
 ASSERT raised, 'anon executed delete_user_data';
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb; raised boolean := false;
BEGIN
 r := public.delete_user_data('a0000000-0000-4000-8000-00000000000a');
 ASSERT r = '{"workout_log":3,"workouts":2,"chats":1,"chat_history":null,"event_logs":2,"subscription_events_scrubbed":2,"skipped":[]}'::jsonb,
   'unexpected counts ' || r::text;
 -- Idempotent: a retry purges nothing and does not fail.
 r := public.delete_user_data('a0000000-0000-4000-8000-00000000000a');
 ASSERT r = '{"workout_log":0,"workouts":0,"chats":0,"chat_history":null,"event_logs":0,"subscription_events_scrubbed":0,"skipped":[]}'::jsonb,
   'retry not idempotent ' || r::text;
 BEGIN
  PERFORM public.delete_user_data(NULL);
 EXCEPTION WHEN null_value_not_allowed THEN raised := true;
 END;
 ASSERT raised, 'NULL uid accepted';
END $$;
RESET ROLE;

DO $$ BEGIN
 -- A is gone / scrubbed.
 ASSERT NOT EXISTS (SELECT 1 FROM public.workouts WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'), 'A workouts left';
 ASSERT NOT EXISTS (SELECT 1 FROM public.workout_log WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'), 'A workout_log left';
 ASSERT NOT EXISTS (SELECT 1 FROM public.chats WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'), 'A chats left';
 ASSERT NOT EXISTS (SELECT 1 FROM public.event_logs WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'), 'A event_logs left';
 ASSERT (SELECT count(*) FROM public.subscription_events WHERE user_id = 'a0000000-0000-4000-8000-00000000000a') = 2, 'A billing rows removed';
 ASSERT NOT EXISTS (SELECT 1 FROM public.subscription_events WHERE user_id = 'a0000000-0000-4000-8000-00000000000a' AND raw_payload IS NOT NULL), 'A payload kept';
 -- B and the anonymous row are untouched.
 ASSERT (SELECT count(*) FROM public.workouts WHERE user_id = 'b0000000-0000-4000-8000-00000000000b') = 1, 'B workouts touched';
 ASSERT (SELECT count(*) FROM public.workout_log WHERE user_id = 'b0000000-0000-4000-8000-00000000000b') = 1, 'B workout_log touched';
 ASSERT (SELECT count(*) FROM public.chats WHERE user_id = 'b0000000-0000-4000-8000-00000000000b') = 1, 'B chats touched';
 ASSERT (SELECT count(*) FROM public.event_logs WHERE user_id = 'b0000000-0000-4000-8000-00000000000b') = 1, 'B event_logs touched';
 ASSERT (SELECT count(*) FROM public.event_logs WHERE user_id IS NULL) = 1, 'anonymous event_logs touched';
 ASSERT (SELECT raw_payload FROM public.subscription_events WHERE idempotency_key = 'rc:b1')
   = '{"app_user_id":"b0000000-0000-4000-8000-00000000000b"}'::jsonb, 'B payload touched';
END $$;

-- The stub workouts/workout_log FKs are NO ACTION (the 0011 shape). With A's rows purged,
-- the auth delete now succeeds; subscription_events.user_id is SET NULL by its FK.
DELETE FROM auth.users WHERE id = 'a0000000-0000-4000-8000-00000000000a';
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.subscription_events WHERE user_id IS NULL AND raw_payload IS NULL) = 2, 'A billing rows not detached';
END $$;

-- §0 variant: the live tables have no user_id column (20260113205331_remote_schema).
-- The purge skips them (null count) instead of failing, still handles the rest, and names
-- them in "skipped" so the Edge Function can log it. chat_history is absent here (expected
-- after remote_schema), so it is not reported as skipped.
SAVEPOINT no_user_id;
ALTER TABLE public.workouts DROP COLUMN user_id;
ALTER TABLE public.chats DROP COLUMN user_id;
INSERT INTO public.event_logs(source, level, message, user_id) VALUES ('app', 'info', 'b2', 'b0000000-0000-4000-8000-00000000000b');
SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
 r := public.delete_user_data('b0000000-0000-4000-8000-00000000000b');
 ASSERT r = '{"workout_log":1,"workouts":null,"chats":null,"chat_history":null,"event_logs":2,"subscription_events_scrubbed":1,"skipped":["workouts","chats"]}'::jsonb,
   'unexpected §0 counts ' || r::text;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.workouts) = 1, 'workouts without user_id were deleted';
 ASSERT (SELECT count(*) FROM public.chats) = 1, 'chats without user_id were deleted';
END $$;
ROLLBACK TO SAVEPOINT no_user_id;

ROLLBACK;
\echo 'delete_user_data SQL tests passed'
