-- RPC functions mirroring backend data-centric endpoints for workouts.

-- Upsert a workout session.
create or replace function public.save_workout(
  p_id text,
  p_date_iso text,
  p_part text,
  p_created_at bigint,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workouts (id, "dateISO", part, "createdAt", rows_json)
  values (p_id, p_date_iso, p_part, p_created_at, p_rows::text)
  on conflict (id) do update
    set "dateISO" = excluded."dateISO",
        part = excluded.part,
        "createdAt" = excluded."createdAt",
        rows_json = excluded.rows_json;
end;
$$;

-- List workout sessions (newest first).
create or replace function public.list_workouts()
returns setof public.workouts
language sql
security definer
set search_path = public
as $$
  select * from public.workouts order by "createdAt" desc;
$$;

-- Delete a workout session by id.
create or replace function public.delete_workout(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workouts where id = p_id;
end;
$$;
