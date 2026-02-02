-- Enhance workout_log for PR Tracking
-- Migration to enable real-time PR detection by adding user scoping and RLS
-- Also removes the deny_all policy from the remote schema migration

-------------------------------------------------------------------------------
-- REMOVE BLOCKING POLICY
-------------------------------------------------------------------------------

-- The remote schema migration added a deny_all policy that blocks all access.
-- We must drop it before any other operations.
DROP POLICY IF EXISTS workout_log_deny_all ON public.workout_log;

-------------------------------------------------------------------------------
-- ALTER TABLE: Add user_id for RLS and PR detection
-------------------------------------------------------------------------------

-- Add user_id column to enable user scoping and PR detection trigger filtering
ALTER TABLE public.workout_log
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for performance on user queries
CREATE INDEX IF NOT EXISTS idx_workout_log_user_id ON public.workout_log(user_id);

-------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-------------------------------------------------------------------------------

-- Enable RLS on workout_log table
ALTER TABLE public.workout_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (clean slate)
DROP POLICY IF EXISTS workout_log_select_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_insert_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_update_own ON public.workout_log;
DROP POLICY IF EXISTS workout_log_delete_own ON public.workout_log;

-- Create RLS policies for user isolation
CREATE POLICY workout_log_select_own ON public.workout_log
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_insert_own ON public.workout_log
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_update_own ON public.workout_log
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY workout_log_delete_own ON public.workout_log
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-------------------------------------------------------------------------------
-- GRANT PERMISSIONS
-------------------------------------------------------------------------------

-- Grant authenticated users access to workout_log
GRANT ALL ON public.workout_log TO authenticated;

-- Also remove the deny_all policy on workouts table if it exists
DROP POLICY IF EXISTS workouts_deny_all ON public.workouts;

-------------------------------------------------------------------------------
-- ENABLE REALTIME on pr_history for client subscriptions
-------------------------------------------------------------------------------

-- Add pr_history to the Supabase Realtime publication so clients can
-- subscribe to INSERT events (used for PR celebration notifications).
ALTER PUBLICATION supabase_realtime ADD TABLE public.pr_history;
