-- Run only in a disposable database with 0047 and the atomic migration applied.
-- Fixtures/triggers/helpers are transaction-scoped and rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
INSERT INTO auth.users(id) VALUES
 ('b1000000-0000-0000-0000-000000000001'),
 ('b1000000-0000-0000-0000-000000000002'),
 ('b1000000-0000-0000-0000-000000000003');
CREATE FUNCTION pg_temp.payload(t jsonb DEFAULT '{"base":{"calories":10000.123,"protein_g":1000.456}}')
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('source','manual','provenance',
 '{"user_confirmed":true,"edited_after_suggestion":false}'::jsonb,'targets',t) $$;
CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_array(
  (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM public.nutrition_target_sets s),
  (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.nutrition_target_day_overrides d)) $$;
CREATE FUNCTION pg_temp.reject(p jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb := pg_temp.snapshot(); rejected boolean := false;
BEGIN
 BEGIN
  PERFORM public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',p);
 EXCEPTION WHEN invalid_parameter_value THEN rejected := true;
 END;
 ASSERT rejected, 'invalid payload was accepted: ' || p::text;
 ASSERT pg_temp.snapshot() = before_state, 'invalid payload mutated state';
END $$;

DO $$
DECLARE r jsonb; expected jsonb; old_overrides jsonb; p jsonb; v jsonb; k text; n integer := 0;
BEGIN
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',pg_temp.payload());
 ASSERT r->'targets'->'base_target' = '{"calories":10000.123,"protein_g":1000.456}'::jsonb, 'positive high decimals';
 ASSERT r->'targets'->'day_overrides' = '[]'::jsonb;
 ASSERT r->'targets'->'provenance' IS NOT DISTINCT FROM pg_temp.payload()->'provenance', 'confirmed provenance must persist';
 -- Compare exact receipt, including every persisted parent field and no extra envelope fields.
 SELECT jsonb_build_object('saved_target_set_id',s.id,'user_id',s.user_id,'source',s.source,
  'updated_at',s.updated_at,'targets',to_jsonb(s)||'{"day_overrides":[]}'::jsonb)
 INTO expected FROM public.nutrition_target_sets s WHERE s.user_id='b1000000-0000-0000-0000-000000000001';
 ASSERT r = expected, 'exact receipt projection';

 p := pg_temp.payload('{"training_day":{"calories":2345.678},"day_overrides":[{"day_of_week":6,"target":{"calories":3333.333},"source":"manual","updated_at":"client value is ignored"},{"day_of_week":1,"target":{"calories":2222.222},"source":"imported_existing"}]}');
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',p);
 ASSERT r->'targets'->'base_target' = 'null'::jsonb, 'omitted parent clears';
 SELECT jsonb_agg(jsonb_build_object('day_of_week',d.day_of_week,'target',d.target,'source',d.source,'updated_at',d.updated_at) ORDER BY d.day_of_week)
 INTO expected FROM public.nutrition_target_day_overrides d WHERE d.user_id='b1000000-0000-0000-0000-000000000001';
 ASSERT r->'targets'->'day_overrides' = expected, 'exact ordered child projection';
 ASSERT expected->0->>'day_of_week' = '1';
 ASSERT expected->1->>'updated_at' <> 'client value is ignored';
 old_overrides := (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.nutrition_target_day_overrides d);
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',pg_temp.payload());
 ASSERT r->'targets'->'day_overrides' = expected, 'omission preserves receipt';
 ASSERT old_overrides = (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.nutrition_target_day_overrides d), 'omission preserves IDs and timestamps';
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',pg_temp.payload('{"base":{"calories":1},"day_overrides":[]}'));
 ASSERT r->'targets'->'day_overrides' = '[]'::jsonb, 'explicit empty clears';
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',p);
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',pg_temp.payload('{"base":{"calories":1},"day_overrides":[{"day_of_week":3,"target":{"calories":1}}]}'));
 ASSERT jsonb_array_length(r->'targets'->'day_overrides')=1 AND r->'targets'->'day_overrides'->0->>'day_of_week'='3', 'replace not union';

 p := pg_temp.payload() || '{"source":"backend_suggested","suggestion_id":"sug-9","macro_preference":"custom descriptive preference","derivation_inputs":{"age_range":"25_34","sex":"other","height_cm_present":true,"weight_kg_present":false,"activity_level":"active","goal_type":"maintenance","training_days_per_week":3,"user_entered_calorie_target":2500.5,"macro_preference":"balanced"},"explanation":{"summary":"Reviewed","assumptions":[],"missing_inputs":["weight_kg"],"calculation_basis":"coarse","safety_notes":[]}}';
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',p);
 ASSERT (r->'targets'->>'stale_after')::timestamptz = now()+interval '60 days';
 ASSERT r->'targets'->'derivation_inputs_snapshot'=p->'derivation_inputs';
 ASSERT r->'targets'->'suggestion_id' = '"sug-9"'::jsonb, 'suggestion linkage persists';
 ASSERT (r->'targets'->>'updated_at')::timestamptz=now(), 'server timestamp';
 ASSERT r->'targets'->'explanation'=p->'explanation';
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000001',pg_temp.payload()||'{"source":"imported_existing","provenance":{"user_confirmed":true,"edited_after_suggestion":false,"imported_from_existing":true}}');
 ASSERT r->'targets'->'stale_after'='null'::jsonb;
 ASSERT r->'targets'->'suggestion_id'='null'::jsonb, 'omitted suggestion clears';
 ASSERT r->'targets'->'provenance' = '{"user_confirmed":true,"edited_after_suggestion":false,"imported_from_existing":true}'::jsonb, 'provenance replaced';
 ASSERT r->'targets'->'explanation'='null'::jsonb AND r->'targets'->'derivation_inputs_snapshot'='null'::jsonb;

 -- All malformed payloads must reject, not coerce/filter, with exact unchanged state.
 FOREACH v IN ARRAY ARRAY['null'::jsonb,'[]','1','"text"','{}'] LOOP PERFORM pg_temp.reject(v); n:=n+1; END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements('[null,"local_draft","bad",1,true]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object('source',v)); n:=n+1;
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.payload()-'source');
 PERFORM pg_temp.reject(pg_temp.payload()-'provenance');
 FOR v IN SELECT value FROM jsonb_array_elements('[null,{}, {"user_confirmed":"true","edited_after_suggestion":false},{"user_confirmed":false,"edited_after_suggestion":false},{"user_confirmed":true},{"user_confirmed":true,"edited_after_suggestion":"false"},{"user_confirmed":true,"edited_after_suggestion":false,"imported_from_existing":1},{"user_confirmed":true,"edited_after_suggestion":false,"user_id":"spoof"}]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object('provenance',v)); n:=n+1;
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.payload()||'{"source":"imported_existing"}');
 PERFORM pg_temp.reject(pg_temp.payload()||'{"source":"backend_suggested","provenance":{"user_confirmed":true,"edited_after_suggestion":true}}');
 FOR v IN SELECT value FROM jsonb_array_elements('[null,42,"", "   ",true]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object('suggestion_id',v)); n:=n+1;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['user_id','id','target_set_id','height_cm','weight_kg','date_of_birth','stale_after','updated_at'] LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object(k,'spoof')); n:=n+1;
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements('[null,{},[],{"protein_g":1},{"calories":null},{"calories":"2000"},{"calories":true},{"calories":0},{"calories":-1},{"calories":"NaN"},{"calories":"Infinity"},{"calories":1,"protein_g":0},{"calories":1,"fat_g":null},{"calories":1,"carbs_g":"3"},{"calories":1,"user_id":"spoof"}]') LOOP
  FOREACH k IN ARRAY ARRAY['base','training_day','rest_day'] LOOP
   PERFORM pg_temp.reject(pg_temp.payload(jsonb_build_object('base','{"calories":1}'::jsonb,k,v))); n:=n+1;
  END LOOP;
  PERFORM pg_temp.reject(pg_temp.payload(jsonb_build_object('base','{"calories":1}'::jsonb,'day_overrides',jsonb_build_array(jsonb_build_object('day_of_week',0,'target',v))))); n:=n+1;
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.payload('{}'));
 PERFORM pg_temp.reject(pg_temp.payload('{"day_overrides":[]}'));
 FOR v IN SELECT value FROM jsonb_array_elements('[null,{},"x",[null],[{}],[{"day_of_week":"1","target":{"calories":1}}],[{"day_of_week":1.2,"target":{"calories":1}}],[{"day_of_week":7,"target":{"calories":1}}],[{"day_of_week":-1,"target":{"calories":1}}],[{"day_of_week":1,"target":{"calories":1},"source":"local_draft"}],[{"day_of_week":1,"target":{"calories":1},"source":null}],[{"day_of_week":1,"target":{"calories":1},"target_set_id":"spoof"}],[{"day_of_week":1,"target":{"calories":1}},{"day_of_week":1,"target":{"calories":2}}]]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload(jsonb_build_object('base','{"calories":1}'::jsonb,'day_overrides',v))); n:=n+1;
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.payload(jsonb_build_object('base','{"calories":1}'::jsonb,'day_overrides',(SELECT jsonb_agg(jsonb_build_object('day_of_week',i,'target','{"calories":1}'::jsonb)) FROM generate_series(0,7)i))));
 FOR v IN SELECT value FROM jsonb_array_elements('[null,[],{"weight_kg":80},{"height_cm":180},{"date_of_birth":"2000-01-01"},{"user_id":"spoof"},{"height_cm_present":"true"},{"training_days_per_week":"3"},{"age_range":42}]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object('derivation_inputs',v)); n:=n+1;
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements('[null,{},[],{"summary":"x","assumptions":[],"missing_inputs":[],"calculation_basis":1},{"summary":"x","assumptions":[1],"missing_inputs":[],"calculation_basis":"x"},{"summary":"x","assumptions":[],"missing_inputs":[],"calculation_basis":"x","weight_kg":80}]') LOOP
  PERFORM pg_temp.reject(pg_temp.payload()||jsonb_build_object('explanation',v)); n:=n+1;
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.payload()||'{"macro_preference":null}');
 PERFORM pg_temp.reject(pg_temp.payload()||'{"macro_preference":42}');
 RAISE NOTICE 'Validation matrix passed (% loop cases plus explicit cases)', n;
 -- Maximum legal weekday set; preserve actual numeric decimals without bounds.
 p := pg_temp.payload(jsonb_build_object('rest_day','{"calories":0.000001,"fat_g":999999.123456}'::jsonb,
   'day_overrides',(SELECT jsonb_agg(jsonb_build_object('day_of_week',i,'target','{"calories":0.125}'::jsonb)) FROM generate_series(0,6)i)));
 r := public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000003',p);
 ASSERT jsonb_array_length(r->'targets'->'day_overrides')=7, 'all seven weekdays accepted';
 ASSERT r->'targets'->'rest_day_target'=p->'targets'->'rest_day', 'small/high fractional values preserved';
 ASSERT r->'targets'->'base_target'='null'::jsonb AND r->'targets'->'training_day_target'='null'::jsonb;
 DELETE FROM auth.users WHERE id='b1000000-0000-0000-0000-000000000003';
 INSERT INTO auth.users(id) VALUES ('b1000000-0000-0000-0000-000000000003');
END $$;

-- Failure after parent write and after child deletion/insertion must roll back.
CREATE FUNCTION pg_temp.fail_late() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('test.fail_parent',true)='yes' OR
    (TG_OP='DELETE' AND current_setting('test.fail_delete',true)='yes') THEN
  RAISE EXCEPTION 'test-only late failure' USING ERRCODE='P0001';
 END IF;
 IF TG_TABLE_NAME='nutrition_target_day_overrides' AND TG_OP='INSERT' THEN
  IF NEW.day_of_week=6 AND current_setting('test.fail_child',true)='yes' THEN
   ASSERT EXISTS (SELECT 1 FROM public.nutrition_target_day_overrides
     WHERE target_set_id=NEW.target_set_id AND day_of_week=1), 'must fail after earlier child inserted';
   RAISE EXCEPTION 'test-only late child failure' USING ERRCODE='P0001';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_parent_failure AFTER INSERT OR UPDATE ON public.nutrition_target_sets FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_late();
CREATE TRIGGER test_child_failure AFTER INSERT ON public.nutrition_target_day_overrides FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_late();
CREATE TRIGGER test_delete_failure AFTER DELETE ON public.nutrition_target_day_overrides FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.fail_late();
DO $$
DECLARE s jsonb; failed boolean; flag text; u uuid;
BEGIN
 FOREACH u IN ARRAY ARRAY['b1000000-0000-0000-0000-000000000001'::uuid,'b1000000-0000-0000-0000-000000000003'::uuid] LOOP
 FOREACH flag IN ARRAY ARRAY['test.fail_parent','test.fail_delete','test.fail_child'] LOOP
  s:=pg_temp.snapshot(); failed:=false; PERFORM set_config(flag,'yes',true);
  BEGIN
   PERFORM public.save_nutrition_target_set_atomic(u,pg_temp.payload('{"base":{"calories":1111},"day_overrides":[{"day_of_week":1,"target":{"calories":1}},{"day_of_week":6,"target":{"calories":6}}]}'));
  EXCEPTION WHEN raise_exception THEN failed:=true;
  END;
  PERFORM set_config(flag,'no',true);
  ASSERT failed AND pg_temp.snapshot()=s, 'late failure rollback: '||flag;
  RAISE NOTICE 'Exact rollback passed: % (user %)', flag, u;
 END LOOP;
 END LOOP;
END $$;

-- Verify effective ACLs and actual denied statements (not only catalog text).
DO $$
DECLARE role_name text; table_name text; privilege_name text; command text; denied boolean;
BEGIN
 -- service_role keeps table DML until the deferred revocation (plan §I) ships alongside the
 -- new nutrition-targets function that no longer needs direct table access.
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH table_name IN ARRAY ARRAY['nutrition_target_sets','nutrition_target_day_overrides'] LOOP
   FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
    ASSERT NOT has_table_privilege(role_name,'public.'||table_name,privilege_name), 'DML ACL remains';
   END LOOP;
  END LOOP;
 END LOOP;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  ASSERT has_function_privilege(role_name,'public.save_nutrition_target_set_atomic(uuid,jsonb)','EXECUTE') = (role_name='service_role');
  EXECUTE 'SET LOCAL ROLE '||quote_ident(role_name);
  FOREACH command IN ARRAY ARRAY[
    'SELECT public.save_nutrition_target_set_atomic(null,null)',
    'INSERT INTO public.nutrition_target_sets DEFAULT VALUES',
    'UPDATE public.nutrition_target_sets SET source=''manual''',
    'DELETE FROM public.nutrition_target_sets',
    'TRUNCATE public.nutrition_target_sets CASCADE',
    'INSERT INTO public.nutrition_target_day_overrides DEFAULT VALUES',
    'UPDATE public.nutrition_target_day_overrides SET source=''manual''',
    'DELETE FROM public.nutrition_target_day_overrides',
    'TRUNCATE public.nutrition_target_day_overrides'] LOOP
    -- service_role still has table DML (deferred revocation, plan §I) and RPC EXECUTE, so
    -- neither the direct-table commands nor the RPC call are expected to be denied here.
    IF role_name='service_role' THEN CONTINUE; END IF;
    denied:=false;
    BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    ASSERT denied, 'ACL bypass: '||command;
  END LOOP;
  RESET ROLE;
 END LOOP;
 ASSERT has_function_privilege('service_role','public.save_nutrition_target_set_atomic(uuid,jsonb)','EXECUTE');
 ASSERT has_table_privilege('authenticated','public.nutrition_target_sets','SELECT');
 ASSERT has_table_privilege('authenticated','public.nutrition_target_day_overrides','SELECT');
END $$;
SET LOCAL ROLE service_role;
SELECT public.save_nutrition_target_set_atomic('b1000000-0000-0000-0000-000000000002',
 '{"source":"manual","provenance":{"user_confirmed":true,"edited_after_suggestion":false},"targets":{"base":{"calories":2000},"day_overrides":[{"day_of_week":2,"target":{"calories":2000}}]}}') IS NOT NULL AS service_rpc_succeeded;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM public.nutrition_target_sets), 'own SELECT';
 ASSERT NOT EXISTS(SELECT 1 FROM public.nutrition_target_sets WHERE user_id<>'b1000000-0000-0000-0000-000000000001'), 'cross-user parent SELECT';
 ASSERT (SELECT count(*)=1 FROM public.nutrition_target_day_overrides), 'own child SELECT';
 ASSERT NOT EXISTS(SELECT 1 FROM public.nutrition_target_day_overrides WHERE user_id<>'b1000000-0000-0000-0000-000000000001'), 'cross-user child SELECT';
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Atomic nutrition SQL tests passed (fixtures rolled back)'
