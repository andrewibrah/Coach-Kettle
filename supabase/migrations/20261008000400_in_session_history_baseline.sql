-- H1: read-only completed-session history baseline. Additive only; no progression policy (D07).
-- Returns the eligible sets of the SINGLE most recent completed workout (by workouts."createdAt",
-- never MAX(date), never merging same-day sessions) whose normalized exercise is in p_names.
-- Completed = owned workouts row AND no P4 session in state open/deleted (legacy rows count).
-- Eligibility is the I3 contract: warmup/cardio/planned/invalid/zero load excluded; backoff/drop/
-- superset kept with set_kind so a future approved policy decides. SECURITY INVOKER: RLS applies.
CREATE OR REPLACE FUNCTION public.exercise_history_baseline(p_names text[], p_exclude_session text DEFAULT NULL)
RETURNS TABLE (workout_id text, workout_date text, set_number bigint, set_kind text,
    weight_lbs numeric, reps integer, e1rm numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH names AS (
    SELECT lower(btrim(regexp_replace(n, '\s+', ' ', 'g'))) AS name FROM unnest(p_names) n
  ), matched AS MATERIALIZED (
    -- Name filter first: eligibility is the expensive per-row check.
    SELECT l.* FROM public.workout_log l
    WHERE l.user_id = auth.uid()
      AND lower(btrim(regexp_replace(l.exercise, '\s+', ' ', 'g'))) IN (SELECT name FROM names)
      AND l.workout_id IS DISTINCT FROM p_exclude_session
  ), eligible AS (
    SELECT l.id, l.workout_id, w."dateISO" AS workout_date, w."createdAt" AS created_ms,
           l.set_number, l.set_kind, l.weight_lbs, l.reps
    FROM matched l
    JOIN public.workouts w ON w.id = l.workout_id AND w.user_id = auth.uid()
    WHERE public.i3_strength_eligible(l::public.workout_log)
      AND NOT EXISTS (SELECT 1 FROM public.workout_operation_sessions s
                      WHERE s.session_id = l.workout_id AND s.state IN ('open', 'deleted'))
  ), latest AS (
    SELECT e.workout_id FROM eligible e ORDER BY e.created_ms DESC NULLS LAST, e.workout_date DESC, e.workout_id DESC LIMIT 1
  )
  SELECT e.workout_id, e.workout_date, e.set_number, e.set_kind,
         public.i3_load(e.weight_lbs), public.i3_pr_reps(e.reps),
         public.i3_epley(public.i3_load(e.weight_lbs), public.i3_pr_reps(e.reps))
  FROM eligible e JOIN latest ON latest.workout_id = e.workout_id
  ORDER BY e.set_number, e.id
$$;
REVOKE ALL ON FUNCTION public.exercise_history_baseline(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercise_history_baseline(text[], text) TO authenticated;
