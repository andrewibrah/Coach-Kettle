-- ============================================================
-- Migration 0038: Default profile workout templates (seed RPC)
-- Provides three goal-based starter packs the app can apply to a
-- user's `workout_templates` + `workout_template_items` tables.
-- Idempotent — safe to call repeatedly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_default_templates_for_user(
    p_user_id  UUID,
    p_goal     TEXT DEFAULT 'muscle_building'  -- one of: muscle_building|leaning_out|weight_loss
)
RETURNS TABLE(
    template_id   UUID,
    template_name TEXT,
    items_inserted INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_goal             TEXT;
    v_template_id      UUID;
    v_template_name    TEXT;
    v_items_inserted   INTEGER;
    v_existing_count   INTEGER;
    v_template_records JSONB;
    v_template_record  JSONB;
    v_item             JSONB;
    v_order            INTEGER;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    v_goal := LOWER(COALESCE(p_goal, 'muscle_building'));
    IF v_goal NOT IN ('muscle_building','leaning_out','weight_loss') THEN
        v_goal := 'muscle_building';
    END IF;

    -- Skip if user already has any templates — be non-destructive
    SELECT COUNT(*) INTO v_existing_count
    FROM public.workout_templates
    WHERE user_id = p_user_id;

    IF v_existing_count > 0 THEN
        RETURN; -- empty result set
    END IF;

    -- Catalog of starter templates per goal. Each item:
    --   { name, description, items: [{ lift_name, sets, reps, weight? }] }
    v_template_records :=
        CASE v_goal
        WHEN 'muscle_building' THEN '[
          {"name":"Push (Chest/Shoulders/Tris)","description":"Hypertrophy push day. Bench-focused.",
           "items":[
             {"lift_name":"Barbell Bench Press","sets":4,"reps":8},
             {"lift_name":"Overhead Press","sets":3,"reps":8},
             {"lift_name":"Incline Dumbbell Press","sets":3,"reps":10},
             {"lift_name":"Dumbbell Lateral Raise","sets":3,"reps":12},
             {"lift_name":"Triceps Pushdown","sets":3,"reps":12}
           ]},
          {"name":"Pull (Back/Bis)","description":"Hypertrophy pull day. Row + chin focus.",
           "items":[
             {"lift_name":"Conventional Deadlift","sets":3,"reps":5},
             {"lift_name":"Pull-Up","sets":3,"reps":8},
             {"lift_name":"Barbell Row","sets":3,"reps":8},
             {"lift_name":"Lat Pulldown","sets":3,"reps":12},
             {"lift_name":"Barbell Curl","sets":3,"reps":10}
           ]},
          {"name":"Legs","description":"Hypertrophy leg day. Squat + RDL focus.",
           "items":[
             {"lift_name":"Back Squat","sets":4,"reps":6},
             {"lift_name":"Romanian Deadlift","sets":3,"reps":10},
             {"lift_name":"Leg Press","sets":3,"reps":12},
             {"lift_name":"Barbell Hip Thrust","sets":3,"reps":10},
             {"lift_name":"Plank","sets":3,"reps":45}
           ]}
        ]'::jsonb
        WHEN 'leaning_out' THEN '[
          {"name":"Push + Conditioning","description":"Lean-out push: moderate weights, tight rest.",
           "items":[
             {"lift_name":"Barbell Bench Press","sets":4,"reps":10},
             {"lift_name":"Overhead Press","sets":3,"reps":10},
             {"lift_name":"Incline Dumbbell Press","sets":3,"reps":12},
             {"lift_name":"Triceps Pushdown","sets":3,"reps":15},
             {"lift_name":"Treadmill Run","sets":1,"reps":20}
           ]},
          {"name":"Pull + Conditioning","description":"Lean-out pull: density work + cardio finisher.",
           "items":[
             {"lift_name":"Barbell Row","sets":4,"reps":10},
             {"lift_name":"Lat Pulldown","sets":3,"reps":12},
             {"lift_name":"Pull-Up","sets":3,"reps":8},
             {"lift_name":"Barbell Curl","sets":3,"reps":12},
             {"lift_name":"Rowing Erg","sets":1,"reps":20}
           ]},
          {"name":"Legs + Conditioning","description":"Quad/glute volume + steady-state cardio.",
           "items":[
             {"lift_name":"Back Squat","sets":4,"reps":8},
             {"lift_name":"Romanian Deadlift","sets":3,"reps":10},
             {"lift_name":"Leg Press","sets":3,"reps":15},
             {"lift_name":"Plank","sets":3,"reps":60},
             {"lift_name":"Treadmill Run","sets":1,"reps":25}
           ]}
        ]'::jsonb
        ELSE '[
          {"name":"Full Body A","description":"Weight-loss full-body strength + finisher.",
           "items":[
             {"lift_name":"Back Squat","sets":3,"reps":10},
             {"lift_name":"Barbell Bench Press","sets":3,"reps":10},
             {"lift_name":"Barbell Row","sets":3,"reps":10},
             {"lift_name":"Plank","sets":3,"reps":45},
             {"lift_name":"Treadmill Run","sets":1,"reps":25}
           ]},
          {"name":"Full Body B","description":"Weight-loss full-body with cardio.",
           "items":[
             {"lift_name":"Romanian Deadlift","sets":3,"reps":10},
             {"lift_name":"Overhead Press","sets":3,"reps":10},
             {"lift_name":"Lat Pulldown","sets":3,"reps":12},
             {"lift_name":"Barbell Hip Thrust","sets":3,"reps":12},
             {"lift_name":"Rowing Erg","sets":1,"reps":20}
           ]},
          {"name":"Cardio + Core","description":"Steady-state + core day.",
           "items":[
             {"lift_name":"Treadmill Run","sets":1,"reps":35},
             {"lift_name":"Plank","sets":4,"reps":45}
           ]}
        ]'::jsonb
        END;

    FOR v_template_record IN SELECT * FROM jsonb_array_elements(v_template_records)
    LOOP
        v_template_name := v_template_record->>'name';

        INSERT INTO public.workout_templates (user_id, name, description, display_order, is_active)
        VALUES (
            p_user_id,
            v_template_name,
            v_template_record->>'description',
            COALESCE((SELECT MAX(display_order) FROM public.workout_templates WHERE user_id = p_user_id), 0) + 1,
            TRUE
        )
        RETURNING id INTO v_template_id;

        v_items_inserted := 0;
        v_order := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_template_record->'items')
        LOOP
            v_order := v_order + 1;
            INSERT INTO public.workout_template_items
                (template_id, user_id, lift_name, target_sets, target_reps, target_weight, display_order)
            VALUES (
                v_template_id,
                p_user_id,
                v_item->>'lift_name',
                (v_item->>'sets')::INTEGER,
                (v_item->>'reps')::INTEGER,
                NULLIF(v_item->>'weight','')::NUMERIC,
                v_order
            );
            v_items_inserted := v_items_inserted + 1;
        END LOOP;

        template_id := v_template_id;
        template_name := v_template_name;
        items_inserted := v_items_inserted;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_templates_for_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_templates_for_user(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.seed_default_templates_for_user(UUID, TEXT) IS
    'One-shot seed of goal-based default workout templates for a user. No-op if user already has templates.';
