-- Optimize RLS policies to avoid per-row function re-evaluation
-- This migration drops existing policies that use auth.uid() directly and recreates them using a sub‑select.

-- Workouts table
DROP POLICY IF EXISTS workouts_select_own ON public.workouts;
DROP POLICY IF EXISTS workouts_insert_own ON public.workouts;
DROP POLICY IF EXISTS workouts_update_own ON public.workouts;
DROP POLICY IF EXISTS workouts_delete_own ON public.workouts;

CREATE POLICY workouts_select_own ON public.workouts
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY workouts_insert_own ON public.workouts
    FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workouts_update_own ON public.workouts
    FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workouts_delete_own ON public.workouts
    FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Workout_log table
DROP POLICY IF EXISTS workout_log_select_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_insert_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_update_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_delete_own ON public.workout_log;

CREATE POLICY workout_log_select_own ON public.workout_log
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_insert_own ON public.workout_log
    FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_update_own ON public.workout_log
    FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_delete_own ON public.workout_log
    FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Chat_history table
DROP POLICY IF EXISTS chat_history_select_own ON public.chat_history;
DROP POLICY IF EXISTS chat_history_insert_own ON public.chat_history;
DROP POLICY IF EXISTS chat_history_update_own ON public.chat_history;
DROP POLICY IF EXISTS chat_history_delete_own ON public.chat_history;

CREATE POLICY chat_history_select_own ON public.chat_history
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY chat_history_insert_own ON public.chat_history
    FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY chat_history_update_own ON public.chat_history
    FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY chat_history_delete_own ON public.chat_history
    FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- User_terms_acceptance table
DROP POLICY IF EXISTS user_terms_acceptance_select_own ON public.user_terms_acceptance;
DROP POLICY IF EXISTS user_terms_acceptance_insert_own ON public.user_terms_acceptance;

CREATE POLICY user_terms_acceptance_select_own ON public.user_terms_acceptance
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_terms_acceptance_insert_own ON public.user_terms_acceptance
    FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);
