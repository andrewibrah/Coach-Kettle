-- ============================================================
-- Migration 0039: Form analysis + recovery stub tables
-- Phase 2 features (MediaPipe rep counting + HealthKit / Google Fit
-- readiness) need a place to land. These tables let the app store
-- and surface results once native modules are wired in (separate
-- dev-client rebuild) without another migration churn.
-- ============================================================

-- 1. FORM ANALYSIS RESULTS (per-set)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workout_id      TEXT,                       -- references workouts(id) loosely
    exercise        TEXT NOT NULL,
    set_number      INTEGER,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Inputs
    video_storage_path TEXT,                    -- private bucket, signed URL only
    pose_landmarks  JSONB,                      -- frame-by-frame landmark snapshot
    -- Outputs
    rep_count       SMALLINT,
    avg_tempo_ms    INTEGER,
    rom_score       SMALLINT CHECK (rom_score IS NULL OR rom_score BETWEEN 0 AND 100),
    form_score      SMALLINT CHECK (form_score IS NULL OR form_score BETWEEN 0 AND 100),
    cues            JSONB NOT NULL DEFAULT '[]'::jsonb,
    warnings        JSONB NOT NULL DEFAULT '[]'::jsonb,
    analyzer_version TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.form_analyses IS 'Per-set form analysis results (Phase 2: MediaPipe). pose_landmarks may be large — TTL on storage_path.';

CREATE INDEX IF NOT EXISTS idx_form_analyses_user_captured ON public.form_analyses (user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_analyses_workout ON public.form_analyses (workout_id) WHERE workout_id IS NOT NULL;

ALTER TABLE public.form_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_analyses FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.form_analyses TO authenticated;

CREATE POLICY form_analyses_select_own ON public.form_analyses
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY form_analyses_insert_own ON public.form_analyses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY form_analyses_delete_own ON public.form_analyses
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 2. RECOVERY DATA (sleep, HRV, readiness) — Phase 2 HealthKit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recovery_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    measured_date   DATE NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','healthkit','google_fit','oura','whoop','garmin')),
    sleep_minutes   INTEGER CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
    sleep_score     SMALLINT CHECK (sleep_score IS NULL OR sleep_score BETWEEN 0 AND 100),
    hrv_ms          NUMERIC(6,2) CHECK (hrv_ms IS NULL OR hrv_ms BETWEEN 0 AND 300),
    readiness_score SMALLINT CHECK (readiness_score IS NULL OR readiness_score BETWEEN 0 AND 100),
    soreness        JSONB,                       -- e.g. {"chest":3,"legs":7} 0–10 scale
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, measured_date, source)
);

COMMENT ON TABLE public.recovery_data IS 'Per-user recovery data. Source allows multiple wearables. Phase 2 HealthKit / Google Fit fills this automatically.';

CREATE INDEX IF NOT EXISTS idx_recovery_user_date ON public.recovery_data (user_id, measured_date DESC);

ALTER TABLE public.recovery_data ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_data FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_data TO authenticated;

CREATE POLICY recovery_select_own ON public.recovery_data
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY recovery_insert_own ON public.recovery_data
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY recovery_update_own ON public.recovery_data
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY recovery_delete_own ON public.recovery_data
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 3. MOBILITY ROUTINES (Phase 2 will populate; schema lands now)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mobility_routines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    target_areas    JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_min    INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 90),
    movements       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.mobility_routines IS 'Catalog of mobility/stretching routines. Recommended by soreness data from recovery_data.';

ALTER TABLE public.mobility_routines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobility_routines FROM anon, authenticated;
GRANT SELECT ON public.mobility_routines TO authenticated;

CREATE POLICY mobility_routines_read_all ON public.mobility_routines
    FOR SELECT TO authenticated
    USING (TRUE);

INSERT INTO public.mobility_routines (slug, name, description, target_areas, duration_min, movements)
VALUES
  ('quick-hip-opener', 'Quick Hip Opener',
   '5-minute hip opener for post-leg-day soreness.',
   '["hips","glutes","quads"]', 5,
   '[
     {"name":"90/90 Hip Switch","seconds":60},
     {"name":"World''s Greatest Stretch","seconds":60,"per_side":true},
     {"name":"Couch Stretch","seconds":60,"per_side":true},
     {"name":"Pigeon Pose","seconds":60,"per_side":true}
   ]'::jsonb),
  ('upper-back-decompress', 'Upper Back Decompress',
   '6-minute thoracic + shoulder routine for desk/bench fatigue.',
   '["thoracic","shoulders","chest"]', 6,
   '[
     {"name":"Cat-Cow","seconds":60},
     {"name":"Thread the Needle","seconds":60,"per_side":true},
     {"name":"Doorway Pec Stretch","seconds":60,"per_side":true},
     {"name":"Scap Pushups","seconds":60}
   ]'::jsonb),
  ('full-body-flush', 'Full-Body Flush',
   '10-minute general-purpose mobility flush.',
   '["full_body"]', 10,
   '[
     {"name":"Slow Inchworm","seconds":60},
     {"name":"Down Dog to Cobra","seconds":60},
     {"name":"Spiderman Lunge","seconds":60,"per_side":true},
     {"name":"Seated Forward Fold","seconds":90},
     {"name":"Cossack Squat","seconds":60,"per_side":true}
   ]'::jsonb)
ON CONFLICT (slug) DO NOTHING;
