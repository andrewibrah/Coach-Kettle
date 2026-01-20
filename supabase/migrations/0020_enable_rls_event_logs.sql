-- Enable RLS on event_logs with secure policies
-- event_logs is an audit/observability table that stores sensitive operational data

-- Step 1: Enable RLS
ALTER TABLE IF EXISTS public.event_logs ENABLE ROW LEVEL SECURITY;

-- Step 2: Revoke broad privileges from anon/authenticated
REVOKE ALL ON public.event_logs FROM anon, authenticated;

-- Step 3: Create default deny-all policy to lock down access
DROP POLICY IF EXISTS event_logs_select_own ON public.event_logs;
DROP POLICY IF EXISTS event_logs_deny_all ON public.event_logs;
CREATE POLICY event_logs_deny_all ON public.event_logs 
    FOR ALL 
    TO PUBLIC 
    USING (false) 
    WITH CHECK (false);

-- Step 4: Allow users to SELECT only their own event logs (if user_id matches)
DROP POLICY IF EXISTS event_logs_user_select ON public.event_logs;
CREATE POLICY event_logs_user_select ON public.event_logs 
    FOR SELECT 
    TO authenticated 
    USING ((SELECT auth.uid()) = user_id);

-- Step 5: Allow authenticated users to INSERT logs for themselves only
DROP POLICY IF EXISTS event_logs_user_insert ON public.event_logs;
CREATE POLICY event_logs_user_insert ON public.event_logs 
    FOR INSERT 
    TO authenticated 
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Step 6: Re-grant minimal required privileges
GRANT SELECT, INSERT ON public.event_logs TO authenticated;

-- Step 7: Add index on user_id for policy performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id ON public.event_logs (user_id);
