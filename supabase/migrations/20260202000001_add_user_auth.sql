-- Prep migration: add user_id column for when Supabase Auth is enabled.
-- Run this AFTER enabling authentication in the Supabase dashboard.

-- Uncomment the lines below when ready:

-- alter table public.workout_sessions add column user_id uuid not null references auth.users(id);
-- create index idx_workout_sessions_user on public.workout_sessions (user_id);

-- drop policy "Allow all access to workout_sessions" on public.workout_sessions;
-- create policy "Users can manage own sessions"
--   on public.workout_sessions for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);

-- drop policy "Allow all access to workout_log" on public.workout_log;
-- create policy "Users can manage own logs"
--   on public.workout_log for all
--   using (session_id in (select id from public.workout_sessions where user_id = auth.uid()))
--   with check (session_id in (select id from public.workout_sessions where user_id = auth.uid()));
