-- Create workout_sessions table
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_date date not null default current_date,
  body_parts text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Create workout_log table (matches docs/project.md schema)
create table if not exists public.workout_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise text not null,
  set_number numeric(4,1) not null default 1,  -- float for drop-sets (2.1, 2.2)
  weight_lbs numeric(6,1),                      -- nullable for bodyweight moves
  reps text not null,                           -- text to support "15 min" for cardio
  notes text not null default '',               -- SS, DROP, HR, cardio, etc.
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index idx_workout_log_session on public.workout_log (session_id);
create index idx_workout_sessions_date on public.workout_sessions (workout_date desc);

-- Row-level security (prep for auth — disabled until auth is added)
alter table public.workout_sessions enable row level security;
alter table public.workout_log enable row level security;

-- Permissive policies for dev (no auth yet — allows all access)
-- Replace these with user-scoped policies once auth is integrated.
create policy "Allow all access to workout_sessions"
  on public.workout_sessions for all
  using (true)
  with check (true);

create policy "Allow all access to workout_log"
  on public.workout_log for all
  using (true)
  with check (true);
