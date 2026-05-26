-- ============================================================
-- Migration 0037: Next-set suggestion RPC
-- For a given user + exercise, look at the most recent prior
-- session of that exercise and suggest the weight/reps for the
-- *next* working set. Conservative progressive-overload heuristics.
-- ============================================================

CREATE OR REPLACE FUNCTION public.suggest_next_set(
    p_user_id  UUID,
    p_exercise TEXT
)
RETURNS TABLE(
    last_workout_date    TEXT,
    last_top_weight_lbs  NUMERIC,
    last_top_reps        NUMERIC,
    last_top_e1rm        NUMERIC,
    suggested_weight_lbs NUMERIC,
    suggested_reps_low   INTEGER,
    suggested_reps_high  INTEGER,
    strategy             TEXT,
    rationale            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exercise     TEXT;
    v_last_date    TEXT;
    v_last_weight  NUMERIC;
    v_last_reps    NUMERIC;
    v_last_e1rm    NUMERIC;
    v_last_set_cnt INTEGER;
    v_min_reps     NUMERIC;
    v_max_w        NUMERIC;
    v_min_w        NUMERIC;
    v_drop_off     NUMERIC;
    v_suggested_w  NUMERIC;
    v_reps_low     INTEGER;
    v_reps_high    INTEGER;
    v_strategy     TEXT;
    v_rationale    TEXT;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    IF p_exercise IS NULL OR TRIM(p_exercise) = '' THEN
        RAISE EXCEPTION 'exercise required';
    END IF;

    v_exercise := LOWER(TRIM(p_exercise));

    -- Latest workout_date that contains this exercise for THIS user
    SELECT MAX(wl.workout_date) INTO v_last_date
    FROM public.workout_log wl
    WHERE wl.user_id = p_user_id
      AND LOWER(TRIM(wl.exercise)) = v_exercise
      AND COALESCE(NULLIF(wl.weight_lbs, ''), '') <> ''
      AND COALESCE(NULLIF(wl.reps, ''), '') <> '';

    IF v_last_date IS NULL THEN
        RETURN QUERY SELECT
            NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
            NULL::NUMERIC, 8, 12,
            'no_history'::TEXT,
            'No prior data for this exercise. Start with a weight you can do 8–12 reps with 2 reps in the tank.'::TEXT;
        RETURN;
    END IF;

    -- Top set, min reps, drop-off for THIS user on that date
    WITH sets AS (
        SELECT
            NULLIF(wl.weight_lbs, '')::NUMERIC AS w,
            NULLIF(wl.reps, '')::NUMERIC      AS r
        FROM public.workout_log wl
        WHERE wl.user_id = p_user_id
          AND LOWER(TRIM(wl.exercise)) = v_exercise
          AND wl.workout_date = v_last_date
    )
    SELECT
        MAX(w),
        MIN(w),
        COUNT(*)::INTEGER,
        MIN(r)
    INTO v_max_w, v_min_w, v_last_set_cnt, v_min_reps
    FROM sets
    WHERE w IS NOT NULL AND r IS NOT NULL;

    -- Reps achieved on the heaviest set
    SELECT r INTO v_last_reps
    FROM (
        SELECT
            NULLIF(wl.weight_lbs, '')::NUMERIC AS w,
            NULLIF(wl.reps, '')::NUMERIC      AS r
        FROM public.workout_log wl
        WHERE wl.user_id = p_user_id
          AND LOWER(TRIM(wl.exercise)) = v_exercise
          AND wl.workout_date = v_last_date
    ) s
    WHERE s.w = v_max_w AND s.r IS NOT NULL
    ORDER BY s.r DESC
    LIMIT 1;

    v_last_weight := v_max_w;
    v_last_e1rm   := public.epley_1rm(v_last_weight, v_last_reps::INTEGER);
    v_drop_off    := COALESCE(v_max_w - v_min_w, 0);

    IF v_last_weight IS NULL OR v_last_reps IS NULL THEN
        RETURN QUERY SELECT
            v_last_date, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
            NULL::NUMERIC, 8, 12,
            'no_history'::TEXT,
            'Last session had no numeric weight/reps. Start with a weight you can do 8–12 reps with 2 reps in the tank.'::TEXT;
        RETURN;
    END IF;

    -- Default: hold weight, hold rep range
    v_suggested_w := v_last_weight;
    v_reps_low    := GREATEST(LEAST(v_last_reps::INTEGER, 12), 4);
    v_reps_high   := v_reps_low + 2;
    v_strategy    := 'hold';
    v_rationale   := format('Last time: %s sets at %s lbs, top set %s reps. Match it before adding load.',
                             v_last_set_cnt, v_last_weight::INTEGER, v_last_reps::INTEGER);

    -- Progressive overload heuristics
    IF v_last_reps >= 8 AND v_drop_off < 20 AND COALESCE(v_min_reps, v_last_reps) >= 5 THEN
        IF v_last_reps >= 12 THEN
            -- Top of range hit → +5/+10
            v_suggested_w := v_last_weight + CASE WHEN v_last_weight >= 135 THEN 10 ELSE 5 END;
            v_strategy    := 'increase_weight';
            v_rationale   := format('Hit %s reps at %s lbs. Add weight; aim for the bottom of the rep range.',
                                     v_last_reps::INTEGER, v_last_weight::INTEGER);
            v_reps_low    := GREATEST(v_last_reps::INTEGER - 4, 4);
            v_reps_high   := v_last_reps::INTEGER - 1;
        ELSIF v_last_reps >= 10 THEN
            v_suggested_w := v_last_weight + CASE WHEN v_last_weight >= 135 THEN 5 ELSE 2.5 END;
            v_strategy    := 'micro_load';
            v_rationale   := format('Solid %s reps at %s lbs. Micro-load and hold the rep target.',
                                     v_last_reps::INTEGER, v_last_weight::INTEGER);
        END IF;
    ELSIF v_min_reps IS NOT NULL AND v_min_reps < 4 THEN
        v_suggested_w := GREATEST(v_last_weight - CASE WHEN v_last_weight >= 100 THEN 10 ELSE 5 END, 0);
        v_strategy    := 'deload_set';
        v_rationale   := format('Last session reps fell to %s. Drop load and rebuild quality reps.',
                                 v_min_reps::INTEGER);
    END IF;

    RETURN QUERY SELECT
        v_last_date,
        v_last_weight,
        v_last_reps,
        v_last_e1rm,
        v_suggested_w,
        v_reps_low,
        v_reps_high,
        v_strategy,
        v_rationale;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.suggest_next_set(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_next_set(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.suggest_next_set(UUID, TEXT) IS
    'Suggests the next working weight + rep range based on the most recent prior session for this user.';
