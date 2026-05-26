-- ============================================================
-- Migration 0036: Progress tracking
-- Body metrics (weight + measurements), body photos, resting HR
-- log. Strength progression comes from existing workout_log table.
-- ============================================================

-- 1. BODY METRICS (weight + measurements over time)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.body_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    measured_date   DATE NOT NULL,
    measured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    weight_lbs      NUMERIC(6,2) CHECK (weight_lbs IS NULL OR weight_lbs BETWEEN 50 AND 800),
    body_fat_pct    NUMERIC(4,2) CHECK (body_fat_pct IS NULL OR body_fat_pct BETWEEN 2 AND 60),
    waist_in        NUMERIC(5,2) CHECK (waist_in IS NULL OR waist_in BETWEEN 15 AND 80),
    chest_in        NUMERIC(5,2) CHECK (chest_in IS NULL OR chest_in BETWEEN 20 AND 80),
    hips_in         NUMERIC(5,2) CHECK (hips_in IS NULL OR hips_in BETWEEN 20 AND 80),
    arm_in          NUMERIC(5,2) CHECK (arm_in IS NULL OR arm_in BETWEEN 5 AND 30),
    thigh_in        NUMERIC(5,2) CHECK (thigh_in IS NULL OR thigh_in BETWEEN 10 AND 50),
    neck_in         NUMERIC(5,2) CHECK (neck_in IS NULL OR neck_in BETWEEN 8 AND 25),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, measured_date)
);

COMMENT ON TABLE public.body_metrics IS 'Per-user weight + body measurements over time. One entry per day; updates replace.';

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date ON public.body_metrics (user_id, measured_date DESC);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.body_metrics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_metrics TO authenticated;

CREATE POLICY body_metrics_select_own ON public.body_metrics
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY body_metrics_insert_own ON public.body_metrics
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY body_metrics_update_own ON public.body_metrics
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY body_metrics_delete_own ON public.body_metrics
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_body_metrics_updated_at
    BEFORE UPDATE ON public.body_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. BODY PHOTOS (signed-URL pattern, follows workout_media)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.body_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    captured_date   DATE NOT NULL,
    pose            TEXT CHECK (pose IN ('front','side','back','custom')),
    storage_path    TEXT NOT NULL,
    mime_type       TEXT NOT NULL DEFAULT 'image/jpeg',
    width           INTEGER,
    height          INTEGER,
    size_bytes      INTEGER,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.body_photos IS 'Per-user progress photos. storage_path lives in a private bucket; access via signed URL only.';

CREATE INDEX IF NOT EXISTS idx_body_photos_user_date ON public.body_photos (user_id, captured_date DESC);

ALTER TABLE public.body_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.body_photos FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.body_photos TO authenticated;

CREATE POLICY body_photos_select_own ON public.body_photos
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY body_photos_insert_own ON public.body_photos
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY body_photos_delete_own ON public.body_photos
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 3. RESTING HEART RATE (log + helper)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resting_heart_rate (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    measured_date   DATE NOT NULL,
    bpm             SMALLINT NOT NULL CHECK (bpm BETWEEN 25 AND 220),
    source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','healthkit','google_fit','wearable')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, measured_date, source)
);

COMMENT ON TABLE public.resting_heart_rate IS 'Per-user resting heart rate log. Multiple sources allowed per day.';

CREATE INDEX IF NOT EXISTS idx_rhr_user_date ON public.resting_heart_rate (user_id, measured_date DESC);

ALTER TABLE public.resting_heart_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resting_heart_rate FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resting_heart_rate TO authenticated;

CREATE POLICY rhr_select_own ON public.resting_heart_rate
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY rhr_insert_own ON public.resting_heart_rate
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY rhr_update_own ON public.resting_heart_rate
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY rhr_delete_own ON public.resting_heart_rate
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 4. RPC: Average resting heart rate over window
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_avg_resting_hr(
    p_user_id UUID,
    p_days    INTEGER DEFAULT 30
)
RETURNS TABLE(
    avg_bpm           NUMERIC,
    min_bpm           SMALLINT,
    max_bpm           SMALLINT,
    sample_count      INTEGER,
    trend_delta_bpm   NUMERIC,
    last_measured_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_avg_recent NUMERIC;
    v_avg_prior  NUMERIC;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    IF p_days IS NULL OR p_days <= 0 THEN
        p_days := 30;
    END IF;

    -- Window: most-recent p_days
    SELECT ROUND(AVG(bpm)::NUMERIC, 1) INTO v_avg_recent
    FROM resting_heart_rate
    WHERE user_id = p_user_id
      AND measured_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;

    -- Prior window (for trend)
    SELECT ROUND(AVG(bpm)::NUMERIC, 1) INTO v_avg_prior
    FROM resting_heart_rate
    WHERE user_id = p_user_id
      AND measured_date >= CURRENT_DATE - (p_days * 2 || ' days')::INTERVAL
      AND measured_date <  CURRENT_DATE - (p_days || ' days')::INTERVAL;

    RETURN QUERY
    SELECT
        v_avg_recent,
        MIN(bpm)::SMALLINT,
        MAX(bpm)::SMALLINT,
        COUNT(*)::INTEGER,
        CASE WHEN v_avg_prior IS NULL THEN NULL ELSE ROUND(v_avg_recent - v_avg_prior, 1) END,
        MAX(measured_date)
    FROM resting_heart_rate
    WHERE user_id = p_user_id
      AND measured_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_avg_resting_hr(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_avg_resting_hr(UUID, INTEGER) TO authenticated;

-- 5. RPC: strength progression per exercise (recent points)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_strength_progression(
    p_user_id  UUID,
    p_exercise TEXT,
    p_limit    INTEGER DEFAULT 60
)
RETURNS TABLE(
    workout_date  TEXT,
    top_weight    NUMERIC,
    top_reps      NUMERIC,
    top_e1rm      NUMERIC,
    total_volume  NUMERIC,
    set_count     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 365 THEN
        p_limit := 60;
    END IF;

    RETURN QUERY
    WITH joined AS (
        SELECT
            wl.workout_date,
            NULLIF(wl.weight_lbs, '')::NUMERIC AS weight_n,
            NULLIF(wl.reps, '')::NUMERIC AS reps_n
        FROM public.workout_log wl
        WHERE wl.user_id = p_user_id
          AND LOWER(TRIM(wl.exercise)) = LOWER(TRIM(p_exercise))
          AND wl.workout_date IS NOT NULL
    ), per_day AS (
        SELECT
            workout_date,
            MAX(weight_n) AS top_weight,
            MAX(reps_n)   AS top_reps,
            MAX(public.epley_1rm(weight_n, reps_n::INTEGER)) AS top_e1rm,
            SUM(COALESCE(weight_n, 0) * COALESCE(reps_n, 0)) AS total_volume,
            COUNT(*)::INTEGER AS set_count
        FROM joined
        WHERE weight_n IS NOT NULL AND reps_n IS NOT NULL
        GROUP BY workout_date
    )
    SELECT
        workout_date,
        top_weight,
        top_reps,
        top_e1rm,
        total_volume,
        set_count
    FROM per_day
    ORDER BY workout_date DESC
    LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_strength_progression(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_strength_progression(UUID, TEXT, INTEGER) TO authenticated;
