-- Atomic service-only boundary. Edge supplies verified auth owner after Pro check.
-- Existing unique(user_id, week_start_date) spans statuses: reuse that parent.
-- No existing data rewritten; no table privileges widened. Deploy with handler.
BEGIN;
CREATE FUNCTION public.replace_meal_plan(
 p_user_id uuid, p_week_start_date date, p_targets_snapshot jsonb,
 p_meals jsonb, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
 plan_row public.meal_plans; day jsonb; meal jsonb; item jsonb; k text;
 n numeric; total numeric; item_total numeric; expected numeric;
 d integer; idx integer := 0; date_text text; slot text; seen text[] := '{}';
BEGIN
 IF p_user_id IS NULL OR p_week_start_date IS NULL OR extract(dow FROM p_week_start_date)<>0
 OR p_notes IS NOT NULL AND length(p_notes)>500
 OR pg_column_size(p_targets_snapshot)>65536 OR pg_column_size(p_meals)>262144
 OR jsonb_typeof(p_targets_snapshot) IS DISTINCT FROM 'object'
 OR p_targets_snapshot->'version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(p_targets_snapshot->'days') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_targets_snapshot->'days')<>7
 OR jsonb_typeof(p_meals) IS DISTINCT FROM 'array' OR jsonb_array_length(p_meals)<>28 THEN
  RAISE EXCEPTION 'invalid meal payload' USING ERRCODE='22023';
 END IF;
 FOR d IN 0..6 LOOP
  day := p_targets_snapshot->'days'->d;
  date_text := (p_week_start_date+d)::text;
  IF jsonb_typeof(day) IS DISTINCT FROM 'object' OR day->>'date' IS DISTINCT FROM date_text
   OR jsonb_typeof(day->'is_training_day') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(day->'target') IS DISTINCT FROM 'object'
   OR (day - ARRAY['date','is_training_day','target']) <> '{}'::jsonb
   OR ((day->'target') - ARRAY['calories','protein_g','carbs_g','fat_g']) <> '{}'::jsonb THEN
   RAISE EXCEPTION 'invalid target date' USING ERRCODE='22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['calories','protein_g','carbs_g','fat_g'] LOOP
   IF jsonb_typeof(day->'target'->k) IS DISTINCT FROM 'number' OR (day->'target'->>k)::numeric<=0 THEN
    RAISE EXCEPTION 'invalid target macro' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
 FOR meal IN SELECT value FROM jsonb_array_elements(p_meals) LOOP
  IF jsonb_typeof(meal) IS DISTINCT FROM 'object'
   OR (meal - ARRAY['date','day_of_week','is_training_day','meal_slot','title','description','calories','protein_g','carbs_g','fat_g','fiber_g','items'])<>'{}'::jsonb
   OR jsonb_typeof(meal->'day_of_week') IS DISTINCT FROM 'number'
   OR meal->>'day_of_week' NOT IN ('0','1','2','3','4','5','6') THEN
   RAISE EXCEPTION 'invalid meal day' USING ERRCODE='22023';
  END IF;
  d := (meal->>'day_of_week')::integer;
  day := p_targets_snapshot->'days'->d;
  slot := meal->>'meal_slot';
  IF meal->>'date' IS DISTINCT FROM day->>'date'
   OR meal->'is_training_day' IS DISTINCT FROM day->'is_training_day'
   OR slot IS NULL OR slot NOT IN ('breakfast','lunch','dinner','snack')
   OR (d::text||'/'||slot)=ANY(seen)
   OR jsonb_typeof(meal->'title') IS DISTINCT FROM 'string' OR length(btrim(meal->>'title'))=0 OR length(meal->>'title')>120
   OR jsonb_typeof(meal->'description') IS DISTINCT FROM 'string' OR length(meal->>'description')>500
   OR jsonb_typeof(meal->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(meal->'items') NOT BETWEEN 1 AND 12 THEN
   RAISE EXCEPTION 'invalid meal identity or foods' USING ERRCODE='22023';
  END IF;
  seen := array_append(seen,d::text||'/'||slot);
  FOREACH k IN ARRAY ARRAY['calories','protein_g','carbs_g','fat_g','fiber_g'] LOOP
   IF jsonb_typeof(meal->k) IS DISTINCT FROM 'number' OR (meal->>k)::numeric<0
    OR k='calories' AND (meal->>k)::numeric=0 THEN
    RAISE EXCEPTION 'invalid meal macro' USING ERRCODE='22023';
   END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(meal->'items') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object'
    OR (item - ARRAY['name','grams','servings','calories','protein_g','carbs_g','fat_g'])<>'{}'::jsonb
    OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR length(btrim(item->>'name'))=0 OR length(item->>'name')>80
    OR lower(item->>'name') LIKE '%placeholder%'
    OR lower(btrim(item->>'name')) IN ('food','meal','tbd','n/a','...','unknown')
    OR NOT (item ? 'grams' OR item ? 'servings') THEN
    RAISE EXCEPTION 'invalid food' USING ERRCODE='22023';
   END IF;
   FOREACH k IN ARRAY ARRAY['grams','servings','calories','protein_g','carbs_g','fat_g'] LOOP
    IF k IN ('grams','servings') AND NOT item ? k THEN CONTINUE; END IF;
    IF jsonb_typeof(item->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid food number' USING ERRCODE='22023'; END IF;
    n := (item->>k)::numeric;
    IF n<0 OR k IN ('grams','servings','calories') AND n=0 THEN RAISE EXCEPTION 'invalid food range' USING ERRCODE='22023'; END IF;
   END LOOP;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['calories','protein_g','carbs_g','fat_g'] LOOP
   SELECT sum((value->>k)::numeric) INTO total FROM jsonb_array_elements(meal->'items');
   IF abs(total-(meal->>k)::numeric) > (CASE WHEN k='calories' THEN 2 ELSE 0.2 END) THEN
    RAISE EXCEPTION 'inconsistent meal totals' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
 -- 28 distinct valid day/slot identities guarantee four slots on each date.
 FOR d IN 0..6 LOOP
  FOREACH k IN ARRAY ARRAY['calories','protein_g','carbs_g','fat_g'] LOOP
   expected := (p_targets_snapshot->'days'->d->'target'->>k)::numeric;
   SELECT sum((value->>k)::numeric) INTO total FROM jsonb_array_elements(p_meals) WHERE (value->>'day_of_week')::int=d;
   SELECT sum((i.value->>k)::numeric) INTO item_total FROM jsonb_array_elements(p_meals) m CROSS JOIN LATERAL jsonb_array_elements(m.value->'items') i WHERE (m.value->>'day_of_week')::int=d;
   IF abs(total-expected)>expected*0.05 OR abs(item_total-expected)>expected*0.05 THEN
    RAISE EXCEPTION 'inconsistent day totals' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
 -- Transaction-scoped serialization even for a previously nonexistent week.
 PERFORM pg_advisory_xact_lock(hashtextextended('meal-plan:'||p_user_id::text||':'||p_week_start_date::text,0));
 INSERT INTO public.meal_plans(user_id,week_start_date,status,targets_snapshot,notes)
 VALUES(p_user_id,p_week_start_date,'active',p_targets_snapshot,p_notes)
 ON CONFLICT(user_id,week_start_date) DO UPDATE SET status='active',targets_snapshot=EXCLUDED.targets_snapshot,notes=EXCLUDED.notes
 RETURNING * INTO plan_row;
 DELETE FROM public.planned_meals WHERE plan_id=plan_row.id AND user_id=p_user_id;
 FOR meal IN SELECT value FROM jsonb_array_elements(p_meals) LOOP
  INSERT INTO public.planned_meals(plan_id,user_id,day_of_week,is_training_day,meal_slot,title,description,calories,protein_g,carbs_g,fat_g,fiber_g,items,sort_order)
  VALUES(plan_row.id,p_user_id,(meal->>'day_of_week')::smallint,(meal->>'is_training_day')::boolean,meal->>'meal_slot',meal->>'title',meal->>'description',(meal->>'calories')::numeric,(meal->>'protein_g')::numeric,(meal->>'carbs_g')::numeric,(meal->>'fat_g')::numeric,(meal->>'fiber_g')::numeric,meal->'items',idx);
  idx := idx+1;
 END LOOP;
 RETURN jsonb_build_object('plan',to_jsonb(plan_row),'meals_inserted',idx);
END $$;
REVOKE ALL ON FUNCTION public.replace_meal_plan(uuid,date,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_meal_plan(uuid,date,jsonb,jsonb,text) TO service_role;
COMMENT ON FUNCTION public.replace_meal_plan(uuid,date,jsonb,jsonb,text) IS 'Service-only: Edge must verify auth owner and entitlement. Atomic replacement; no client-supplied owner. Numeric checks are nonmedical consistency policy, not allergen verification.';
COMMIT;
