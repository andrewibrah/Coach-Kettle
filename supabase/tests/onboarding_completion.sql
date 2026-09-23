-- Run after migrations on a disposable Supabase database as postgres:
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/onboarding_completion.sql
BEGIN;
CREATE FUNCTION pg_temp.check_ok(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END;
$$;
CREATE FUNCTION pg_temp.snapshot(u uuid) RETURNS jsonb LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'profile', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.profiles t WHERE user_id=u),
        'tracked', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.pr_tracked_lifts t WHERE user_id=u),
        'prs', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.pr_lifts t WHERE user_id=u),
        'templates', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workout_templates t WHERE user_id=u),
        'items', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workout_template_items t WHERE user_id=u),
        'receipts', (SELECT jsonb_agg(to_jsonb(t) ORDER BY request_id) FROM public.onboarding_receipts t WHERE user_id=u)
    );
$$;
CREATE FUNCTION pg_temp.reject_onboarding_receipt() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'test receipt insert failure';
END;
$$;
SELECT pg_temp.check_ok(NOT has_function_privilege('anon',
    'public.complete_onboarding_atomic(uuid,jsonb)', 'EXECUTE'), 'anon execute revoked');
SELECT pg_temp.check_ok(has_function_privilege('authenticated',
    'public.complete_onboarding_atomic(uuid,jsonb)', 'EXECUTE'), 'authenticated execute granted');
SELECT pg_temp.check_ok(NOT has_table_privilege('authenticated',
    'public.onboarding_receipts', 'SELECT,INSERT,UPDATE,DELETE'), 'receipt inaccessible');
DO $$
DECLARE
    u uuid := gen_random_uuid();
    legacy uuid := gen_random_uuid();
    failing uuid := gen_random_uuid();
    req uuid := gen_random_uuid();
    payload jsonb := '{
      "profile":{"height_value":180,"height_unit":"cm","dob":"1990-01-02",
        "current_weight":80,"goal_weight":85,"weight_unit":"kg","focus":"strength"},
      "tracked_lifts":["Bench Press"],
      "pr_values":[{"lift_name":" bench press ","weight_lbs":200,"reps":5}],
      "workout_templates":[
        {"name":"Same name","description":"First","items":[{"lift_name":"Bench Press",
          "target_sets":3,"target_reps":5,"target_weight":100,"notes":"Controlled"}]},
        {"name":"Same name","items":[]}
      ]}'::jsonb;
    empty_payload jsonb := '{"profile":{},"tracked_lifts":[],"pr_values":[],"workout_templates":[]}';
    v_result jsonb;
    replay jsonb;
    before_state jsonb;
    bad jsonb;
    case_no integer := 0;
    expected text;
    other_state text;
    expected_errors text[] := ARRAY[
        'invalid numeric value: target_sets', 'invalid numeric value: target_reps',
        'invalid numeric value: reps', 'number required: weight_lbs',
        'untracked or duplicate PR lift', 'duplicate tracked lift',
        'tracked lift must be nonblank string', 'workout_templates must be an array',
        'expected item object', 'number required: height_value', 'unsupported profile enum',
        'dob age must be 13 through 120', 'dob must be a real ISO date', 'dob must be ISO date',
        'dob age must be 13 through 120', 'dob age must be 13 through 120',
        'height outside supported bounds', 'height outside supported bounds', 'unsupported profile enum',
        'weight outside supported bounds', 'weight outside supported bounds', 'unsupported profile enum',
        'unknown field: unknown', 'height outside supported bounds', 'weight outside supported bounds',
        'invalid payload keys', 'unknown field: user_id', 'nonblank string required: focus_other',
        'pr_values must be an array'];
    preserved_pr jsonb;
    preserved_template jsonb;
    fixture uuid;
    birthday date;
    state_replay_req uuid := gen_random_uuid();
    state_replay_payload jsonb;
    deleted_profile_req uuid := gen_random_uuid();
    saved_receipt jsonb;
    saved_counts jsonb;
    field_path text[];
BEGIN
    FOREACH fixture IN ARRAY ARRAY[u,legacy,failing] LOOP
        INSERT INTO auth.users(id, aud, role, email)
        VALUES (fixture,'authenticated','authenticated',fixture::text || '@onboarding.invalid');
        INSERT INTO public.profiles(user_id) VALUES (fixture) ON CONFLICT (user_id) DO NOTHING;
        INSERT INTO public.pr_tracked_lifts(user_id,lift_name) VALUES (fixture,'Existing lift');
        INSERT INTO public.pr_lifts(user_id,lift_name,weight_lbs,reps,estimated_1rm)
        VALUES (fixture,'Existing lift',100,1,public.epley_1rm(100,1));
        INSERT INTO public.workout_templates(user_id,name) VALUES (fixture,'Same name');
    END LOOP;
    other_state := pg_temp.snapshot(legacy)::text;
    SELECT to_jsonb(t) INTO preserved_pr FROM public.pr_lifts t WHERE user_id=u;
    SELECT to_jsonb(t) INTO preserved_template FROM public.workout_templates t WHERE user_id=u;
    -- Also exercise the normalized PR conflict target against a pre-existing row.
    INSERT INTO public.pr_lifts(user_id,lift_name,weight_lbs,reps,estimated_1rm)
    VALUES (u,'BENCH PRESS',150,1,public.epley_1rm(150,1));



    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(req,payload);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    replay := public.complete_onboarding_atomic(req,jsonb_set(payload,'{pr_values,0,weight_lbs}','200.00'));
    RESET ROLE;

    PERFORM pg_temp.check_ok(pg_temp.snapshot(legacy)::text = other_state, 'other user byte-for-byte unchanged');
    PERFORM pg_temp.check_ok(v_result = replay, 'exact explicit replay');
    PERFORM pg_temp.check_ok((SELECT onboarding_completed AND height_value=180 AND height_unit='cm'
        AND dob='1990-01-02'::date AND current_weight=80 AND goal_weight=85 AND weight_unit='kg'
        AND focus='strength' AND ai_context <> '{}'::jsonb FROM public.profiles WHERE user_id=u), 'profile/context readback');
    PERFORM pg_temp.check_ok((SELECT count(*)=1 FROM public.pr_tracked_lifts
        WHERE user_id=u AND lift_name='Bench Press' AND is_active AND display_order=0), 'tracked readback');
    PERFORM pg_temp.check_ok((SELECT count(*)=1 FROM public.pr_lifts WHERE user_id=u
        AND lower(trim(lift_name))='bench press' AND weight_lbs=200 AND reps=5
        AND estimated_1rm=public.epley_1rm(200,5) AND estimated_1rm > 0
        AND estimated_1rm::text NOT IN ('NaN','Infinity','-Infinity')), 'PR upsert readback');
    PERFORM pg_temp.check_ok((SELECT count(*)=3 FROM public.workout_templates WHERE user_id=u), 'duplicate names append once');
    PERFORM pg_temp.check_ok((SELECT count(*)=1 FROM public.workout_template_items WHERE user_id=u
        AND lift_name='Bench Press' AND target_sets=3 AND target_reps=5 AND target_weight=100
        AND notes='Controlled' AND template_id::text = v_result->'template_ids'->>0), 'item readback');
    PERFORM pg_temp.check_ok((SELECT to_jsonb(t)=preserved_pr FROM public.pr_lifts t
        WHERE user_id=u AND lift_name='Existing lift'), 'old PR preserved');
    PERFORM pg_temp.check_ok(EXISTS(SELECT FROM public.workout_templates t
        WHERE user_id=u AND to_jsonb(t)=preserved_template), 'old template preserved');
    PERFORM pg_temp.check_ok((SELECT count(*)=1 AND bool_and(t.result=v_result)
        FROM public.onboarding_receipts t WHERE user_id=u), 'receipt readback');
    before_state := pg_temp.snapshot(u);
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',u::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(req,empty_payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: conflict accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='request ID payload conflict','conflict reason');
    END;
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',u::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(NULL,payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: ambiguous legacy call accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='onboarding already completed; ambiguous new request','completion rejection reason');
    END;
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',u::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(gen_random_uuid(),payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: new ID after completion accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='onboarding already completed; ambiguous new request','completion rejection reason');
    END;
    PERFORM pg_temp.check_ok(pg_temp.snapshot(u)=before_state,'post-completion rejection unchanged');

    PERFORM set_config('request.jwt.claim.sub',legacy::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',legacy,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(NULL,payload);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub',legacy::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',legacy,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    replay := public.complete_onboarding_atomic(NULL,payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok(v_result=replay,'NULL-ID lost response replay');
    PERFORM pg_temp.check_ok((SELECT count(*)=3 FROM public.workout_templates WHERE user_id=legacy),'legacy no duplicate templates');
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',legacy::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',legacy,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(NULL,empty_payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: legacy edit accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='onboarding already completed; ambiguous new request','completion rejection reason');
    END;

    UPDATE public.profiles SET height_value=NULL, height_unit=NULL,
        current_weight=NULL, goal_weight=NULL, weight_unit=NULL WHERE user_id=failing;
    before_state := pg_temp.snapshot(failing);
    -- Natural late payload-validation failure; no production failure switch.
    -- Each call is a subtransaction; exception must leave ALL tables unchanged.
    FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
        jsonb_set(payload,'{workout_templates,0,items,0,target_sets}','0'),
        jsonb_set(payload,'{workout_templates,0,items,0,target_reps}','2147483648'),
        jsonb_set(payload,'{pr_values,0,reps}','1.5'),
        jsonb_set(payload,'{pr_values,0,weight_lbs}','"NaN"'),
        jsonb_set(payload,'{pr_values,0,lift_name}','"Untracked"'),
        jsonb_set(payload,'{tracked_lifts}','["Bench Press"," bench press "]'),
        jsonb_set(payload,'{tracked_lifts}','[false]'),
        jsonb_set(payload,'{workout_templates}','{}'),
        jsonb_set(payload,'{workout_templates,0,items}','[null]'),
        jsonb_set(payload,'{profile,height_value}','"180"'),
        jsonb_set(payload,'{profile,focus}','"unsupported"'),
        jsonb_set(payload,'{profile,dob}',to_jsonb((current_date + 1)::text)),
        jsonb_set(payload,'{profile,dob}','"2000-02-30"'),
        jsonb_set(payload,'{profile,dob}','"01/02/2000"'),
        jsonb_set(payload,'{profile,dob}',to_jsonb(((current_date - interval '13 years')::date + 1)::text)),
        jsonb_set(payload,'{profile,dob}',to_jsonb((current_date - interval '121 years')::date::text)),
        jsonb_set(payload,'{profile,height_unit}','null'),
        payload #- '{profile,height_unit}',
        jsonb_set(payload,'{profile,height_unit}','"kg"'),
        jsonb_set(payload,'{profile,weight_unit}','null'),
        payload #- '{profile,weight_unit}',
        jsonb_set(payload,'{profile,weight_unit}','"cm"'),
        jsonb_set(payload,'{profile,unknown}','null'),
        jsonb_set(payload,'{profile,height_value}','301'),
        jsonb_set(payload,'{profile,current_weight}','451'),
        payload || '{"user_id":"spoof"}'::jsonb,
        jsonb_set(payload,'{profile,user_id}',to_jsonb(u::text)),
        jsonb_set(payload,'{profile,focus_other}','"   "'),
        jsonb_set(payload,'{pr_values}','null')
    )) LOOP
        case_no := case_no + 1;
        expected := expected_errors[case_no];
        BEGIN
            PERFORM set_config('request.jwt.claim.sub',failing::text,true);
            PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failing,'role','authenticated')::text,true);
            SET LOCAL ROLE authenticated;
            PERFORM public.complete_onboarding_atomic(gen_random_uuid(),bad);
            RESET ROLE;
            RAISE EXCEPTION 'FAIL: invalid payload accepted: %', bad;
        EXCEPTION WHEN invalid_parameter_value THEN
            RESET ROLE;
            PERFORM pg_temp.check_ok(SQLERRM=expected, 'exact validation diagnostic: ' || SQLERRM);
        END;
        PERFORM pg_temp.check_ok(pg_temp.snapshot(failing)=before_state,'validation failure atomicity');
    END LOOP;
    -- Explicit null stays invalid for every PR/template/item scalar and items.
    FOREACH field_path SLICE 1 IN ARRAY ARRAY[
        ARRAY['pr_values','0','lift_name'], ARRAY['pr_values','0','weight_lbs'],
        ARRAY['pr_values','0','reps'], ARRAY['workout_templates','0','name'],
        ARRAY['workout_templates','0','description'], ARRAY['workout_templates','0','items']
    ] LOOP
        expected := CASE field_path[array_length(field_path,1)]
            WHEN 'items' THEN 'items must be an array'
            WHEN 'lift_name' THEN 'nonblank string required: lift_name'
            WHEN 'name' THEN 'nonblank string required: name'
            WHEN 'description' THEN 'nonblank string required: description'
            WHEN 'notes' THEN 'nonblank string required: notes'
            ELSE 'number required: ' || field_path[array_length(field_path,1)] END;
        BEGIN
            PERFORM set_config('request.jwt.claim.sub',failing::text,true);
            PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failing,'role','authenticated')::text,true);
            SET LOCAL ROLE authenticated;
            PERFORM public.complete_onboarding_atomic(gen_random_uuid(),jsonb_set(payload,field_path,'null'));
            RESET ROLE;
            RAISE EXCEPTION 'FAIL: explicit null accepted: %', field_path;
        EXCEPTION WHEN invalid_parameter_value THEN
            RESET ROLE;
            PERFORM pg_temp.check_ok(SQLERRM=expected, 'exact null diagnostic: ' || SQLERRM);
        END;
        PERFORM pg_temp.check_ok(pg_temp.snapshot(failing)=before_state,'null rejection unchanged');
    END LOOP;
    FOREACH field_path SLICE 1 IN ARRAY ARRAY[
        ARRAY['workout_templates','0','items','0','lift_name'],
        ARRAY['workout_templates','0','items','0','target_sets'],
        ARRAY['workout_templates','0','items','0','target_reps'],
        ARRAY['workout_templates','0','items','0','target_weight'],
        ARRAY['workout_templates','0','items','0','notes']
    ] LOOP
        expected := CASE field_path[array_length(field_path,1)]
            WHEN 'items' THEN 'items must be an array'
            WHEN 'lift_name' THEN 'nonblank string required: lift_name'
            WHEN 'name' THEN 'nonblank string required: name'
            WHEN 'description' THEN 'nonblank string required: description'
            WHEN 'notes' THEN 'nonblank string required: notes'
            ELSE 'number required: ' || field_path[array_length(field_path,1)] END;
        BEGIN
            PERFORM set_config('request.jwt.claim.sub',failing::text,true);
            PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failing,'role','authenticated')::text,true);
            SET LOCAL ROLE authenticated;
            PERFORM public.complete_onboarding_atomic(gen_random_uuid(),jsonb_set(payload,field_path,'null'));
            RESET ROLE;
            RAISE EXCEPTION 'FAIL: explicit item null accepted: %', field_path;
        EXCEPTION WHEN invalid_parameter_value THEN
            RESET ROLE;
            PERFORM pg_temp.check_ok(SQLERRM=expected, 'exact null diagnostic: ' || SQLERRM);
        END;
        PERFORM pg_temp.check_ok(pg_temp.snapshot(failing)=before_state,'item null rejection unchanged');
    END LOOP;
    CREATE TRIGGER onboarding_test_receipt_failure
        BEFORE INSERT ON public.onboarding_receipts
        FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_onboarding_receipt();
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',failing::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failing,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(gen_random_uuid(),payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: receipt failure accepted';
    EXCEPTION WHEN raise_exception THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='test receipt insert failure','late write failure diagnostic');
    END;
    DROP TRIGGER onboarding_test_receipt_failure ON public.onboarding_receipts;
    PERFORM pg_temp.check_ok(pg_temp.snapshot(failing)=before_state,'late write failure atomicity');
    -- Rejected attempts did not consume completion or create receipts; empty arrays work.
    PERFORM set_config('request.jwt.claim.sub',failing::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failing,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(NULL,empty_payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok(v_result->>'onboarding_completed'='true','empty arrays accepted');
    -- Completion is one-time: use a separate populated fixture for clearing.
    fixture := gen_random_uuid();
    INSERT INTO auth.users(id,aud,role,email)
    VALUES (fixture,'authenticated','authenticated',fixture::text || '@onboarding.invalid');
    INSERT INTO public.profiles(user_id) VALUES (fixture) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.profiles SET height_value=180, height_unit='cm',
        dob=(current_date - interval '30 years')::date, current_weight=80, goal_weight=85,
        weight_unit='kg', focus='other', focus_other='General fitness' WHERE user_id=fixture;
    PERFORM pg_temp.check_ok((SELECT height_value IS NOT NULL AND height_unit IS NOT NULL
        AND dob IS NOT NULL AND current_weight IS NOT NULL AND goal_weight IS NOT NULL
        AND weight_unit IS NOT NULL AND focus IS NOT NULL AND focus_other IS NOT NULL
        FROM public.profiles WHERE user_id=fixture),'clear fixture populated');

    PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(gen_random_uuid(),jsonb_set(empty_payload,'{profile}',
        '{"height_value":null,"height_unit":null,"dob":null,"current_weight":null,
          "goal_weight":null,"weight_unit":null,"focus":null,"focus_other":null}'));
    RESET ROLE;
    PERFORM pg_temp.check_ok((SELECT onboarding_completed AND height_value IS NULL AND height_unit IS NULL
        AND dob IS NULL AND current_weight IS NULL AND goal_weight IS NULL
        AND weight_unit IS NULL AND focus IS NULL AND focus_other IS NULL
        FROM public.profiles WHERE user_id=fixture),'all eight profile fields cleared');
    -- A replay must ignore profile changes since the original application.
    fixture := gen_random_uuid();
    INSERT INTO auth.users(id,aud,role,email)
    VALUES (fixture,'authenticated','authenticated',fixture::text || '@onboarding.invalid');
    INSERT INTO public.profiles(user_id) VALUES (fixture) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.profiles SET height_value=NULL, height_unit='cm',
        current_weight=NULL, goal_weight=NULL, weight_unit=NULL WHERE user_id=fixture;
    state_replay_payload := jsonb_set(payload,'{profile}','{"height_value":180}');
    PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(state_replay_req,state_replay_payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok((SELECT onboarding_completed AND height_value=180 AND height_unit='cm'
        FROM public.profiles WHERE user_id=fixture),'patch used existing height unit');
    -- As postgres, keep the stored profile valid but incompatible with the patch.
    UPDATE public.profiles SET height_value=70, height_unit='in' WHERE user_id=fixture;
    before_state := pg_temp.snapshot(fixture);
    PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    replay := public.complete_onboarding_atomic(state_replay_req,state_replay_payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok(replay=v_result AND (SELECT result=replay
        FROM public.onboarding_receipts WHERE user_id=fixture AND request_id=state_replay_req),
        'changed profile replay returns exact stored receipt');
    PERFORM pg_temp.check_ok(pg_temp.snapshot(fixture)=before_state,
        'changed profile replay does not reapply domain writes');

    -- A durable receipt survives deletion of only the profile, within this rollback.
    fixture := gen_random_uuid();
    INSERT INTO auth.users(id,aud,role,email)
    VALUES (fixture,'authenticated','authenticated',fixture::text || '@onboarding.invalid');
    INSERT INTO public.profiles(user_id) VALUES (fixture) ON CONFLICT (user_id) DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_result := public.complete_onboarding_atomic(deleted_profile_req,payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok(v_result->>'onboarding_completed'='true','deleted profile fixture completed');
    SELECT to_jsonb(t) INTO saved_receipt FROM public.onboarding_receipts t
    WHERE user_id=fixture AND request_id=deleted_profile_req;
    PERFORM pg_temp.check_ok(saved_receipt->'result'=v_result,'save exact durable receipt');
    before_state := pg_temp.snapshot(fixture);
    SELECT jsonb_object_agg(key, jsonb_array_length(value)) INTO saved_counts
    FROM jsonb_each(before_state - 'profile');
    -- RESET ROLE above restores postgres; delete no auth user or domain rows directly.
    PERFORM pg_temp.check_ok(current_user='postgres','profile deletion runs as postgres');
    DELETE FROM public.profiles WHERE user_id=fixture;
    PERFORM pg_temp.check_ok(NOT EXISTS(SELECT FROM public.profiles WHERE user_id=fixture),
        'fixture profile deleted');
    PERFORM pg_temp.check_ok(EXISTS(SELECT FROM auth.users WHERE id=fixture),
        'fixture auth user survives');
    PERFORM pg_temp.check_ok((SELECT to_jsonb(t)=saved_receipt FROM public.onboarding_receipts t
        WHERE user_id=fixture AND request_id=deleted_profile_req),'receipt survives profile deletion');
    PERFORM pg_temp.check_ok(pg_temp.snapshot(fixture) - 'profile'=before_state - 'profile',
        'profile deletion preserves receipt and domain rows');
    before_state := pg_temp.snapshot(fixture);
    PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    replay := public.complete_onboarding_atomic(deleted_profile_req,payload);
    RESET ROLE;
    PERFORM pg_temp.check_ok(replay=v_result AND replay=saved_receipt->'result',
        'deleted profile replay returns exact stored result');
    PERFORM pg_temp.check_ok((SELECT jsonb_object_agg(key, jsonb_array_length(value))=saved_counts
        FROM jsonb_each(pg_temp.snapshot(fixture) - 'profile')),
        'deleted profile replay preserves receipt and domain counts');
    PERFORM pg_temp.check_ok(pg_temp.snapshot(fixture)=before_state,
        'deleted profile replay preserves exact receipt and domain rows');
    BEGIN
        PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(gen_random_uuid(),payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: new request without profile accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='profile missing','new request without profile diagnostic');
    END;
    PERFORM pg_temp.check_ok(pg_temp.snapshot(fixture)=before_state,
        'missing profile rejection preserves receipt and domain rows');

    -- Exact birthdays and the last day at age 120 use fresh fixture users.
    FOREACH birthday IN ARRAY ARRAY[
        (current_date - interval '13 years')::date,
        (current_date - interval '120 years')::date,
        (current_date - interval '121 years')::date + 1
    ] LOOP
        fixture := gen_random_uuid();
        INSERT INTO auth.users(id,aud,role,email)
        VALUES (fixture,'authenticated','authenticated',fixture::text || '@onboarding.invalid');
        INSERT INTO public.profiles(user_id) VALUES (fixture) ON CONFLICT (user_id) DO NOTHING;

        PERFORM set_config('request.jwt.claim.sub',fixture::text,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
        SET LOCAL ROLE authenticated;
        v_result := public.complete_onboarding_atomic(gen_random_uuid(),
            jsonb_set(empty_payload,'{profile}',jsonb_build_object('dob',birthday)));
        RESET ROLE;
        PERFORM pg_temp.check_ok((SELECT onboarding_completed AND dob=birthday
            FROM public.profiles WHERE user_id=fixture),'supported birthday accepted and read back');
    END LOOP;


    BEGIN
        PERFORM set_config('request.jwt.claim.sub','',true);
        PERFORM set_config('request.jwt.claims','{}',true);
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_onboarding_atomic(gen_random_uuid(),empty_payload);
        RESET ROLE;
        RAISE EXCEPTION 'FAIL: missing auth UID accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
        PERFORM pg_temp.check_ok(SQLERRM='authentication required','missing auth diagnostic');
    END;
END;
$$;
ROLLBACK;
