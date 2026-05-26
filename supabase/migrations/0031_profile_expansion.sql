-- ============================================================
-- Migration 0031: Profile expansion for nutrition + programming
-- Adds anthropometrics, dietary prefs, goal type, activity level,
-- equipment availability, training availability, and unit prefs.
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS sex TEXT
        CHECK (sex IN ('male', 'female', 'other')),
    ADD COLUMN IF NOT EXISTS activity_level TEXT
        CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'very_active', 'athlete')),
    ADD COLUMN IF NOT EXISTS goal_type TEXT
        CHECK (goal_type IN ('muscle_building', 'leaning_out', 'weight_loss', 'maintenance', 'strength', 'endurance')),
    ADD COLUMN IF NOT EXISTS dietary_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS dietary_allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS disliked_foods JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS preferred_cuisines JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS available_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS training_days_per_week SMALLINT
        CHECK (training_days_per_week BETWEEN 1 AND 7),
    ADD COLUMN IF NOT EXISTS session_minutes_target SMALLINT
        CHECK (session_minutes_target BETWEEN 15 AND 240),
    ADD COLUMN IF NOT EXISTS measurement_system TEXT
        CHECK (measurement_system IN ('imperial', 'metric')) DEFAULT 'imperial',
    ADD COLUMN IF NOT EXISTS calorie_target_override INTEGER
        CHECK (calorie_target_override IS NULL OR calorie_target_override BETWEEN 800 AND 6000),
    ADD COLUMN IF NOT EXISTS protein_g_per_lb NUMERIC(4,2)
        CHECK (protein_g_per_lb IS NULL OR protein_g_per_lb BETWEEN 0.4 AND 1.6);

COMMENT ON COLUMN public.profiles.sex IS 'Biological sex used for BMR/TDEE calculations.';
COMMENT ON COLUMN public.profiles.activity_level IS 'Daily activity level outside training.';
COMMENT ON COLUMN public.profiles.goal_type IS 'Primary goal; drives macro split and program selection.';
COMMENT ON COLUMN public.profiles.dietary_preferences IS 'Array of strings (e.g. ["vegetarian","gluten_free"]).';
COMMENT ON COLUMN public.profiles.dietary_allergies IS 'Array of allergen tags (e.g. ["peanut","shellfish"]).';
COMMENT ON COLUMN public.profiles.disliked_foods IS 'Array of food names to avoid in plans.';
COMMENT ON COLUMN public.profiles.preferred_cuisines IS 'Array of cuisine tags (e.g. ["mediterranean","asian"]).';
COMMENT ON COLUMN public.profiles.available_equipment IS 'Array (["full_gym","dumbbells","bands","bodyweight"]).';
