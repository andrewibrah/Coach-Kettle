-- ============================================================
-- Migration: PR integrity + configurable training days
--
-- 1. profiles.training_days — user's actual training weekdays (0=Sun..6=Sat).
--    NULL = fall back to the legacy TRAINING_DAY_MAP heuristic.
-- 2. Deduplicate pr_lifts rows that differ only by lift_name casing
--    (keep the best e1RM per user + normalized name).
-- 3. Case-insensitive unique index on pr_lifts so casing splits can't recur.
-- 4. update_pr_from_workout_log(): use the tracked lift's CANONICAL name
--    when recording PRs, and a case-insensitive conflict target.
-- 5. reconcile_workout_prs(): retract PR entries created by sets that were
--    corrected/deleted before the workout was saved (typo protection).
-- ============================================================

-- ── 1. Configurable training days ──────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS training_days SMALLINT[] NULL;

COMMENT ON COLUMN public.profiles.training_days IS
    'User-selected training weekdays (0=Sunday..6=Saturday). NULL = derive from training_days_per_week heuristic.';

-- ── 2. Deduplicate case-variant pr_lifts rows (keep best e1RM) ─────────────
DELETE FROM public.pr_lifts a
USING public.pr_lifts b
WHERE a.user_id = b.user_id
  AND a.ctid <> b.ctid
  AND LOWER(TRIM(a.lift_name)) = LOWER(TRIM(b.lift_name))
  AND (a.estimated_1rm < b.estimated_1rm
       OR (a.estimated_1rm = b.estimated_1rm AND a.ctid < b.ctid));

-- ── 3. Case-insensitive uniqueness ─────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS pr_lifts_user_lift_ci
    ON public.pr_lifts (user_id, (LOWER(TRIM(lift_name))));

-- ── 4. Canonical-name PR trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_pr_from_workout_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_exercise TEXT;
    v_canonical TEXT;
    v_weight NUMERIC;
    v_reps INTEGER;
    v_new_e1rm NUMERIC;
    v_current_e1rm NUMERIC;
BEGIN
    v_user_id := NEW.user_id;
    v_exercise := LOWER(TRIM(NEW.exercise));

    BEGIN
        v_weight := NEW.weight_lbs::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    BEGIN
        v_reps := NEW.reps::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    IF v_weight IS NULL OR v_weight <= 0 OR v_reps IS NULL OR v_reps <= 0 THEN
        RETURN NEW;
    END IF;

    -- Canonical tracked name (also acts as the is-tracked check).
    SELECT lift_name INTO v_canonical
    FROM public.pr_tracked_lifts
    WHERE user_id = v_user_id
      AND LOWER(TRIM(lift_name)) = v_exercise
      AND is_active = TRUE
    LIMIT 1;

    IF v_canonical IS NULL THEN
        RETURN NEW;
    END IF;

    v_new_e1rm := public.epley_1rm(v_weight, v_reps);

    SELECT estimated_1rm INTO v_current_e1rm
    FROM public.pr_lifts
    WHERE user_id = v_user_id AND LOWER(TRIM(lift_name)) = v_exercise
    ORDER BY estimated_1rm DESC
    LIMIT 1;

    IF v_current_e1rm IS NULL OR v_new_e1rm > v_current_e1rm THEN
        INSERT INTO public.pr_lifts (user_id, lift_name, weight_lbs, reps, estimated_1rm, achieved_at, updated_at)
        VALUES (v_user_id, v_canonical, v_weight, v_reps, v_new_e1rm, NOW(), NOW())
        ON CONFLICT (user_id, (LOWER(TRIM(lift_name))))
        DO UPDATE SET
            lift_name = EXCLUDED.lift_name,
            weight_lbs = EXCLUDED.weight_lbs,
            reps = EXCLUDED.reps,
            estimated_1rm = EXCLUDED.estimated_1rm,
            achieved_at = EXCLUDED.achieved_at,
            updated_at = NOW();

        INSERT INTO public.pr_history (
            user_id, lift_name, weight_lbs, reps, estimated_1rm,
            previous_1rm, improvement_pct, achieved_at
        )
        VALUES (
            v_user_id, v_canonical, v_weight, v_reps, v_new_e1rm,
            v_current_e1rm,
            CASE WHEN v_current_e1rm > 0 THEN ROUND(((v_new_e1rm - v_current_e1rm) / v_current_e1rm) * 100, 1) ELSE NULL END,
            NOW()
        );

        PERFORM pg_notify('pr_breakthrough', json_build_object(
            'user_id', v_user_id,
            'lift_name', v_canonical,
            'weight', v_weight,
            'reps', v_reps,
            'new_e1rm', v_new_e1rm,
            'previous_e1rm', v_current_e1rm
        )::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. PR reconciliation (typo retraction) ─────────────────────────────────
-- Called by the history edge function after it replaces the day's live
-- workout_log rows with the final saved rows. For any PR recorded on that
-- date whose exact (weight, reps) set no longer exists in workout_log, the
-- pr_history entry is removed and pr_lifts is rebuilt from remaining history
-- (falling back to the best remaining workout_log set).
--
-- Manual/onboarding PR baselines are safe: they are only rebuilt when the
-- current pr_lifts row itself was achieved on the reconciled date and its
-- backing set vanished.
CREATE OR REPLACE FUNCTION public.reconcile_workout_prs(p_user_id UUID, p_date TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_best RECORD;
BEGIN
    IF p_user_id IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid arguments';
    END IF;

    FOR r IN
        SELECT DISTINCT LOWER(TRIM(lift_name)) AS norm
        FROM public.pr_history
        WHERE user_id = p_user_id
          AND achieved_at::date = p_date::date
    LOOP
        -- Retract history entries whose backing set was corrected away.
        DELETE FROM public.pr_history ph
        WHERE ph.user_id = p_user_id
          AND LOWER(TRIM(ph.lift_name)) = r.norm
          AND ph.achieved_at::date = p_date::date
          AND NOT EXISTS (
              SELECT 1 FROM public.workout_log wl
              WHERE wl.user_id = p_user_id
                AND LOWER(TRIM(wl.exercise)) = r.norm
                AND wl.workout_date = p_date
                AND wl.weight_lbs ~ '^[0-9]+(\.[0-9]+)?$'
                AND wl.reps ~ '^[0-9]+$'
                AND wl.weight_lbs::NUMERIC = ph.weight_lbs
                AND wl.reps::INTEGER = ph.reps
          );

        -- Rebuild pr_lifts only if its current row came from this date and
        -- its backing set no longer exists (protects manual baselines).
        IF EXISTS (
            SELECT 1 FROM public.pr_lifts pl
            WHERE pl.user_id = p_user_id
              AND LOWER(TRIM(pl.lift_name)) = r.norm
              AND pl.achieved_at::date = p_date::date
              AND NOT EXISTS (
                  SELECT 1 FROM public.workout_log wl
                  WHERE wl.user_id = p_user_id
                    AND LOWER(TRIM(wl.exercise)) = r.norm
                    AND wl.workout_date = p_date
                    AND wl.weight_lbs ~ '^[0-9]+(\.[0-9]+)?$'
                    AND wl.reps ~ '^[0-9]+$'
                    AND wl.weight_lbs::NUMERIC = pl.weight_lbs
                    AND wl.reps::INTEGER = pl.reps
              )
        ) THEN
            -- Best remaining PR from history for this lift.
            SELECT ph.lift_name, ph.weight_lbs, ph.reps, ph.estimated_1rm, ph.achieved_at
            INTO v_best
            FROM public.pr_history ph
            WHERE ph.user_id = p_user_id
              AND LOWER(TRIM(ph.lift_name)) = r.norm
            ORDER BY ph.estimated_1rm DESC, ph.achieved_at ASC
            LIMIT 1;

            IF v_best.lift_name IS NOT NULL THEN
                UPDATE public.pr_lifts
                SET weight_lbs = v_best.weight_lbs,
                    reps = v_best.reps,
                    estimated_1rm = v_best.estimated_1rm,
                    achieved_at = v_best.achieved_at,
                    updated_at = NOW()
                WHERE user_id = p_user_id
                  AND LOWER(TRIM(lift_name)) = r.norm;
            ELSE
                -- No history left: fall back to best remaining logged set.
                SELECT wl.exercise AS lift_name,
                       wl.weight_lbs::NUMERIC AS weight_lbs,
                       wl.reps::INTEGER AS reps,
                       public.epley_1rm(wl.weight_lbs::NUMERIC, wl.reps::INTEGER) AS estimated_1rm
                INTO v_best
                FROM public.workout_log wl
                WHERE wl.user_id = p_user_id
                  AND LOWER(TRIM(wl.exercise)) = r.norm
                  AND wl.weight_lbs ~ '^[0-9]+(\.[0-9]+)?$'
                  AND wl.reps ~ '^[0-9]+$'
                ORDER BY public.epley_1rm(wl.weight_lbs::NUMERIC, wl.reps::INTEGER) DESC
                LIMIT 1;

                IF v_best.lift_name IS NOT NULL THEN
                    UPDATE public.pr_lifts
                    SET weight_lbs = v_best.weight_lbs,
                        reps = v_best.reps,
                        estimated_1rm = v_best.estimated_1rm,
                        updated_at = NOW()
                    WHERE user_id = p_user_id
                      AND LOWER(TRIM(lift_name)) = r.norm;
                ELSE
                    DELETE FROM public.pr_lifts
                    WHERE user_id = p_user_id
                      AND LOWER(TRIM(lift_name)) = r.norm;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_workout_prs(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_workout_prs(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.reconcile_workout_prs(UUID, TEXT) IS
    'Retracts PR entries whose backing sets were corrected before final workout save; rebuilds pr_lifts safely.';
