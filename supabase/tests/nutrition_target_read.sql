-- Run only in the private disposable runner, after actual 0047 + save migration.
BEGIN;
DO $$ BEGIN
 ASSERT has_function_privilege('service_role','public.read_nutrition_target_set(uuid)','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.read_nutrition_target_set(uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.read_nutrition_target_set(uuid)','EXECUTE');
 ASSERT (SELECT NOT prosecdef AND provolatile = 's' AND proconfig = ARRAY['search_path=pg_catalog, public'] FROM pg_proc WHERE oid='public.read_nutrition_target_set(uuid)'::regprocedure);
END $$;
INSERT INTO auth.users VALUES ('aaaaaaaa-1111-4111-8111-111111111111'), ('bbbbbbbb-1111-4111-8111-111111111111');
INSERT INTO public.nutrition_target_sets (user_id, source, base_target) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','local_draft','{"calories":2100}'),
 ('bbbbbbbb-1111-4111-8111-111111111111','manual','{"calories":2500}');
INSERT INTO public.nutrition_target_day_overrides(target_set_id,user_id,day_of_week,target,source)
 SELECT id,user_id,d,'{"calories":1900}','local_draft' FROM public.nutrition_target_sets CROSS JOIN (VALUES(6),(0),(3)) days(d) WHERE user_id='aaaaaaaa-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
DO $$ DECLARE r jsonb; BEGIN
 -- Authenticated owner argument is never trusted, even for spoofed/missing ids.
 r := public.read_nutrition_target_set('bbbbbbbb-1111-4111-8111-111111111111');
 ASSERT r->>'user_id' = auth.uid()::text;
 ASSERT r->>'source' = 'local_draft' AND r->'provenance' = 'null'::jsonb;
 ASSERT r->'day_overrides'->0->>'day_of_week' = '0';
 ASSERT r->'day_overrides'->1->>'day_of_week' = '3';
 ASSERT r->'day_overrides'->2->>'day_of_week' = '6';
 ASSERT (SELECT count(*) FROM public.nutrition_target_sets) = 1;
 ASSERT NOT has_table_privilege(current_user,'public.nutrition_target_sets','UPDATE');
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r := public.read_nutrition_target_set('bbbbbbbb-1111-4111-8111-111111111111');
 ASSERT r->>'user_id' = 'bbbbbbbb-1111-4111-8111-111111111111';
 ASSERT r->'day_overrides' = '[]'::jsonb;
 ASSERT public.read_nutrition_target_set('cccccccc-1111-4111-8111-111111111111') IS NULL;
 -- service_role table INSERT is deferred (plan §I) until the nutrition-targets function
 -- stops writing these tables directly, so this is intentionally not revoked yet.
 ASSERT has_table_privilege(current_user,'public.nutrition_target_day_overrides','INSERT');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.read_nutrition_target_set('aaaaaaaa-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'anonymous read unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
-- INVOKER must surface a SELECT failure, not mask it as an absent saved row.
REVOKE SELECT ON public.nutrition_target_day_overrides FROM service_role;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN
  PERFORM public.read_nutrition_target_set('aaaaaaaa-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'read bypassed existing table ACL';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
