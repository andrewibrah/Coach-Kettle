-- Run only in the private disposable runner, after 0047, the atomic save migration and
-- 20260924000100 (service_role target-write revoke). Fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE t text; p text; rpc regprocedure := 'public.save_nutrition_target_set_atomic(uuid,jsonb)'; owner_name name;
BEGIN
 FOREACH t IN ARRAY ARRAY['public.nutrition_target_sets','public.nutrition_target_day_overrides'] LOOP
  FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
   ASSERT has_table_privilege('service_role',t,p) = false, 'service_role still holds '||p||' on '||t;
  END LOOP;
  ASSERT has_table_privilege('service_role',t,'SELECT'), 'service_role lost SELECT on '||t;
  ASSERT has_table_privilege('authenticated',t,'SELECT'), 'authenticated lost SELECT on '||t;
 END LOOP;
 -- The trusted write path survives only because it runs with its owner's privileges.
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid = rpc;
 ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = rpc), 'save RPC must be SECURITY DEFINER';
 ASSERT has_function_privilege('service_role',rpc,'EXECUTE'), 'service_role lost RPC EXECUTE';
 FOREACH t IN ARRAY ARRAY['public.nutrition_target_sets','public.nutrition_target_day_overrides'] LOOP
  FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   ASSERT has_table_privilege(owner_name,t,p), 'RPC owner '||owner_name||' lacks '||p||' on '||t;
  END LOOP;
 END LOOP;
END $$;
INSERT INTO auth.users(id) VALUES ('c1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE service_role;
DO $$
DECLARE command text; denied boolean; r jsonb;
BEGIN
 FOREACH command IN ARRAY ARRAY[
   'INSERT INTO public.nutrition_target_sets(user_id,source) VALUES (''c1000000-0000-0000-0000-000000000001'',''manual'')',
   'UPDATE public.nutrition_target_sets SET source=''manual''',
   'DELETE FROM public.nutrition_target_sets',
   'TRUNCATE public.nutrition_target_sets CASCADE',
   'INSERT INTO public.nutrition_target_day_overrides DEFAULT VALUES',
   'UPDATE public.nutrition_target_day_overrides SET source=''manual''',
   'DELETE FROM public.nutrition_target_day_overrides',
   'TRUNCATE public.nutrition_target_day_overrides'] LOOP
  denied := false;
  BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  ASSERT denied, 'service_role direct write allowed: '||command;
 END LOOP;
 -- First save inserts parent + child; second save updates the parent and replaces children.
 r := public.save_nutrition_target_set_atomic('c1000000-0000-0000-0000-000000000001',
  '{"source":"manual","provenance":{"user_confirmed":true,"edited_after_suggestion":false},"targets":{"base":{"calories":2000},"day_overrides":[{"day_of_week":2,"target":{"calories":2100}}]}}');
 ASSERT r->>'user_id' = 'c1000000-0000-0000-0000-000000000001', 'first save receipt';
 r := public.save_nutrition_target_set_atomic('c1000000-0000-0000-0000-000000000001',
  '{"source":"manual","provenance":{"user_confirmed":true,"edited_after_suggestion":false},"targets":{"base":{"calories":2200},"day_overrides":[{"day_of_week":5,"target":{"calories":2300}}]}}');
 ASSERT r->'targets'->'base_target' = '{"calories":2200}'::jsonb, 'second save updated parent';
 ASSERT (SELECT count(*) FROM public.nutrition_target_sets WHERE user_id='c1000000-0000-0000-0000-000000000001') = 1, 'service_role SELECT / single parent';
 ASSERT (SELECT array_agg(day_of_week) FROM public.nutrition_target_day_overrides WHERE user_id='c1000000-0000-0000-0000-000000000001') = ARRAY[5], 'children replaced';
END $$;
RESET ROLE;
ROLLBACK;
\echo 'service_role target-write revoke SQL tests passed (fixtures rolled back)'
