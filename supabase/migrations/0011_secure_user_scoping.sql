-- Add per-user ownership and secure chat history storage

-- Ensure UUID generation is available for chat_history IDs
create extension if not exists "pgcrypto";

-- Add user ownership to workouts
alter table if exists public.workouts
    add column if not exists user_id uuid references auth.users(id);

alter table if exists public.workout_log
    add column if not exists user_id uuid references auth.users(id);

-- Indexes to support per-user queries
create index if not exists idx_workouts_user_id_created_at on public.workouts (user_id, "createdAt" desc);
create index if not exists idx_workout_log_user_id_created_at on public.workout_log (user_id, created_at desc);

-- Create chat_history table
create table if not exists public.chat_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    source text not null check (source in ('workout_chat', 'coach_modal')),
    created_at timestamptz not null default now()
);

-- RLS for workouts
alter table if exists public.workouts enable row level security;
drop policy if exists workouts_deny_all on public.workouts;
drop policy if exists workouts_select_own on public.workouts;
drop policy if exists workouts_insert_own on public.workouts;
drop policy if exists workouts_update_own on public.workouts;
drop policy if exists workouts_delete_own on public.workouts;
create policy workouts_select_own on public.workouts
    for select
    using (auth.uid() = user_id);
create policy workouts_insert_own on public.workouts
    for insert
    with check (auth.uid() = user_id);
create policy workouts_update_own on public.workouts
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy workouts_delete_own on public.workouts
    for delete
    using (auth.uid() = user_id);

-- RLS for workout_log
alter table if exists public.workout_log enable row level security;
drop policy if exists workout_log_deny_all on public.workout_log;
drop policy if exists workout_log_select_own on public.workout_log;
drop policy if exists workout_log_insert_own on public.workout_log;
drop policy if exists workout_log_update_own on public.workout_log;
drop policy if exists workout_log_delete_own on public.workout_log;
create policy workout_log_select_own on public.workout_log
    for select
    using (auth.uid() = user_id);
create policy workout_log_insert_own on public.workout_log
    for insert
    with check (auth.uid() = user_id);
create policy workout_log_update_own on public.workout_log
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy workout_log_delete_own on public.workout_log
    for delete
    using (auth.uid() = user_id);

-- RLS for chat_history
alter table if exists public.chat_history enable row level security;
drop policy if exists chat_history_select_own on public.chat_history;
drop policy if exists chat_history_insert_own on public.chat_history;
drop policy if exists chat_history_update_own on public.chat_history;
drop policy if exists chat_history_delete_own on public.chat_history;
create policy chat_history_select_own on public.chat_history
    for select
    using (auth.uid() = user_id);
create policy chat_history_insert_own on public.chat_history
    for insert
    with check (auth.uid() = user_id);
create policy chat_history_update_own on public.chat_history
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy chat_history_delete_own on public.chat_history
    for delete
    using (auth.uid() = user_id);
