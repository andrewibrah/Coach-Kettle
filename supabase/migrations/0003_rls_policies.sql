-- RLS policies scaffolded from current repo state.
-- No access rules or user identifiers exist in the backend; policies are set to deny by default.

-- workouts
alter table if exists public.workouts enable row level security;

-- Deny all access until explicit rules are defined.
drop policy if exists workouts_deny_all on public.workouts;
create policy workouts_deny_all on public.workouts
for all
using (false)
with check (false);

-- workout_log
alter table if exists public.workout_log enable row level security;

-- Deny all access until explicit rules are defined.
drop policy if exists workout_log_deny_all on public.workout_log;
create policy workout_log_deny_all on public.workout_log
for all
using (false)
with check (false);
