-- ============================================================
-- Migration 0034: Coaching system
-- Daily feedback grades, harshness state machine, behavior events.
-- Powers Daily Honest Feedback + Harshness Progression.
-- ============================================================

-- 1. DAILY FEEDBACK (one row per user per day)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feedback_date       DATE NOT NULL,
    -- Inputs at time of grading
    workout_completed   BOOLEAN NOT NULL DEFAULT FALSE,
    nutrition_color     TEXT CHECK (nutrition_color IN ('green','yellow','red')),
    nutrition_score     SMALLINT CHECK (nutrition_score BETWEEN 0 AND 100),
    -- Grades
    nutrition_grade     TEXT,
    workout_grade       TEXT,
    overall_color       TEXT CHECK (overall_color IN ('green','yellow','red')),
    -- Honest narrative
    did_well            TEXT,
    needs_improvement   TEXT,
    tomorrow_focus      TEXT,
    -- Harshness applied
    harshness_level     SMALLINT NOT NULL DEFAULT 0 CHECK (harshness_level BETWEEN 0 AND 3),
    tone                TEXT CHECK (tone IN ('supportive','firm','direct','accountability')),
    -- Bookkeeping
    streak_days         INTEGER NOT NULL DEFAULT 0,
    bad_days_streak     INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, feedback_date)
);

COMMENT ON TABLE public.daily_feedback IS 'Per-user per-day coaching report. Drives the Coach screen.';

CREATE INDEX IF NOT EXISTS idx_daily_feedback_user_date ON public.daily_feedback (user_id, feedback_date DESC);

ALTER TABLE public.daily_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_feedback FROM anon, authenticated;
GRANT SELECT ON public.daily_feedback TO authenticated;

CREATE POLICY daily_feedback_select_own ON public.daily_feedback
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_daily_feedback_updated_at
    BEFORE UPDATE ON public.daily_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. BEHAVIOR STATE (current harshness state per user)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.behavior_state (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    harshness_level         SMALLINT NOT NULL DEFAULT 0 CHECK (harshness_level BETWEEN 0 AND 3),
    consecutive_bad_days    INTEGER NOT NULL DEFAULT 0,
    consecutive_good_days   INTEGER NOT NULL DEFAULT 0,
    last_evaluated_date     DATE,
    last_bad_day_date       DATE,
    last_good_day_date      DATE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.behavior_state IS 'Per-user behavior state machine. 0=supportive, 1=firm, 2=direct, 3=accountability mode.';

ALTER TABLE public.behavior_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.behavior_state FROM anon, authenticated;
GRANT SELECT ON public.behavior_state TO authenticated;

CREATE POLICY behavior_state_select_own ON public.behavior_state
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_behavior_state_updated_at
    BEFORE UPDATE ON public.behavior_state
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. BEHAVIOR EVENTS (append-only audit of grading decisions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.behavior_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_date      DATE NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('good_day','bad_day','workout_missed','nutrition_red','nutrition_green','workout_completed','plan_recalibrated','harshness_changed')),
    delta_harshness SMALLINT NOT NULL DEFAULT 0,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.behavior_events IS 'Append-only behavior event log for harshness state machine.';

CREATE INDEX IF NOT EXISTS idx_behavior_events_user_date ON public.behavior_events (user_id, event_date DESC);

ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.behavior_events FROM anon, authenticated;
GRANT SELECT ON public.behavior_events TO authenticated;

CREATE POLICY behavior_events_select_own ON public.behavior_events
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 4. RPC: get recent feedback (last N days)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_recent_daily_feedback(
    p_user_id UUID,
    p_days    INTEGER DEFAULT 7
)
RETURNS TABLE(
    feedback_date     DATE,
    overall_color     TEXT,
    nutrition_color   TEXT,
    workout_completed BOOLEAN,
    harshness_level   SMALLINT,
    did_well          TEXT,
    needs_improvement TEXT,
    tomorrow_focus    TEXT,
    streak_days       INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN QUERY
    SELECT
        df.feedback_date,
        df.overall_color,
        df.nutrition_color,
        df.workout_completed,
        df.harshness_level,
        df.did_well,
        df.needs_improvement,
        df.tomorrow_focus,
        df.streak_days
    FROM daily_feedback df
    WHERE df.user_id = p_user_id
      AND df.feedback_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    ORDER BY df.feedback_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_recent_daily_feedback(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_daily_feedback(UUID, INTEGER) TO authenticated;
