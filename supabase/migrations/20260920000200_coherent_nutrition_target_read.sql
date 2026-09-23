-- Deploy before the shared loader/get_set callers. No table or data changes.
BEGIN;
CREATE FUNCTION public.read_nutrition_target_set(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  -- Edge service callers pin p_user_id from verified auth.getUser. The existing
  -- daily-feedback user client uses authenticated: ignore its supplied owner
  -- entirely and derive auth.uid(), with existing SELECT/RLS still enforced.
  -- One statement + STABLE preserves one MVCC snapshot for parent AND children
  -- even when the atomic save upserts/reuses the same parent ID.
  WITH owner AS (
    SELECT CASE WHEN current_user = 'service_role' THEN p_user_id ELSE auth.uid() END AS id
  )
  SELECT to_jsonb(s) || jsonb_build_object('day_overrides', COALESCE((
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day_of_week, d.id)
    FROM public.nutrition_target_day_overrides d
    WHERE d.target_set_id = s.id AND d.user_id = s.user_id
  ), '[]'::jsonb))
  FROM public.nutrition_target_sets s JOIN owner o ON s.user_id = o.id
$$;
REVOKE ALL ON FUNCTION public.read_nutrition_target_set(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_nutrition_target_set(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.read_nutrition_target_set(uuid) IS
 'Single statement raw target snapshot; not approval. Service owner must be auth-verified; authenticated owner is auth.uid(), never the argument. Existing SELECT/RLS only.';
COMMIT;
