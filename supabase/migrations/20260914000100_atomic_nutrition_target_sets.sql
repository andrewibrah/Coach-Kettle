-- Service-only accepted-target boundary. Deploy together with the Edge RPC caller:
-- the old save_set handler uses direct DML and cannot save after this migration.
-- Repository discovery found no sibling direct writers to these two tables.
-- Existing local_draft rows are intentionally untouched; legacy nutrition_targets
-- and its callers/ACLs are outside this migration's scope.
BEGIN;
-- No fabricated confirmation backfill for legacy rows.
ALTER TABLE public.nutrition_target_sets ADD COLUMN provenance jsonb,
  ADD COLUMN suggestion_id text;
CREATE FUNCTION public.save_nutrition_target_set_atomic(p_user_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  t jsonb;
  prov jsonb;
  obj jsonb;
  item jsonb;
  val jsonb;
  k text;
  source_value text;
  days integer[] := ARRAY[]::integer[];
  dow numeric;
  all_macros jsonb := '[]'::jsonb;
  saved public.nutrition_target_sets%ROWTYPE;
  overrides jsonb;
BEGIN
  -- Ownership comes exclusively from the trusted, auth-verified Edge caller.
  IF p_user_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid save payload' USING ERRCODE = '22023';
  END IF;
  IF p_payload - ARRAY['action','source','suggestion_id','targets','macro_preference','provenance','derivation_inputs','explanation'] <> '{}'::jsonb
     OR (p_payload ? 'action' AND p_payload->'action' <> '"save_set"'::jsonb) THEN
    RAISE EXCEPTION 'unknown save fields or action' USING ERRCODE = '22023';
  END IF;
  source_value := p_payload->>'source';
  IF source_value IS NULL OR source_value NOT IN ('manual','backend_suggested','imported_existing') THEN
    RAISE EXCEPTION 'invalid durable source' USING ERRCODE = '22023';
  END IF;
  prov := p_payload->'provenance';
  IF jsonb_typeof(prov) IS DISTINCT FROM 'object'
     OR prov - ARRAY['user_confirmed','edited_after_suggestion','imported_from_existing'] <> '{}'::jsonb
     OR prov->'user_confirmed' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(prov->'edited_after_suggestion') IS DISTINCT FROM 'boolean'
     OR (prov ? 'imported_from_existing' AND jsonb_typeof(prov->'imported_from_existing') <> 'boolean')
     OR (source_value = 'imported_existing' AND prov->'imported_from_existing' IS DISTINCT FROM 'true'::jsonb)
     OR (source_value = 'backend_suggested' AND prov->'edited_after_suggestion' IS DISTINCT FROM 'false'::jsonb) THEN
    RAISE EXCEPTION 'invalid confirmed provenance' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'suggestion_id' AND (jsonb_typeof(p_payload->'suggestion_id') <> 'string' OR btrim(p_payload->>'suggestion_id') = '') THEN
    RAISE EXCEPTION 'invalid suggestion_id' USING ERRCODE = '22023';
  END IF;
  -- SaveRequest declares a string (not the narrower SuggestRequest enum).
  IF p_payload ? 'macro_preference' AND jsonb_typeof(p_payload->'macro_preference') <> 'string' THEN
    RAISE EXCEPTION 'invalid macro_preference' USING ERRCODE = '22023';
  END IF;
  t := p_payload->'targets';
  IF jsonb_typeof(t) IS DISTINCT FROM 'object'
     OR t - ARRAY['base','training_day','rest_day','day_overrides'] <> '{}'::jsonb
     OR NOT (t ?| ARRAY['base','training_day','rest_day']) THEN
    RAISE EXCEPTION 'at least one parent target is required' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['base','training_day','rest_day'] LOOP
    IF t ? k THEN all_macros := all_macros || jsonb_build_array(t->k); END IF;
  END LOOP;
  IF t ? 'day_overrides' THEN
    IF jsonb_typeof(t->'day_overrides') <> 'array' THEN
      RAISE EXCEPTION 'day_overrides must be an array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(t->'day_overrides') > 7 THEN
      RAISE EXCEPTION 'too many day overrides' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(t->'day_overrides') LOOP
      IF jsonb_typeof(item) <> 'object'
         OR item - ARRAY['day_of_week','target','source','updated_at'] <> '{}'::jsonb
         OR jsonb_typeof(item->'day_of_week') IS DISTINCT FROM 'number'
         OR NOT (item ? 'target')
         OR (item ? 'source' AND (jsonb_typeof(item->'source') <> 'string' OR item->>'source' NOT IN ('manual','backend_suggested','imported_existing')))
         OR (item ? 'updated_at' AND jsonb_typeof(item->'updated_at') <> 'string') THEN
        RAISE EXCEPTION 'invalid day override' USING ERRCODE = '22023';
      END IF;
      dow := (item->>'day_of_week')::numeric;
      IF dow < 0 OR dow > 6 OR dow <> trunc(dow) OR dow::integer = ANY(days) THEN
        RAISE EXCEPTION 'invalid or duplicate weekday' USING ERRCODE = '22023';
      END IF;
      days := array_append(days, dow::integer);
      all_macros := all_macros || jsonb_build_array(item->'target');
    END LOOP;
  END IF;
  FOR obj IN SELECT value FROM jsonb_array_elements(all_macros) LOOP
    IF jsonb_typeof(obj) <> 'object' OR NOT (obj ? 'calories')
       OR obj - ARRAY['calories','protein_g','carbs_g','fat_g'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid macro target' USING ERRCODE = '22023';
    END IF;
    FOR k, val IN SELECT key, value FROM jsonb_each(obj) LOOP
      -- JSONB numbers are finite PostgreSQL numeric values; no float cast,
      -- coercion, rounding, or arbitrary calorie/macro ceilings.
      IF jsonb_typeof(val) <> 'number' THEN
        RAISE EXCEPTION 'macro must be a number' USING ERRCODE = '22023';
      END IF;
      IF (val #>> '{}')::numeric <= 0 THEN
        RAISE EXCEPTION 'macro must be positive' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  IF p_payload ? 'derivation_inputs' THEN
    obj := p_payload->'derivation_inputs';
    IF jsonb_typeof(obj) <> 'object'
       OR obj - ARRAY['age_range','sex','height_cm_present','weight_kg_present','activity_level','goal_type','training_days_per_week','user_entered_calorie_target','macro_preference'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid derivation metadata' USING ERRCODE = '22023';
    END IF;
    FOR k, val IN SELECT key, value FROM jsonb_each(obj) LOOP
      IF jsonb_typeof(val) <> (CASE
          WHEN k IN ('height_cm_present','weight_kg_present') THEN 'boolean'
          WHEN k IN ('training_days_per_week','user_entered_calorie_target') THEN 'number'
          ELSE 'string' END) THEN
        RAISE EXCEPTION 'invalid derivation field type' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF p_payload ? 'explanation' THEN
    obj := p_payload->'explanation';
    IF jsonb_typeof(obj) <> 'object'
       OR obj - ARRAY['summary','assumptions','missing_inputs','calculation_basis','safety_notes'] <> '{}'::jsonb
       OR NOT (obj ?& ARRAY['summary','assumptions','missing_inputs','calculation_basis']) THEN
      RAISE EXCEPTION 'invalid explanation' USING ERRCODE = '22023';
    END IF;
    FOR k, val IN SELECT key, value FROM jsonb_each(obj) LOOP
      IF k IN ('summary','calculation_basis') THEN
        IF jsonb_typeof(val) <> 'string' THEN
          RAISE EXCEPTION 'invalid explanation text' USING ERRCODE = '22023';
        END IF;
      ELSE
        IF jsonb_typeof(val) <> 'array' THEN
          RAISE EXCEPTION 'invalid explanation list' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(val) e WHERE jsonb_typeof(e.value) <> 'string') THEN
          RAISE EXCEPTION 'invalid explanation list member' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Covers absent parents as well as replacements. Held through receipt/commit.
  -- Hash collisions only serialize unrelated users; they cannot mix ownership.
  PERFORM pg_advisory_xact_lock(hashtextextended('nutrition-target-set:' || p_user_id::text, 0));
  INSERT INTO public.nutrition_target_sets AS existing
    (user_id, source, base_target, training_day_target, rest_day_target,
     macro_preference, explanation, derivation_inputs_snapshot, stale_after, provenance, suggestion_id)
  VALUES (p_user_id, source_value, t->'base', t->'training_day', t->'rest_day',
    p_payload->>'macro_preference', p_payload->'explanation', p_payload->'derivation_inputs',
    CASE WHEN source_value = 'backend_suggested' THEN now() + interval '60 days' ELSE NULL END,
    prov, p_payload->>'suggestion_id')
  ON CONFLICT (user_id) DO UPDATE SET
    source = EXCLUDED.source, base_target = EXCLUDED.base_target,
    training_day_target = EXCLUDED.training_day_target, rest_day_target = EXCLUDED.rest_day_target,
    macro_preference = EXCLUDED.macro_preference, explanation = EXCLUDED.explanation,
    derivation_inputs_snapshot = EXCLUDED.derivation_inputs_snapshot,
    stale_after = EXCLUDED.stale_after, provenance = EXCLUDED.provenance,
    suggestion_id = EXCLUDED.suggestion_id, updated_at = now()
  RETURNING existing.* INTO saved;

  IF t ? 'day_overrides' THEN
    DELETE FROM public.nutrition_target_day_overrides WHERE target_set_id = saved.id;
    INSERT INTO public.nutrition_target_day_overrides
      (target_set_id, user_id, day_of_week, target, source)
    SELECT saved.id, p_user_id, (e.value->>'day_of_week')::numeric::integer,
      e.value->'target', coalesce(e.value->>'source', source_value)
    FROM jsonb_array_elements(t->'day_overrides') e;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'day_of_week', d.day_of_week, 'target', d.target, 'source', d.source,
    'updated_at', d.updated_at) ORDER BY d.day_of_week), '[]'::jsonb)
  INTO overrides FROM public.nutrition_target_day_overrides d WHERE d.target_set_id = saved.id;
  RETURN jsonb_build_object('saved_target_set_id', saved.id, 'user_id', saved.user_id,
    'source', saved.source, 'updated_at', saved.updated_at,
    'targets', to_jsonb(saved) || jsonb_build_object('day_overrides', overrides));
END;
$$;
COMMENT ON FUNCTION public.save_nutrition_target_set_atomic(uuid, jsonb) IS
  'Trusted Edge service only: verified user id, validated confirmed targets, atomic parent/optional child replacement and receipt.';
-- service_role direct-write revocation is deferred to plan §I, to be applied only after the
-- new nutrition-targets function (which writes these tables directly via service_role) is live.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nutrition_target_sets,
  public.nutrition_target_day_overrides FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_nutrition_target_set_atomic(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_nutrition_target_set_atomic(uuid, jsonb) TO service_role;
COMMIT;
