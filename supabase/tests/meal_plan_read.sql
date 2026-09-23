-- Runs against actual 0033 schema + replacement/read migrations in private PG15.
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r := public.read_meal_plan('11111111-1111-4111-8111-111111111111');
 ASSERT r->'plan'->>'user_id'='11111111-1111-4111-8111-111111111111';
 ASSERT jsonb_array_length(r->'meals')=28;
 ASSERT (SELECT bool_and(value->>'user_id'=r->'plan'->>'user_id' AND value->>'plan_id'=r->'plan'->>'id') FROM jsonb_array_elements(r->'meals'));
 ASSERT (SELECT bool_and((value->>'sort_order')::int=ord-1) FROM jsonb_array_elements(r->'meals') WITH ORDINALITY m(value,ord));
 ASSERT public.read_meal_plan('33333333-3333-4333-8333-333333333333')='{"plan":null,"meals":[]}'::jsonb;
 ASSERT public.read_meal_plan(NULL)='{"plan":null,"meals":[]}'::jsonb;
 ASSERT public.read_meal_plan('22222222-2222-4222-8222-222222222222')->'plan'->>'notes'='other owner';
END $$;
RESET ROLE;
-- The legacy FK pins plan_id but not child owner. A corrupt cross-owner row
-- must not leak through service-role bypass of RLS.
BEGIN;
UPDATE public.planned_meals SET user_id='22222222-2222-4222-8222-222222222222'
WHERE user_id='11111111-1111-4111-8111-111111111111' AND sort_order=0;
DO $$ DECLARE r jsonb; BEGIN
 r := public.read_meal_plan('11111111-1111-4111-8111-111111111111');
 ASSERT jsonb_array_length(r->'meals')=27;
 ASSERT (SELECT bool_and(value->>'user_id'='11111111-1111-4111-8111-111111111111') FROM jsonb_array_elements(r->'meals'));
END $$;
ROLLBACK;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.read_meal_plan('22222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION 'authenticated accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.read_meal_plan('11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'anon accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Latest active week, not a newer archived plan.
BEGIN;
INSERT INTO public.meal_plans(user_id,week_start_date,status,targets_snapshot,notes)
VALUES ('11111111-1111-4111-8111-111111111111','2026-09-20','active','{}','latest'),
 ('11111111-1111-4111-8111-111111111111','2026-09-27','archived','{}','archived');
DO $$ BEGIN
 ASSERT public.read_meal_plan('11111111-1111-4111-8111-111111111111')->'plan'->>'notes'='latest';
END $$;
ROLLBACK;
\echo 'PASS coherent read: service execution, empty, ordered children, both owner filters, latest active, denied anon/authenticated'
