-- Deploy before the meal-plan GET handler. No data/table privilege changes.
-- Service-only because Edge verifies auth.getUser and pins p_user_id. Do not
-- grant to authenticated: arbitrary owner arguments are trusted only from Edge.
BEGIN;
CREATE FUNCTION public.read_meal_plan(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  -- One statement, including the empty case, holds one MVCC snapshot for both
  -- parent and children. STABLE also preserves the calling statement snapshot.
  WITH latest AS (
    SELECT p.* FROM public.meal_plans p
    WHERE p.user_id = p_user_id AND p.status = 'active'
    ORDER BY p.week_start_date DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'plan', (SELECT to_jsonb(p) FROM latest p),
    'meals', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.day_of_week, m.sort_order, m.id)
      FROM public.planned_meals m JOIN latest p ON m.plan_id = p.id
      WHERE m.user_id = p_user_id
    ), '[]'::jsonb)
  )
  FROM (SELECT 1) singleton
$$;
REVOKE ALL ON FUNCTION public.read_meal_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_meal_plan(uuid) TO service_role;
COMMENT ON FUNCTION public.read_meal_plan(uuid) IS 'Service-only coherent current plan read; Edge must pin owner from verified auth. One statement snapshot, ordered owner-filtered children.';
COMMIT;
