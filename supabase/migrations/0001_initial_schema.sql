-- Initial schema derived from backend/workouts.db (SQLite)

-- No extensions required by current schema; add here if future tables need them.

create table if not exists public.workouts (
    id text primary key,
    "dateISO" text,
    part text,
    "createdAt" bigint,
    rows_json text
);

create table if not exists public.workout_log (
    id bigserial primary key,
    workout_id text not null,
    workout_date text not null,
    exercise text not null,
    set_number double precision not null,
    weight_lbs text,
    reps text,
    notes text,
    created_at text not null
);

create index if not exists idx_workout_log_workout_id on public.workout_log (workout_id);
create index if not exists idx_workout_log_workout_date on public.workout_log (workout_date);
