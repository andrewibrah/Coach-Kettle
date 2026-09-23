-- Wire contract: all four top-level fields are required; profile is a patch.
-- tracked_lifts: string[]; pr_values: {lift_name,weight_lbs,reps}[];
-- workout_templates: {name,description?,items:[{lift_name,target_sets,
-- target_reps,target_weight?,notes?}]}[]. Optional fields may be omitted, not null.
-- Profile patch fields accept null to clear their stored columns.
-- Array order supplies display_order. Duplicate template names are intentional.
CREATE TABLE public.onboarding_receipts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
    result jsonb NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.onboarding_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.complete_onboarding_atomic(p_request_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    u uuid := auth.uid();
    rid uuid;
    digest bytea;
    saved public.onboarding_receipts%ROWTYPE;
    prof public.profiles%ROWTYPE;
    merged public.profiles%ROWTYPE;
    obj jsonb;
    item jsonb;
    val jsonb;
    k text;
    kind text;
    spec jsonb;
    entry record;
    n numeric;
    estimated numeric;
    birth_date date;
    names text[] := ARRAY[]::text[];
    pr_names text[] := ARRAY[]::text[];
    item_names text[];
    name text;
    tid uuid;
    tids jsonb := '[]';
    ord integer;
    item_ord integer;
    answer jsonb;
BEGIN
    IF u IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('complete_onboarding_atomic:' || u::text, 0));
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'payload must be an object' USING ERRCODE = '22023';
    END IF;
    IF NOT p_payload ?& ARRAY['profile','tracked_lifts','pr_values','workout_templates']
       OR EXISTS (SELECT FROM jsonb_object_keys(p_payload) AS keys(key)
                  WHERE key <> ALL (ARRAY['profile','tracked_lifts','pr_values','workout_templates'])) THEN
        RAISE EXCEPTION 'invalid payload keys' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload->'profile') <> 'object' THEN
        RAISE EXCEPTION 'profile must be an object' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['tracked_lifts','pr_values','workout_templates'] LOOP
        IF jsonb_typeof(p_payload->k) <> 'array' THEN
            RAISE EXCEPTION '% must be an array', k USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- Validate every supplied scalar, including optional fields, before writes.
    -- Specs: text = nonblank string, number = positive numeric, int = positive int32.
    FOR entry IN
        SELECT p_payload->'profile' AS value,
            '{"height_value":"number","height_unit":"text","dob":"text","current_weight":"number","goal_weight":"number","weight_unit":"text","focus":"text","focus_other":"text"}'::jsonb AS rules,
            ARRAY[]::text[] AS required, true AS nullable
        UNION ALL
        SELECT value, '{"lift_name":"text","weight_lbs":"number","reps":"int"}'::jsonb,
            ARRAY['lift_name','weight_lbs','reps'], false FROM jsonb_array_elements(p_payload->'pr_values')
        UNION ALL
        SELECT value, '{"name":"text","description":"text","items":"array"}'::jsonb,
            ARRAY['name','items'], false FROM jsonb_array_elements(p_payload->'workout_templates')
    LOOP
        obj := entry.value;
        spec := entry.rules;
        IF jsonb_typeof(obj) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'expected object' USING ERRCODE = '22023';
        END IF;
        IF NOT obj ?& entry.required THEN
            RAISE EXCEPTION 'missing required fields' USING ERRCODE = '22023';
        END IF;
        -- Include template items in this same scalar validation pass.
        IF spec ? 'items' THEN
            IF jsonb_typeof(obj->'items') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'items must be an array' USING ERRCODE = '22023';
            END IF;
        END IF;
        FOR item, spec IN
            SELECT obj, entry.rules
            UNION ALL
            SELECT value, '{"lift_name":"text","target_sets":"int","target_reps":"int","target_weight":"nonnegative","notes":"text"}'::jsonb
            FROM jsonb_array_elements(CASE WHEN entry.rules ? 'items' THEN obj->'items' ELSE '[]'::jsonb END)
        LOOP
            IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'expected item object' USING ERRCODE = '22023';
            END IF;
            IF spec ? 'target_sets' AND NOT item ?& ARRAY['lift_name','target_sets','target_reps'] THEN
                RAISE EXCEPTION 'missing item fields' USING ERRCODE = '22023';
            END IF;
            FOR k, val IN SELECT * FROM jsonb_each(item) LOOP
                kind := spec->>k;
                IF kind IS NULL THEN
                    RAISE EXCEPTION 'unknown field: %', k USING ERRCODE = '22023';
                ELSIF entry.nullable AND val = 'null'::jsonb THEN
                    CONTINUE;
                ELSIF kind = 'text' THEN
                    IF jsonb_typeof(val) <> 'string' OR (val #>> '{}') !~ '[^[:space:]]' THEN
                        RAISE EXCEPTION 'nonblank string required: %', k USING ERRCODE = '22023';
                    END IF;
                ELSIF kind = 'array' THEN
                    IF jsonb_typeof(val) <> 'array' THEN
                        RAISE EXCEPTION 'array required: %', k USING ERRCODE = '22023';
                    END IF;
                ELSE
                    IF jsonb_typeof(val) <> 'number' THEN
                        RAISE EXCEPTION 'number required: %', k USING ERRCODE = '22023';
                    END IF;
                    n := (val #>> '{}')::numeric;
                    IF n::text IN ('NaN','Infinity','-Infinity') OR n < 0
                       OR (kind <> 'nonnegative' AND n = 0)
                       OR (kind = 'int' AND (n <> trunc(n) OR n > 2147483647)) THEN
                        RAISE EXCEPTION 'invalid numeric value: %', k USING ERRCODE = '22023';
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    obj := p_payload->'profile';
    IF obj ? 'dob' AND obj->'dob' <> 'null'::jsonb THEN
        IF obj->>'dob' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
            RAISE EXCEPTION 'dob must be ISO date' USING ERRCODE = '22023';
        END IF;
        BEGIN
            birth_date := (obj->>'dob')::date;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RAISE EXCEPTION 'dob must be a real ISO date' USING ERRCODE = '22023';
        END;
    END IF;
    IF (obj ? 'height_unit' AND obj->>'height_unit' NOT IN ('cm','in'))
       OR (obj ? 'weight_unit' AND obj->>'weight_unit' NOT IN ('lb','kg'))
       OR (obj ? 'focus' AND obj->>'focus' NOT IN ('strength','lean_muscle','fat_loss','other')) THEN
        RAISE EXCEPTION 'unsupported profile enum' USING ERRCODE = '22023';
    END IF;
    FOR val IN SELECT * FROM jsonb_array_elements(p_payload->'tracked_lifts') LOOP
        IF jsonb_typeof(val) <> 'string' OR (val #>> '{}') !~ '[^[:space:]]' THEN
            RAISE EXCEPTION 'tracked lift must be nonblank string' USING ERRCODE = '22023';
        END IF;
        name := lower(trim(val #>> '{}'));
        IF name = ANY(names) THEN
            RAISE EXCEPTION 'duplicate tracked lift' USING ERRCODE = '22023';
        END IF;
        names := array_append(names, name);
    END LOOP;
    FOR obj IN SELECT * FROM jsonb_array_elements(p_payload->'pr_values') LOOP
        name := lower(trim(obj->>'lift_name'));
        IF NOT name = ANY(names) OR name = ANY(pr_names) THEN
            RAISE EXCEPTION 'untracked or duplicate PR lift' USING ERRCODE = '22023';
        END IF;
        pr_names := array_append(pr_names, name);
        estimated := public.epley_1rm((obj->>'weight_lbs')::numeric, (obj->>'reps')::numeric::integer);
        IF estimated IS NULL OR estimated <= 0 OR estimated::text IN ('NaN','Infinity','-Infinity') THEN
            RAISE EXCEPTION 'invalid Epley estimate' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    FOR obj IN SELECT * FROM jsonb_array_elements(p_payload->'workout_templates') LOOP
        item_names := ARRAY[]::text[];
        FOR item IN SELECT * FROM jsonb_array_elements(obj->'items') LOOP
            name := lower(trim(item->>'lift_name'));
            IF name = ANY(item_names) THEN
                RAISE EXCEPTION 'duplicate template lift' USING ERRCODE = '22023';
            END IF;
            item_names := array_append(item_names, name);
        END LOOP;
    END LOOP;

    -- The entire fixed-depth wire shape and all scalars are validated above.
    -- Built-in SHA-256 avoids depending on pgcrypto's installation schema.
    -- JSONB equality ignores object order and numeric scale (1 = 1.0).
    -- Hash a path-ordered tree with normalized numbers, preserving array order.
    WITH RECURSIVE nodes(path, value) AS (
        SELECT ARRAY[]::text[], p_payload
        UNION ALL
        SELECT nodes.path || child.key, child.value
        FROM nodes CROSS JOIN LATERAL (
            SELECT key, value FROM jsonb_each(CASE WHEN jsonb_typeof(nodes.value) = 'object'
                THEN nodes.value ELSE '{}'::jsonb END)
            UNION ALL
            SELECT ordinality::text, value FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(nodes.value) = 'array' THEN nodes.value ELSE '[]'::jsonb END)
                WITH ORDINALITY
        ) child
    )
    SELECT sha256(convert_to(jsonb_agg(jsonb_build_array(path, jsonb_typeof(value),
        CASE jsonb_typeof(value)
            WHEN 'number' THEN to_jsonb(trim_scale((value #>> '{}')::numeric))
            WHEN 'object' THEN '{}'::jsonb WHEN 'array' THEN '[]'::jsonb
            ELSE value END) ORDER BY path)::text, 'UTF8')) INTO digest FROM nodes;
    rid := coalesce(p_request_id,
        substr(encode(sha256(convert_to(u::text || ':' || encode(digest, 'hex'), 'UTF8')), 'hex'), 1, 32)::uuid);
    SELECT * INTO saved FROM public.onboarding_receipts WHERE user_id = u AND request_id = rid;
    IF FOUND THEN
        IF saved.payload_sha256 IS DISTINCT FROM digest THEN
            RAISE EXCEPTION 'request ID payload conflict' USING ERRCODE = '22023';
        END IF;
        RETURN saved.result;
    END IF;
    -- Durable receipt replays do not require a surviving profile row.
    SELECT * INTO prof FROM public.profiles WHERE user_id = u FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile missing' USING ERRCODE = '22023';
    END IF;
    IF prof.onboarding_completed THEN
        RAISE EXCEPTION 'onboarding already completed; ambiguous new request' USING ERRCODE = '22023';
    END IF;

    -- Receipt replays must not depend on today's age or the current profile.
    IF birth_date IS NOT NULL THEN
        -- Completed calendar years respect birthdays, including leap-day DOBs.
        IF extract(year FROM age(current_date, birth_date)) NOT BETWEEN 13 AND 120 THEN
            RAISE EXCEPTION 'dob age must be 13 through 120' USING ERRCODE = '22023';
        END IF;
    END IF;
    merged := jsonb_populate_record(prof, p_payload->'profile');
    IF merged.height_value IS NOT NULL AND
       (merged.height_unit IS NULL OR NOT CASE merged.height_unit
          WHEN 'cm' THEN merged.height_value BETWEEN 50 AND 300
          WHEN 'in' THEN merged.height_value BETWEEN 20 AND 120 ELSE false END) THEN
        RAISE EXCEPTION 'height outside supported bounds' USING ERRCODE = '22023';
    END IF;
    FOREACH n IN ARRAY ARRAY[merged.current_weight, merged.goal_weight] LOOP
        IF n IS NOT NULL AND (merged.weight_unit IS NULL OR NOT CASE merged.weight_unit
            WHEN 'lb' THEN n BETWEEN 50 AND 1000 WHEN 'kg' THEN n BETWEEN 20 AND 450 ELSE false END) THEN
            RAISE EXCEPTION 'weight outside supported bounds' USING ERRCODE = '22023';
        END IF;
    END LOOP;

    UPDATE public.profiles SET height_value = merged.height_value, height_unit = merged.height_unit,
        dob = merged.dob, current_weight = merged.current_weight, goal_weight = merged.goal_weight,
        weight_unit = merged.weight_unit, focus = merged.focus, focus_other = merged.focus_other
    WHERE user_id = u;
    UPDATE public.pr_tracked_lifts SET is_active = false WHERE user_id = u;
    ord := 0;
    FOR val IN SELECT * FROM jsonb_array_elements(p_payload->'tracked_lifts') LOOP
        name := trim(val #>> '{}');
        UPDATE public.pr_tracked_lifts SET is_active = true, display_order = ord
        WHERE user_id = u AND lower(trim(lift_name)) = lower(name);
        IF NOT FOUND THEN
            INSERT INTO public.pr_tracked_lifts(user_id,lift_name,is_active,display_order)
            VALUES (u,name,true,ord);
        END IF;
        ord := ord + 1;
    END LOOP;
    FOR obj IN SELECT * FROM jsonb_array_elements(p_payload->'pr_values') LOOP
        INSERT INTO public.pr_lifts(user_id,lift_name,weight_lbs,reps,estimated_1rm)
        VALUES (u,trim(obj->>'lift_name'),(obj->>'weight_lbs')::numeric,
            (obj->>'reps')::numeric::integer,
            public.epley_1rm((obj->>'weight_lbs')::numeric,(obj->>'reps')::numeric::integer))
        ON CONFLICT (user_id,(lower(trim(lift_name)))) DO UPDATE
        SET weight_lbs = excluded.weight_lbs, reps = excluded.reps,
            estimated_1rm = excluded.estimated_1rm, achieved_at = now(), updated_at = now();
    END LOOP;
    ord := 0;
    FOR obj IN SELECT * FROM jsonb_array_elements(p_payload->'workout_templates') LOOP
        INSERT INTO public.workout_templates(user_id,name,description,display_order,is_active)
        VALUES (u,trim(obj->>'name'),obj->>'description',ord,true) RETURNING id INTO tid;
        tids := tids || jsonb_build_array(tid);
        item_ord := 0;
        FOR item IN SELECT * FROM jsonb_array_elements(obj->'items') LOOP
            INSERT INTO public.workout_template_items(template_id,user_id,lift_name,target_sets,target_reps,target_weight,display_order,notes)
            VALUES (tid,u,trim(item->>'lift_name'),(item->>'target_sets')::numeric::integer,
                (item->>'target_reps')::numeric::integer,(item->>'target_weight')::numeric,item_ord,item->>'notes');
            item_ord := item_ord + 1;
        END LOOP;
        ord := ord + 1;
    END LOOP;
    PERFORM public.refresh_ai_context(u);
    UPDATE public.profiles SET onboarding_completed = true WHERE user_id = u;
    answer := jsonb_build_object('request_id',rid,'onboarding_completed',true,'template_ids',tids);
    INSERT INTO public.onboarding_receipts(user_id,request_id,payload_sha256,result)
    VALUES (u,rid,digest,answer);
    RETURN answer;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_onboarding_atomic(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_atomic(uuid,jsonb) TO authenticated;
