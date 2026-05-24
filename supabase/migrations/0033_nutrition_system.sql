-- ============================================================
-- Migration 0033: Nutrition system
-- Foods catalog, food logs, daily nutrition targets, meal plans
-- with day-of-week + training-vs-rest macro splits, daily summary
-- materialization. Everything user-scoped via RLS.
-- ============================================================

-- 1. FOODS CATALOG
-- ------------------------------------------------------------
-- Two tiers:
--   • is_global = TRUE → seeded global foods (anyone can read)
--   • is_global = FALSE → user-created foods (only owner reads)
CREATE TABLE IF NOT EXISTS public.foods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_global       BOOLEAN NOT NULL DEFAULT FALSE,
    name            TEXT NOT NULL,
    brand           TEXT,
    serving_size_g  NUMERIC(8,2) NOT NULL CHECK (serving_size_g > 0),
    serving_label   TEXT,
    calories        NUMERIC(7,2) NOT NULL CHECK (calories >= 0),
    protein_g       NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
    carbs_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
    fat_g           NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
    fiber_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
    saturated_fat_g NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (saturated_fat_g >= 0),
    sugar_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (sugar_g >= 0),
    sodium_mg       NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (sodium_mg >= 0),
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT foods_owner_or_global CHECK (
        (is_global = TRUE AND user_id IS NULL) OR
        (is_global = FALSE AND user_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.foods IS 'Food catalog. Global foods (is_global=TRUE) seeded by service-role. User foods (is_global=FALSE) owned per-user.';

CREATE INDEX IF NOT EXISTS idx_foods_name_lower ON public.foods (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_foods_user_id ON public.foods (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_global ON public.foods (is_global) WHERE is_global = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_global_name ON public.foods (LOWER(name), COALESCE(brand, '')) WHERE is_global = TRUE;

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.foods FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foods TO authenticated;

CREATE POLICY foods_select ON public.foods
    FOR SELECT TO authenticated
    USING (is_global = TRUE OR user_id = (SELECT auth.uid()));

CREATE POLICY foods_insert_own ON public.foods
    FOR INSERT TO authenticated
    WITH CHECK (is_global = FALSE AND user_id = (SELECT auth.uid()));

CREATE POLICY foods_update_own ON public.foods
    FOR UPDATE TO authenticated
    USING (is_global = FALSE AND user_id = (SELECT auth.uid()))
    WITH CHECK (is_global = FALSE AND user_id = (SELECT auth.uid()));

CREATE POLICY foods_delete_own ON public.foods
    FOR DELETE TO authenticated
    USING (is_global = FALSE AND user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_foods_updated_at
    BEFORE UPDATE ON public.foods
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. FOOD LOGS (what the user actually ate)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    food_id         UUID REFERENCES public.foods(id) ON DELETE SET NULL,
    log_date        DATE NOT NULL,
    meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack')),
    consumed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Snapshot fields (resilient even if the food row is deleted)
    food_name       TEXT NOT NULL,
    servings        NUMERIC(7,2) NOT NULL CHECK (servings > 0) DEFAULT 1,
    calories        NUMERIC(8,2) NOT NULL CHECK (calories >= 0),
    protein_g       NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
    carbs_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
    fat_g           NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
    fiber_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
    saturated_fat_g NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (saturated_fat_g >= 0),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.food_logs IS 'Per-user food intake log. Snapshots macros at log time so historical totals are stable.';

CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON public.food_logs (user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_consumed ON public.food_logs (user_id, consumed_at DESC);

ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_logs TO authenticated;

CREATE POLICY food_logs_select_own ON public.food_logs
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY food_logs_insert_own ON public.food_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY food_logs_update_own ON public.food_logs
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY food_logs_delete_own ON public.food_logs
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_food_logs_updated_at
    BEFORE UPDATE ON public.food_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. DAILY NUTRITION TARGETS (per-user, mutable as plan recalibrates)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_targets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Training day targets
    training_calories   INTEGER NOT NULL CHECK (training_calories BETWEEN 800 AND 6000),
    training_protein_g  INTEGER NOT NULL CHECK (training_protein_g BETWEEN 30 AND 400),
    training_carbs_g    INTEGER NOT NULL CHECK (training_carbs_g BETWEEN 30 AND 800),
    training_fat_g      INTEGER NOT NULL CHECK (training_fat_g BETWEEN 20 AND 250),
    -- Rest day targets
    rest_calories       INTEGER NOT NULL CHECK (rest_calories BETWEEN 800 AND 6000),
    rest_protein_g      INTEGER NOT NULL CHECK (rest_protein_g BETWEEN 30 AND 400),
    rest_carbs_g        INTEGER NOT NULL CHECK (rest_carbs_g BETWEEN 30 AND 800),
    rest_fat_g          INTEGER NOT NULL CHECK (rest_fat_g BETWEEN 20 AND 250),
    -- Targets
    fiber_g_min         INTEGER NOT NULL DEFAULT 25 CHECK (fiber_g_min BETWEEN 10 AND 80),
    saturated_fat_g_max INTEGER NOT NULL DEFAULT 30 CHECK (saturated_fat_g_max BETWEEN 5 AND 80),
    -- Source / derivation
    bmr                 INTEGER,
    tdee                INTEGER,
    derivation_inputs   JSONB,
    last_recalibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.nutrition_targets IS 'Per-user daily macro targets split by training vs rest day. Recalibrated weekly.';

ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nutrition_targets FROM anon, authenticated;
GRANT SELECT ON public.nutrition_targets TO authenticated;

CREATE POLICY nutrition_targets_select_own ON public.nutrition_targets
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_nutrition_targets_updated_at
    BEFORE UPDATE ON public.nutrition_targets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 4. MEAL PLANS (weekly)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('active','archived','generating','failed')) DEFAULT 'active',
    targets_snapshot JSONB NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, week_start_date)
);

COMMENT ON TABLE public.meal_plans IS 'Weekly meal plan generated for the user. One active plan per week_start.';

CREATE INDEX IF NOT EXISTS idx_meal_plans_user_week ON public.meal_plans (user_id, week_start_date DESC);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meal_plans FROM anon, authenticated;
GRANT SELECT ON public.meal_plans TO authenticated;

CREATE POLICY meal_plans_select_own ON public.meal_plans
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_meal_plans_updated_at
    BEFORE UPDATE ON public.meal_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 5. PLANNED MEALS (one row per planned meal per day)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planned_meals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun .. 6=Sat
    is_training_day BOOLEAN NOT NULL DEFAULT FALSE,
    meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack')),
    title           TEXT NOT NULL,
    description     TEXT,
    -- Aggregate macros for the whole meal (sum of items)
    calories        NUMERIC(8,2) NOT NULL CHECK (calories >= 0),
    protein_g       NUMERIC(7,2) NOT NULL DEFAULT 0,
    carbs_g         NUMERIC(7,2) NOT NULL DEFAULT 0,
    fat_g           NUMERIC(7,2) NOT NULL DEFAULT 0,
    fiber_g         NUMERIC(7,2) NOT NULL DEFAULT 0,
    -- Items breakdown (array of {name, grams, calories, protein, carbs, fat})
    items           JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.planned_meals IS 'Individual planned meals within a meal_plan. Items live in JSONB for flexibility.';

CREATE INDEX IF NOT EXISTS idx_planned_meals_plan ON public.planned_meals (plan_id, day_of_week, meal_slot);
CREATE INDEX IF NOT EXISTS idx_planned_meals_user ON public.planned_meals (user_id);

ALTER TABLE public.planned_meals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planned_meals FROM anon, authenticated;
GRANT SELECT ON public.planned_meals TO authenticated;

CREATE POLICY planned_meals_select_own ON public.planned_meals
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 6. DAILY NUTRITION SUMMARIES (materialized per-day after grading)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_nutrition_summaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    summary_date    DATE NOT NULL,
    is_training_day BOOLEAN NOT NULL DEFAULT FALSE,
    -- Logged totals
    calories        NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_g       NUMERIC(7,2) NOT NULL DEFAULT 0,
    carbs_g         NUMERIC(7,2) NOT NULL DEFAULT 0,
    fat_g           NUMERIC(7,2) NOT NULL DEFAULT 0,
    fiber_g         NUMERIC(7,2) NOT NULL DEFAULT 0,
    saturated_fat_g NUMERIC(7,2) NOT NULL DEFAULT 0,
    -- Target snapshots
    calorie_target  INTEGER,
    protein_target  INTEGER,
    carb_target     INTEGER,
    fat_target      INTEGER,
    -- Grade
    color_grade     TEXT CHECK (color_grade IN ('green','yellow','red')),
    score           SMALLINT CHECK (score BETWEEN 0 AND 100),
    gap_summary     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, summary_date)
);

COMMENT ON TABLE public.daily_nutrition_summaries IS 'One row per user per day. Snapshots logged totals + targets + color grade.';

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_summaries_user_date ON public.daily_nutrition_summaries (user_id, summary_date DESC);

ALTER TABLE public.daily_nutrition_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_nutrition_summaries FROM anon, authenticated;
GRANT SELECT ON public.daily_nutrition_summaries TO authenticated;

CREATE POLICY daily_nutrition_summaries_select_own ON public.daily_nutrition_summaries
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_daily_nutrition_summaries_updated_at
    BEFORE UPDATE ON public.daily_nutrition_summaries
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 7. RPC: daily totals (live, not from snapshot)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_food_daily_totals(
    p_user_id UUID,
    p_date    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    calories        NUMERIC,
    protein_g       NUMERIC,
    carbs_g         NUMERIC,
    fat_g           NUMERIC,
    fiber_g         NUMERIC,
    saturated_fat_g NUMERIC,
    log_count       INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Owner check: only the user themselves can read their totals
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(fl.calories), 0)::NUMERIC,
        COALESCE(SUM(fl.protein_g), 0)::NUMERIC,
        COALESCE(SUM(fl.carbs_g), 0)::NUMERIC,
        COALESCE(SUM(fl.fat_g), 0)::NUMERIC,
        COALESCE(SUM(fl.fiber_g), 0)::NUMERIC,
        COALESCE(SUM(fl.saturated_fat_g), 0)::NUMERIC,
        COUNT(*)::INTEGER
    FROM food_logs fl
    WHERE fl.user_id = p_user_id AND fl.log_date = p_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_food_daily_totals(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_food_daily_totals(UUID, DATE) TO authenticated;

-- 8. Seed: a small global foods catalog so the app is useful from day 1
-- ------------------------------------------------------------
INSERT INTO public.foods
  (is_global, user_id, name, brand, serving_size_g, serving_label, calories, protein_g, carbs_g, fat_g, fiber_g, saturated_fat_g, sugar_g, sodium_mg, tags)
VALUES
  (TRUE, NULL, 'Chicken Breast (cooked, skinless)', NULL, 100, '100 g', 165, 31, 0, 3.6, 0, 1, 0, 74, '["protein","lean","poultry"]'),
  (TRUE, NULL, 'Whole Eggs (large)', NULL, 50, '1 large egg', 72, 6.3, 0.4, 4.8, 0, 1.6, 0.2, 71, '["protein","breakfast"]'),
  (TRUE, NULL, 'Greek Yogurt, Plain Nonfat', NULL, 170, '1 cup', 100, 17, 6, 0.7, 0, 0.4, 6, 65, '["protein","dairy","breakfast"]'),
  (TRUE, NULL, 'Cottage Cheese, Low-Fat', NULL, 113, '1/2 cup', 90, 12, 5, 2.5, 0, 1.5, 4, 360, '["protein","dairy"]'),
  (TRUE, NULL, 'Whey Protein Powder', NULL, 30, '1 scoop', 120, 24, 3, 1.5, 1, 0.5, 1, 60, '["protein","supplement"]'),
  (TRUE, NULL, 'Top Sirloin Steak (cooked)', NULL, 100, '100 g', 206, 29, 0, 9, 0, 3.6, 0, 60, '["protein","beef"]'),
  (TRUE, NULL, 'Salmon (cooked)', NULL, 100, '100 g', 208, 22, 0, 13, 0, 3.1, 0, 59, '["protein","fish","omega3"]'),
  (TRUE, NULL, 'Tuna, Canned in Water', NULL, 85, '3 oz', 100, 22, 0, 1, 0, 0.2, 0, 320, '["protein","fish"]'),
  (TRUE, NULL, 'Tofu, Firm', NULL, 100, '100 g', 144, 17, 3, 9, 2.3, 1.3, 0.6, 14, '["protein","plant_based","vegetarian"]'),
  (TRUE, NULL, 'Lentils (cooked)', NULL, 100, '100 g', 116, 9, 20, 0.4, 7.9, 0.1, 1.8, 2, '["protein","carbs","fiber","plant_based"]'),
  (TRUE, NULL, 'Black Beans (cooked)', NULL, 100, '100 g', 132, 8.9, 23.7, 0.5, 8.7, 0.1, 0.3, 1, '["protein","carbs","fiber","plant_based"]'),
  (TRUE, NULL, 'White Rice (cooked)', NULL, 100, '100 g', 130, 2.7, 28, 0.3, 0.4, 0.1, 0, 1, '["carbs","grain"]'),
  (TRUE, NULL, 'Brown Rice (cooked)', NULL, 100, '100 g', 112, 2.6, 23, 0.9, 1.8, 0.2, 0.4, 5, '["carbs","grain","fiber"]'),
  (TRUE, NULL, 'Oats, Rolled, Dry', NULL, 40, '1/2 cup dry', 150, 5, 27, 3, 4, 0.5, 1, 0, '["carbs","fiber","breakfast"]'),
  (TRUE, NULL, 'Sweet Potato (baked)', NULL, 100, '100 g', 90, 2, 21, 0.1, 3.3, 0, 6.8, 36, '["carbs","fiber"]'),
  (TRUE, NULL, 'Quinoa (cooked)', NULL, 100, '100 g', 120, 4.4, 21.3, 1.9, 2.8, 0.2, 0.9, 7, '["carbs","protein","fiber","plant_based"]'),
  (TRUE, NULL, 'Banana, Medium', NULL, 118, '1 medium', 105, 1.3, 27, 0.4, 3.1, 0.1, 14, 1, '["fruit","carbs"]'),
  (TRUE, NULL, 'Apple, Medium', NULL, 182, '1 medium', 95, 0.5, 25, 0.3, 4.4, 0.1, 19, 2, '["fruit","fiber"]'),
  (TRUE, NULL, 'Blueberries', NULL, 100, '100 g', 57, 0.7, 14, 0.3, 2.4, 0, 10, 1, '["fruit","fiber","antioxidant"]'),
  (TRUE, NULL, 'Broccoli, Steamed', NULL, 100, '100 g', 35, 2.4, 7.2, 0.4, 3.3, 0, 1.4, 41, '["vegetable","fiber"]'),
  (TRUE, NULL, 'Spinach, Raw', NULL, 100, '100 g', 23, 2.9, 3.6, 0.4, 2.2, 0.1, 0.4, 79, '["vegetable","leafy","fiber"]'),
  (TRUE, NULL, 'Avocado', NULL, 100, '100 g', 160, 2, 8.5, 14.7, 6.7, 2.1, 0.7, 7, '["fat","fiber"]'),
  (TRUE, NULL, 'Almonds', NULL, 28, '1 oz', 164, 6, 6, 14, 3.5, 1.1, 1.2, 0, '["fat","protein","fiber"]'),
  (TRUE, NULL, 'Peanut Butter, Natural', NULL, 32, '2 tbsp', 188, 8, 7, 16, 2, 3, 3, 5, '["fat","protein"]'),
  (TRUE, NULL, 'Olive Oil', NULL, 14, '1 tbsp', 120, 0, 0, 14, 0, 2, 0, 0, '["fat","oil"]'),
  (TRUE, NULL, 'Milk, 2%', NULL, 240, '1 cup', 122, 8, 12, 5, 0, 3, 12, 100, '["dairy","protein"]'),
  (TRUE, NULL, 'Cheddar Cheese', NULL, 28, '1 oz', 113, 7, 0.4, 9, 0, 6, 0.1, 175, '["dairy","fat","protein"]'),
  (TRUE, NULL, 'Bread, Whole Wheat', NULL, 28, '1 slice', 80, 4, 14, 1, 2, 0.2, 1.5, 130, '["carbs","grain","fiber"]')
ON CONFLICT (LOWER(name), COALESCE(brand, '')) WHERE is_global = TRUE DO NOTHING;
