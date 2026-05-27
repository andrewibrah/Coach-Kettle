-- ============================================================
-- Migration 0035: Workout programming engine
-- Personalized multi-week programs with periodization, week-to-week
-- adaptation, and per-day exercise prescriptions (sets x reps x %).
-- ============================================================

-- 1. PROGRAMS (top-level container, one active per user)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_programs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    goal_type       TEXT NOT NULL CHECK (goal_type IN ('muscle_building','leaning_out','weight_loss','maintenance','strength','endurance')),
    split_type      TEXT NOT NULL CHECK (split_type IN ('ppl_3day','pp_sh_l_5day','pp_sh_l_6day','upper_lower','full_body','custom')),
    days_per_week   SMALLINT NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    weeks_total     SMALLINT NOT NULL CHECK (weeks_total BETWEEN 1 AND 24),
    current_week    SMALLINT NOT NULL DEFAULT 1 CHECK (current_week >= 1),
    periodization   TEXT NOT NULL DEFAULT 'linear' CHECK (periodization IN ('linear','undulating','block','none')),
    deload_every    SMALLINT CHECK (deload_every IS NULL OR deload_every BETWEEN 3 AND 8),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived','completed')),
    inputs_snapshot JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.workout_programs IS 'Multi-week personalized programs. Only one row per user may be status=active at a time.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_programs_one_active
    ON public.workout_programs (user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_workout_programs_user ON public.workout_programs (user_id, status);

ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_programs FROM anon, authenticated;
GRANT SELECT ON public.workout_programs TO authenticated;

CREATE POLICY workout_programs_select_own ON public.workout_programs
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_workout_programs_updated_at
    BEFORE UPDATE ON public.workout_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. PROGRAM WEEKS (with deload flag + intensity multiplier)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_weeks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_number         SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 24),
    is_deload           BOOLEAN NOT NULL DEFAULT FALSE,
    intensity_pct       NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (intensity_pct BETWEEN 0.5 AND 1.3),
    volume_pct          NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (volume_pct BETWEEN 0.5 AND 1.5),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(program_id, week_number)
);

COMMENT ON TABLE public.program_weeks IS 'One row per week of the program. intensity_pct and volume_pct drive periodization.';

CREATE INDEX IF NOT EXISTS idx_program_weeks_program ON public.program_weeks (program_id, week_number);
CREATE INDEX IF NOT EXISTS idx_program_weeks_user ON public.program_weeks (user_id);

ALTER TABLE public.program_weeks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_weeks FROM anon, authenticated;
GRANT SELECT ON public.program_weeks TO authenticated;

CREATE POLICY program_weeks_select_own ON public.program_weeks
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 3. PROGRAM DAYS (per week)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_days (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id         UUID NOT NULL REFERENCES public.program_weeks(id) ON DELETE CASCADE,
    program_id      UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_index       SMALLINT NOT NULL CHECK (day_index BETWEEN 1 AND 7),
    body_part       TEXT NOT NULL,
    title           TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(week_id, day_index)
);

COMMENT ON TABLE public.program_days IS 'Day slots within a week. day_index 1..N where N = program.days_per_week.';

CREATE INDEX IF NOT EXISTS idx_program_days_week ON public.program_days (week_id, day_index);
CREATE INDEX IF NOT EXISTS idx_program_days_user ON public.program_days (user_id);

ALTER TABLE public.program_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_days FROM anon, authenticated;
GRANT SELECT ON public.program_days TO authenticated;

CREATE POLICY program_days_select_own ON public.program_days
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 4. PROGRAM EXERCISES (per day)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_exercises (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id              UUID NOT NULL REFERENCES public.program_days(id) ON DELETE CASCADE,
    program_id          UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_slug       TEXT,
    exercise_name       TEXT NOT NULL,
    target_sets         SMALLINT NOT NULL CHECK (target_sets BETWEEN 1 AND 20),
    target_reps_low     SMALLINT CHECK (target_reps_low IS NULL OR target_reps_low BETWEEN 1 AND 60),
    target_reps_high    SMALLINT CHECK (target_reps_high IS NULL OR target_reps_high BETWEEN 1 AND 60),
    target_pct_e1rm     NUMERIC(4,2) CHECK (target_pct_e1rm IS NULL OR target_pct_e1rm BETWEEN 0.30 AND 1.20),
    target_weight_lbs   NUMERIC(7,2),
    rest_seconds        SMALLINT CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 30 AND 600),
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_exercises IS 'Prescribed exercise for a given program day. Reps as low..high range.';

CREATE INDEX IF NOT EXISTS idx_program_exercises_day ON public.program_exercises (day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_program_exercises_user ON public.program_exercises (user_id);

ALTER TABLE public.program_exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_exercises FROM anon, authenticated;
GRANT SELECT ON public.program_exercises TO authenticated;

CREATE POLICY program_exercises_select_own ON public.program_exercises
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 5. PROGRAM TEMPLATE DEFINITIONS (catalog of starter programs)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT,
    split_type      TEXT NOT NULL,
    days_per_week   SMALLINT NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    goal_types      JSONB NOT NULL DEFAULT '[]'::jsonb,
    structure       JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.program_templates IS 'Catalog of starter program templates (PPL, P/P/SH/L, etc.).';

ALTER TABLE public.program_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_templates FROM anon, authenticated;
GRANT SELECT ON public.program_templates TO authenticated;

CREATE POLICY program_templates_read_all ON public.program_templates
    FOR SELECT TO authenticated USING (TRUE);

-- Seed program templates (3-day PPL + 5-day + 6-day Push/Pull/Shoulders/Legs)
INSERT INTO public.program_templates (slug, name, description, split_type, days_per_week, goal_types, structure)
VALUES
  ('ppl-3day',
   '3-Day Push/Pull/Legs',
   'Classic PPL run once per week. Best for beginners or busy schedules. Each muscle hit once weekly with high intensity.',
   'ppl_3day', 3, '["muscle_building","strength","maintenance"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Push", "title": "Push",
        "exercises": [
          {"slug":"barbell-bench-press","sets":4,"reps":[6,8],"rest":150},
          {"slug":"overhead-press","sets":3,"reps":[6,10],"rest":120},
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":90},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60},
          {"slug":"tricep-pushdown","sets":3,"reps":[10,15],"rest":60}
        ]},
       {"day": 2, "body_part": "Pull", "title": "Pull",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"pullup","sets":3,"reps":[6,10],"rest":120},
          {"slug":"barbell-row","sets":3,"reps":[6,10],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"barbell-curl","sets":3,"reps":[8,12],"rest":60}
        ]},
       {"day": 3, "body_part": "Legs", "title": "Legs",
        "exercises": [
          {"slug":"back-squat","sets":4,"reps":[5,8],"rest":180},
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":120},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"hip-thrust","sets":3,"reps":[8,12],"rest":120},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]}
     ]
   }'::jsonb),

  ('pp-sh-l-5day',
   '5-Day Push/Pull/Shoulders/Legs',
   '5-day split with dedicated shoulder day. Push, Pull, Shoulders, Legs, plus an arms day.',
   'pp_sh_l_5day', 5, '["muscle_building","leaning_out"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Push", "title": "Chest + Triceps",
        "exercises": [
          {"slug":"barbell-bench-press","sets":4,"reps":[6,8],"rest":150},
          {"slug":"incline-dumbbell-press","sets":4,"reps":[8,10],"rest":120},
          {"slug":"tricep-pushdown","sets":4,"reps":[10,12],"rest":60}
        ]},
       {"day": 2, "body_part": "Pull", "title": "Back + Biceps",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"barbell-row","sets":4,"reps":[6,10],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"barbell-curl","sets":4,"reps":[8,12],"rest":60}
        ]},
       {"day": 3, "body_part": "Shoulders", "title": "Shoulders",
        "exercises": [
          {"slug":"overhead-press","sets":4,"reps":[6,8],"rest":150},
          {"slug":"lateral-raise","sets":4,"reps":[12,15],"rest":60},
          {"slug":"barbell-row","sets":3,"reps":[8,12],"rest":90}
        ]},
       {"day": 4, "body_part": "Legs", "title": "Legs",
        "exercises": [
          {"slug":"back-squat","sets":4,"reps":[5,8],"rest":180},
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":120},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"hip-thrust","sets":3,"reps":[8,12],"rest":120}
        ]},
       {"day": 5, "body_part": "Abs", "title": "Conditioning + Core",
        "exercises": [
          {"slug":"plank","sets":4,"reps":[30,60],"rest":45},
          {"slug":"rowing-erg","sets":1,"reps":[20,30],"rest":60}
        ]}
     ]
   }'::jsonb),

  ('pp-sh-l-6day',
   '6-Day Push/Pull/Shoulders/Legs',
   'High-volume 6-day split. Each major group twice weekly. Best for intermediate–advanced lifters with recovery dialed in.',
   'pp_sh_l_6day', 6, '["muscle_building","strength"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Push", "title": "Push (Heavy)",
        "exercises": [
          {"slug":"barbell-bench-press","sets":4,"reps":[4,6],"rest":180},
          {"slug":"overhead-press","sets":4,"reps":[5,8],"rest":150},
          {"slug":"tricep-pushdown","sets":3,"reps":[8,10],"rest":60}
        ]},
       {"day": 2, "body_part": "Pull", "title": "Pull (Heavy)",
        "exercises": [
          {"slug":"deadlift","sets":4,"reps":[3,5],"rest":210},
          {"slug":"pullup","sets":4,"reps":[6,10],"rest":120},
          {"slug":"barbell-curl","sets":3,"reps":[8,10],"rest":60}
        ]},
       {"day": 3, "body_part": "Shoulders", "title": "Shoulders + Arms",
        "exercises": [
          {"slug":"overhead-press","sets":4,"reps":[6,8],"rest":120},
          {"slug":"lateral-raise","sets":4,"reps":[12,15],"rest":60},
          {"slug":"barbell-curl","sets":3,"reps":[10,12],"rest":60},
          {"slug":"tricep-pushdown","sets":3,"reps":[10,12],"rest":60}
        ]},
       {"day": 4, "body_part": "Legs", "title": "Legs (Heavy)",
        "exercises": [
          {"slug":"back-squat","sets":4,"reps":[4,6],"rest":210},
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":120},
          {"slug":"leg-press","sets":3,"reps":[8,12],"rest":120}
        ]},
       {"day": 5, "body_part": "Push", "title": "Push (Volume)",
        "exercises": [
          {"slug":"incline-dumbbell-press","sets":4,"reps":[8,12],"rest":90},
          {"slug":"lateral-raise","sets":4,"reps":[12,15],"rest":60},
          {"slug":"tricep-pushdown","sets":4,"reps":[12,15],"rest":60}
        ]},
       {"day": 6, "body_part": "Pull", "title": "Pull (Volume) + Legs Light",
        "exercises": [
          {"slug":"lat-pulldown","sets":4,"reps":[10,12],"rest":90},
          {"slug":"barbell-row","sets":3,"reps":[8,12],"rest":90},
          {"slug":"hip-thrust","sets":3,"reps":[10,15],"rest":90},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":45}
        ]}
     ]
   }'::jsonb)
ON CONFLICT (slug) DO NOTHING;
