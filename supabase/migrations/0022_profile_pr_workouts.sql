-- Profile, PR Tracking, and Workout Templates
-- Migration for onboarding quiz, PR detection, and workout regimens

-------------------------------------------------------------------------------
-- PROFILES TABLE
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Onboarding state
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,

    -- Physical stats
    height_value NUMERIC,
    height_unit TEXT CHECK (height_unit IN ('cm', 'in')),
    dob DATE,
    current_weight NUMERIC,
    goal_weight NUMERIC,
    weight_unit TEXT CHECK (weight_unit IN ('lb', 'kg')),

    -- Fitness goals
    focus TEXT CHECK (focus IN ('strength', 'lean_muscle', 'fat_loss', 'other')),
    focus_other TEXT,

    -- AI context (compact JSON for coaching)
    ai_context JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);

-------------------------------------------------------------------------------
-- PR TRACKED LIFTS TABLE
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_tracked_lifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lift_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, lift_name)
);

CREATE INDEX IF NOT EXISTS idx_pr_tracked_lifts_user_id ON public.pr_tracked_lifts (user_id);
CREATE INDEX IF NOT EXISTS idx_pr_tracked_lifts_lift_name ON public.pr_tracked_lifts (user_id, lift_name);

-------------------------------------------------------------------------------
-- PR LIFTS TABLE (Current Best)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_lifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lift_name TEXT NOT NULL,
    weight_lbs NUMERIC NOT NULL,
    reps INTEGER NOT NULL,
    estimated_1rm NUMERIC NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, lift_name)
);

CREATE INDEX IF NOT EXISTS idx_pr_lifts_user_id ON public.pr_lifts (user_id);
CREATE INDEX IF NOT EXISTS idx_pr_lifts_lookup ON public.pr_lifts (user_id, lift_name);

-------------------------------------------------------------------------------
-- PR HISTORY TABLE (Breakthroughs Timeline)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lift_name TEXT NOT NULL,
    weight_lbs NUMERIC NOT NULL,
    reps INTEGER NOT NULL,
    estimated_1rm NUMERIC NOT NULL,
    previous_1rm NUMERIC,
    improvement_pct NUMERIC,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_history_user_id ON public.pr_history (user_id);
CREATE INDEX IF NOT EXISTS idx_pr_history_lift ON public.pr_history (user_id, lift_name, achieved_at DESC);

-------------------------------------------------------------------------------
-- WORKOUT TEMPLATES TABLE
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_user_id ON public.workout_templates (user_id);

-------------------------------------------------------------------------------
-- WORKOUT TEMPLATE ITEMS TABLE
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lift_name TEXT NOT NULL,
    target_sets INTEGER,
    target_reps INTEGER,
    display_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_template_items_template ON public.workout_template_items (template_id);
CREATE INDEX IF NOT EXISTS idx_workout_template_items_user ON public.workout_template_items (user_id);

-------------------------------------------------------------------------------
-- FUNCTIONS
-------------------------------------------------------------------------------

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Epley 1RM Formula: weight * (1 + reps/30)
CREATE OR REPLACE FUNCTION public.epley_1rm(weight NUMERIC, reps INTEGER)
RETURNS NUMERIC AS $$
BEGIN
    IF reps <= 0 THEN
        RETURN weight;
    END IF;
    RETURN ROUND(weight * (1.0 + reps::NUMERIC / 30.0), 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- PR Detection Trigger Function
CREATE OR REPLACE FUNCTION public.update_pr_from_workout_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_exercise TEXT;
    v_weight NUMERIC;
    v_reps INTEGER;
    v_new_e1rm NUMERIC;
    v_current_e1rm NUMERIC;
    v_is_tracked BOOLEAN;
BEGIN
    -- Extract values from workout_log insert
    v_user_id := NEW.user_id;
    v_exercise := LOWER(TRIM(NEW.exercise));

    -- Parse weight (handle text column)
    BEGIN
        v_weight := NEW.weight_lbs::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW; -- Skip if weight is not numeric
    END;

    -- Parse reps (handle text column)
    BEGIN
        v_reps := NEW.reps::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW; -- Skip if reps is not numeric
    END;

    -- Skip if no valid weight/reps
    IF v_weight IS NULL OR v_weight <= 0 OR v_reps IS NULL OR v_reps <= 0 THEN
        RETURN NEW;
    END IF;

    -- Check if this lift is tracked for PRs
    SELECT EXISTS(
        SELECT 1 FROM public.pr_tracked_lifts
        WHERE user_id = v_user_id
        AND LOWER(TRIM(lift_name)) = v_exercise
        AND is_active = TRUE
    ) INTO v_is_tracked;

    IF NOT v_is_tracked THEN
        RETURN NEW;
    END IF;

    -- Calculate new estimated 1RM
    v_new_e1rm := public.epley_1rm(v_weight, v_reps);

    -- Get current best e1rm for this lift
    SELECT estimated_1rm INTO v_current_e1rm
    FROM public.pr_lifts
    WHERE user_id = v_user_id AND LOWER(TRIM(lift_name)) = v_exercise;

    -- Check if this is a new PR
    IF v_current_e1rm IS NULL OR v_new_e1rm > v_current_e1rm THEN
        -- Insert or update pr_lifts
        INSERT INTO public.pr_lifts (user_id, lift_name, weight_lbs, reps, estimated_1rm, achieved_at, updated_at)
        VALUES (v_user_id, NEW.exercise, v_weight, v_reps, v_new_e1rm, NOW(), NOW())
        ON CONFLICT (user_id, lift_name)
        DO UPDATE SET
            weight_lbs = EXCLUDED.weight_lbs,
            reps = EXCLUDED.reps,
            estimated_1rm = EXCLUDED.estimated_1rm,
            achieved_at = EXCLUDED.achieved_at,
            updated_at = NOW();

        -- Record in PR history
        INSERT INTO public.pr_history (
            user_id, lift_name, weight_lbs, reps, estimated_1rm,
            previous_1rm, improvement_pct, achieved_at
        )
        VALUES (
            v_user_id, NEW.exercise, v_weight, v_reps, v_new_e1rm,
            v_current_e1rm,
            CASE WHEN v_current_e1rm > 0 THEN ROUND(((v_new_e1rm - v_current_e1rm) / v_current_e1rm) * 100, 1) ELSE NULL END,
            NOW()
        );

        -- Notify client of PR breakthrough
        PERFORM pg_notify('pr_breakthrough', json_build_object(
            'user_id', v_user_id,
            'lift_name', NEW.exercise,
            'weight', v_weight,
            'reps', v_reps,
            'new_e1rm', v_new_e1rm,
            'previous_e1rm', v_current_e1rm
        )::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh AI Context Function
CREATE OR REPLACE FUNCTION public.refresh_ai_context(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_context JSONB;
BEGIN
    SELECT jsonb_build_object(
        'height', CASE WHEN p.height_value IS NOT NULL THEN
            jsonb_build_object('value', p.height_value, 'unit', p.height_unit)
        ELSE NULL END,
        'dob', p.dob,
        'current_weight', CASE WHEN p.current_weight IS NOT NULL THEN
            jsonb_build_object('value', p.current_weight, 'unit', p.weight_unit)
        ELSE NULL END,
        'goal_weight', CASE WHEN p.goal_weight IS NOT NULL THEN
            jsonb_build_object('value', p.goal_weight, 'unit', p.weight_unit)
        ELSE NULL END,
        'focus', jsonb_build_object('type', p.focus, 'other', p.focus_other),
        'tracked_pr_lifts', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'lift', t.lift_name,
                'active', t.is_active
            )), '[]'::jsonb)
            FROM public.pr_tracked_lifts t
            WHERE t.user_id = p_user_id
        ),
        'current_prs', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'lift', pr.lift_name,
                'best', jsonb_build_object(
                    'weight', pr.weight_lbs,
                    'reps', pr.reps,
                    'unit', 'lb',
                    'e1rm', pr.estimated_1rm
                ),
                'updated_at', pr.updated_at
            )), '[]'::jsonb)
            FROM public.pr_lifts pr
            WHERE pr.user_id = p_user_id
        ),
        'workout_templates', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', wt.id,
                'name', wt.name
            )), '[]'::jsonb)
            FROM public.workout_templates wt
            WHERE wt.user_id = p_user_id AND wt.is_active = TRUE
        )
    ) INTO v_context
    FROM public.profiles p
    WHERE p.user_id = p_user_id;

    UPDATE public.profiles
    SET ai_context = COALESCE(v_context, '{}'::jsonb), updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create profile for new user (called from auth trigger or app)
CREATE OR REPLACE FUNCTION public.create_profile_for_user(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    INSERT INTO public.profiles (user_id, onboarding_completed, onboarding_step)
    VALUES (p_user_id, FALSE, 0)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_profile_id;

    -- Return existing profile id if already exists
    IF v_profile_id IS NULL THEN
        SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = p_user_id;
    END IF;

    RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-------------------------------------------------------------------------------
-- TRIGGERS
-------------------------------------------------------------------------------

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workout_templates_updated_at ON public.workout_templates;
CREATE TRIGGER trg_workout_templates_updated_at
    BEFORE UPDATE ON public.workout_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pr_lifts_updated_at ON public.pr_lifts;
CREATE TRIGGER trg_pr_lifts_updated_at
    BEFORE UPDATE ON public.pr_lifts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PR Detection trigger on workout_log
DROP TRIGGER IF EXISTS trg_update_pr_from_workout_log ON public.workout_log;
CREATE TRIGGER trg_update_pr_from_workout_log
    AFTER INSERT ON public.workout_log
    FOR EACH ROW EXECUTE FUNCTION public.update_pr_from_workout_log();

-------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-------------------------------------------------------------------------------

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY profiles_delete_own ON public.profiles
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- PR Tracked Lifts
ALTER TABLE public.pr_tracked_lifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_tracked_lifts_select_own ON public.pr_tracked_lifts;
DROP POLICY IF EXISTS pr_tracked_lifts_insert_own ON public.pr_tracked_lifts;
DROP POLICY IF EXISTS pr_tracked_lifts_update_own ON public.pr_tracked_lifts;
DROP POLICY IF EXISTS pr_tracked_lifts_delete_own ON public.pr_tracked_lifts;

CREATE POLICY pr_tracked_lifts_select_own ON public.pr_tracked_lifts
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_tracked_lifts_insert_own ON public.pr_tracked_lifts
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_tracked_lifts_update_own ON public.pr_tracked_lifts
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_tracked_lifts_delete_own ON public.pr_tracked_lifts
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- PR Lifts
ALTER TABLE public.pr_lifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_lifts_select_own ON public.pr_lifts;
DROP POLICY IF EXISTS pr_lifts_insert_own ON public.pr_lifts;
DROP POLICY IF EXISTS pr_lifts_update_own ON public.pr_lifts;
DROP POLICY IF EXISTS pr_lifts_delete_own ON public.pr_lifts;

CREATE POLICY pr_lifts_select_own ON public.pr_lifts
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_lifts_insert_own ON public.pr_lifts
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_lifts_update_own ON public.pr_lifts
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_lifts_delete_own ON public.pr_lifts
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- PR History
ALTER TABLE public.pr_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_history_select_own ON public.pr_history;
DROP POLICY IF EXISTS pr_history_insert_own ON public.pr_history;
DROP POLICY IF EXISTS pr_history_delete_own ON public.pr_history;

CREATE POLICY pr_history_select_own ON public.pr_history
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_history_insert_own ON public.pr_history
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY pr_history_delete_own ON public.pr_history
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Workout Templates
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_templates_select_own ON public.workout_templates;
DROP POLICY IF EXISTS workout_templates_insert_own ON public.workout_templates;
DROP POLICY IF EXISTS workout_templates_update_own ON public.workout_templates;
DROP POLICY IF EXISTS workout_templates_delete_own ON public.workout_templates;

CREATE POLICY workout_templates_select_own ON public.workout_templates
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_templates_insert_own ON public.workout_templates
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_templates_update_own ON public.workout_templates
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_templates_delete_own ON public.workout_templates
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Workout Template Items
ALTER TABLE public.workout_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_template_items_select_own ON public.workout_template_items;
DROP POLICY IF EXISTS workout_template_items_insert_own ON public.workout_template_items;
DROP POLICY IF EXISTS workout_template_items_update_own ON public.workout_template_items;
DROP POLICY IF EXISTS workout_template_items_delete_own ON public.workout_template_items;

CREATE POLICY workout_template_items_select_own ON public.workout_template_items
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_template_items_insert_own ON public.workout_template_items
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_template_items_update_own ON public.workout_template_items
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_template_items_delete_own ON public.workout_template_items
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-------------------------------------------------------------------------------
-- GRANT PERMISSIONS
-------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.pr_tracked_lifts TO authenticated;
GRANT ALL ON public.pr_lifts TO authenticated;
GRANT ALL ON public.pr_history TO authenticated;
GRANT ALL ON public.workout_templates TO authenticated;
GRANT ALL ON public.workout_template_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.epley_1rm TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ai_context TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_user TO authenticated;
