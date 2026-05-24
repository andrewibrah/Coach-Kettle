-- ============================================================
-- Migration 0041: refresh_ai_context v2
-- Adds Phase-1 profile expansion fields to the compact AI context.
-- ============================================================

DROP FUNCTION IF EXISTS public.refresh_ai_context(UUID);

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
        'sex', p.sex,
        'current_weight', CASE WHEN p.current_weight IS NOT NULL THEN
            jsonb_build_object('value', p.current_weight, 'unit', p.weight_unit)
        ELSE NULL END,
        'goal_weight', CASE WHEN p.goal_weight IS NOT NULL THEN
            jsonb_build_object('value', p.goal_weight, 'unit', p.weight_unit)
        ELSE NULL END,
        'measurement_system', p.measurement_system,
        'focus', jsonb_build_object('type', p.focus, 'other', p.focus_other),
        'goal_type', p.goal_type,
        'activity_level', p.activity_level,
        'nutrition', jsonb_build_object(
            'dietary_preferences', COALESCE(p.dietary_preferences, '[]'::jsonb),
            'dietary_allergies', COALESCE(p.dietary_allergies, '[]'::jsonb),
            'disliked_foods', COALESCE(p.disliked_foods, '[]'::jsonb),
            'preferred_cuisines', COALESCE(p.preferred_cuisines, '[]'::jsonb),
            'calorie_target_override', p.calorie_target_override,
            'protein_g_per_lb', p.protein_g_per_lb
        ),
        'training', jsonb_build_object(
            'available_equipment', COALESCE(p.available_equipment, '[]'::jsonb),
            'training_days_per_week', p.training_days_per_week,
            'session_minutes_target', p.session_minutes_target
        ),
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

GRANT EXECUTE ON FUNCTION public.refresh_ai_context(UUID) TO authenticated;
