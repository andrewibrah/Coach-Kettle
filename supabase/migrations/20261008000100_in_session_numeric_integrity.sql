-- PROPOSAL ONLY: not approved/applied. Raw strings unchanged.
-- Unique timestamp after latest existing 20260924000900; coordinated Edge rollout required.
ALTER TABLE public.workout_log ADD COLUMN IF NOT EXISTS performance text;
ALTER TABLE public.workout_log ADD COLUMN IF NOT EXISTS set_kind text;
CREATE OR REPLACE FUNCTION public.i3_load(token text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n numeric; f double precision;
BEGIN
 IF token IS NULL OR btrim(token) !~ '^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$' THEN RETURN NULL; END IF;
 n := btrim(token)::numeric;
 -- SQL raises on underflow where JavaScript Number retains a known zero.
 BEGIN f := n::double precision;
 EXCEPTION WHEN numeric_value_out_of_range THEN
   IF n >= 0 AND n < 1 THEN RETURN 0; END IF;
   RETURN NULL;
 END;
 IF f = 'Infinity'::double precision OR f = 'NaN'::double precision OR n < 0 THEN RETURN NULL; END IF;
 RETURN n;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.i3_reps(token text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n numeric;
BEGIN
 IF token IS NULL OR btrim(token) !~ '^[0-9]+$' THEN RETURN NULL; END IF;
 n := btrim(token)::numeric;
 IF n > 9007199254740991 THEN RETURN NULL; END IF;
 RETURN n;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END $$;
-- Larger valid safe counts stay raw, but cannot be materialized into legacy
-- int32 PR columns/functions. Representability, not a training range.
CREATE OR REPLACE FUNCTION public.i3_pr_reps(token text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n numeric := public.i3_reps(token);
BEGIN
 IF n > 2147483647 THEN RETURN NULL; END IF;
 RETURN n::integer;
END $$;
-- Match the existing Edge IEEE-754 evaluation and Math.round, including
-- intermediate scaling overflow. This is representability, not a clinical cap.
CREATE OR REPLACE FUNCTION public.i3_epley(weight numeric, reps integer) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE scaled double precision; rounded double precision;
BEGIN
 IF weight IS NULL OR weight < 0 OR reps IS NULL OR reps <= 0 THEN RETURN NULL; END IF;
 scaled := (weight::double precision * (1::double precision + reps::double precision / 30::double precision)) * 10::double precision;
 IF scaled = 'Infinity'::double precision OR scaled = 'NaN'::double precision THEN RETURN NULL; END IF;
 rounded := floor(scaled);
 IF scaled - rounded >= 0.5 THEN rounded := rounded + 1; END IF;
 RETURN (rounded / 10::double precision)::text::numeric;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.i3_strength_eligible(evidence public.workout_log) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT coalesce(nullif(btrim(evidence.exercise), '') IS NOT NULL AND NOT coalesce(evidence.is_cardio, false)
 AND evidence.set_number IS NOT NULL AND evidence.set_number > 0
 AND (evidence.performance IS NULL OR evidence.performance = 'performed')
 AND (evidence.set_kind IS NULL OR evidence.set_kind IN ('work', 'backoff', 'drop', 'superset'))
 AND public.i3_load(evidence.weight_lbs) > 0 AND public.i3_pr_reps(evidence.reps) > 0
 AND public.i3_epley(public.i3_load(evidence.weight_lbs), public.i3_pr_reps(evidence.reps)) IS NOT NULL, false)
$$;
-- Read-only quarantine proposal, no destructive backfill. Export grouped counts
-- before approving conversion; zero-load performance is retained but not external-load PR.
CREATE OR REPLACE VIEW public.i3_workout_numeric_quarantine WITH (security_invoker = true) AS
 SELECT id, user_id, workout_id, weight_lbs, reps,
 CASE WHEN public.i3_load(weight_lbs) IS NULL THEN 'unknown_or_invalid_load'
 WHEN public.i3_reps(reps) IS NULL THEN 'unknown_or_invalid_reps'
 WHEN public.i3_pr_reps(reps) IS NULL THEN 'legacy_pr_storage_unrepresentable'
 ELSE 'not_strength_evidence' END AS reason
 FROM public.workout_log WHERE NOT public.i3_strength_eligible(workout_log);
-- Existing table RLS and reconcile execute grants are preserved.
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
    IF NOT public.i3_strength_eligible(NEW) THEN RETURN NEW; END IF;
    v_user_id := NEW.user_id;
    v_exercise := LOWER(TRIM(NEW.exercise));

    BEGIN
        v_weight := public.i3_load(NEW.weight_lbs);
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;

    BEGIN
        v_reps := public.i3_pr_reps(NEW.reps);
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

    v_new_e1rm := public.i3_epley(v_weight, v_reps);

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
                AND public.i3_strength_eligible(wl)
                
                AND public.i3_load(wl.weight_lbs) = ph.weight_lbs
                AND public.i3_pr_reps(wl.reps) = ph.reps
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
                    AND public.i3_strength_eligible(wl)
                    
                    AND public.i3_load(wl.weight_lbs) = pl.weight_lbs
                    AND public.i3_pr_reps(wl.reps) = pl.reps
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
                       public.i3_load(wl.weight_lbs) AS weight_lbs,
                       public.i3_pr_reps(wl.reps) AS reps,
                       public.i3_epley(public.i3_load(wl.weight_lbs), public.i3_pr_reps(wl.reps)) AS estimated_1rm
                INTO v_best
                FROM public.workout_log wl
                WHERE wl.user_id = p_user_id
                  AND LOWER(TRIM(wl.exercise)) = r.norm
                  AND public.i3_strength_eligible(wl)
                  
                ORDER BY public.i3_epley(public.i3_load(wl.weight_lbs), public.i3_pr_reps(wl.reps)) DESC
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

-- Disable unapproved adaptive thresholds, including bodyweight0 -> external5.
-- Retain RPC shape and auth barrier; H1/D07 must approve a replacement separately.
CREATE OR REPLACE FUNCTION public.suggest_next_set(p_user_id uuid, p_exercise text)
RETURNS TABLE(last_workout_date text, last_top_weight_lbs numeric, last_top_reps numeric,
 last_top_e1rm numeric, suggested_weight_lbs numeric, suggested_reps_low integer,
 suggested_reps_high integer, strategy text, rationale text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_exercise IS NULL OR btrim(p_exercise) = '' THEN RAISE EXCEPTION 'exercise required'; END IF;
 RETURN QUERY SELECT NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
 NULL::numeric, NULL::integer, NULL::integer, 'unavailable'::text,
 'Adaptive recommendations are unavailable pending approved policy.'::text;
END $$;
