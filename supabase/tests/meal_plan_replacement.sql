-- Synthetic arithmetic fixtures only; not real nutritional recommendations.
CREATE TABLE public.meal_test_fixture AS
SELECT jsonb_build_object('version',1,'days',jsonb_agg(jsonb_build_object('date',('2026-09-13'::date+d)::text,'is_training_day',false,'target',jsonb_build_object('calories',2000,'protein_g',100,'carbs_g',250,'fat_g',60)) ORDER BY d)) snapshot
FROM generate_series(0,6) d;
ALTER TABLE public.meal_test_fixture ADD meals jsonb;
UPDATE public.meal_test_fixture SET meals=(SELECT jsonb_agg(jsonb_build_object('date',('2026-09-13'::date+d)::text,'day_of_week',d,'is_training_day',false,'meal_slot',slot,'title','Fixture','description','','calories',500,'protein_g',25,'carbs_g',62.5,'fat_g',15,'fiber_g',5,'items',jsonb_build_array(jsonb_build_object('name','Test oats','grams',100,'calories',500,'protein_g',25,'carbs_g',62.5,'fat_g',15))) ORDER BY d,slot) FROM generate_series(0,6) d CROSS JOIN unnest(ARRAY['breakfast','lunch','dinner','snack']) slot);
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$ DECLARE f record; first_id uuid; before_meals jsonb; r jsonb; BEGIN
 SELECT * INTO f FROM public.meal_test_fixture;
 r := public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',f.snapshot,f.meals,'first');
 ASSERT (r->>'meals_inserted')::int=28;
 first_id := (r->'plan'->>'id')::uuid;
 r := public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',f.snapshot,f.meals,'second');
 ASSERT (r->'plan'->>'id')::uuid=first_id, 'same unique parent reused';
 PERFORM public.replace_meal_plan('22222222-2222-4222-8222-222222222222','2026-09-13',f.snapshot,f.meals,'other owner');
 ASSERT (SELECT count(*) FROM public.planned_meals WHERE user_id='11111111-1111-4111-8111-111111111111')=28;
 ASSERT (SELECT count(*) FROM public.planned_meals WHERE user_id='22222222-2222-4222-8222-222222222222')=28;
 BEGIN
  PERFORM public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',f.snapshot,jsonb_set(f.meals,'{27,calories}','123'),'bad');
  RAISE EXCEPTION 'invalid totals accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT (SELECT notes FROM public.meal_plans WHERE id=first_id)='second';
 ASSERT NOT has_function_privilege('authenticated','public.replace_meal_plan(uuid,date,jsonb,jsonb,text)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.replace_meal_plan(uuid,date,jsonb,jsonb,text)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.replace_meal_plan(uuid,date,jsonb,jsonb,text)','EXECUTE');
 ASSERT NOT has_table_privilege('authenticated','public.meal_plans','INSERT');
 ASSERT NOT has_table_privilege('authenticated','public.planned_meals','DELETE');
END $$;
CREATE FUNCTION public.fail_late_meal_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.sort_order=27 AND current_setting('meal_test.fail',true)='yes' THEN RAISE EXCEPTION 'late failure' USING ERRCODE='P0002'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER meal_test_late BEFORE INSERT ON public.planned_meals FOR EACH ROW EXECUTE FUNCTION public.fail_late_meal_test();
DO $$ DECLARE f record; before_parent jsonb; before_children jsonb; BEGIN
 SELECT * INTO f FROM public.meal_test_fixture;
 SELECT to_jsonb(p) INTO before_parent FROM public.meal_plans p WHERE user_id='11111111-1111-4111-8111-111111111111';
 SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO before_children FROM public.planned_meals m WHERE user_id='11111111-1111-4111-8111-111111111111';
 PERFORM set_config('meal_test.fail','yes',true);
 BEGIN
  PERFORM public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',f.snapshot || '{"test_revision":2}'::jsonb,f.meals,'late replacement');
  RAISE EXCEPTION 'late failure not reached';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 ASSERT before_parent=(SELECT to_jsonb(p) FROM public.meal_plans p WHERE user_id='11111111-1111-4111-8111-111111111111'), 'parent changed after rollback';
 ASSERT before_children=(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.planned_meals m WHERE user_id='11111111-1111-4111-8111-111111111111'), 'children changed after rollback';
END $$;
DROP TRIGGER meal_test_late ON public.planned_meals;
-- Exercise privilege enforcement, not just catalog metadata (fixture only).
GRANT SELECT ON public.meal_test_fixture TO service_role;
SET ROLE service_role;
SELECT (public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',snapshot,meals,'service role')->>'meals_inserted')::int = 28 AS service_success FROM public.meal_test_fixture;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.replace_meal_plan('22222222-2222-4222-8222-222222222222','2026-09-13','{}','[]',NULL);
  RAISE EXCEPTION 'authenticated cross-user call accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13','{}','[]',NULL);
  RAISE EXCEPTION 'anonymous call accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE f record; bad jsonb; before_parent jsonb; before_children jsonb; BEGIN
 SELECT * INTO f FROM public.meal_test_fixture;
 SELECT to_jsonb(p) INTO before_parent FROM public.meal_plans p WHERE user_id='11111111-1111-4111-8111-111111111111';
 SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO before_children FROM public.planned_meals m WHERE user_id='11111111-1111-4111-8111-111111111111';
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  f.meals - 27,
  jsonb_set(f.meals,'{27}',f.meals->0),
  jsonb_set(f.meals,'{0,date}','"2026-09-20"'),
  jsonb_set(f.meals,'{0,is_training_day}','true'),
  jsonb_set(f.meals,'{0,items,0,grams}','0'),
  jsonb_set(f.meals,'{0,items,0,name}','"placeholder"'),
  jsonb_set(f.meals,'{0,items,0,protein_g}','"25"'),
  jsonb_set(f.meals,'{0,fiber_g}','-1')
 )) LOOP
  BEGIN
   PERFORM public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',f.snapshot,bad,'invalid');
   RAISE EXCEPTION 'malformed payload accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 ASSERT before_parent=(SELECT to_jsonb(p) FROM public.meal_plans p WHERE user_id='11111111-1111-4111-8111-111111111111');
 ASSERT before_children=(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.planned_meals m WHERE user_id='11111111-1111-4111-8111-111111111111');
END $$;
\echo 'PASS meal replacement, owner isolation, executed role grants, malformed payloads, snapshot/notes/children late rollback'
