-- Parity checks for core tables. Run against source and target and compare results.

-- Row counts
select 'workouts' as table, count(*) as row_count from public.workouts;
select 'workout_log' as table, count(*) as row_count from public.workout_log;
select 'event_logs' as table, count(*) as row_count from public.event_logs;

-- Checksums (simple hashes of key fields)
select 'workouts' as table, md5(string_agg(id || '|' || coalesce("dateISO",'') || '|' || coalesce(part,'') || '|' || coalesce("createdAt"::text,'') || '|' || coalesce(rows_json,''), '||')) as checksum
from public.workouts;

select 'workout_log' as table, md5(string_agg(coalesce(workout_id,'') || '|' || coalesce(workout_date,'') || '|' || coalesce(exercise,'') || '|' || coalesce(set_number::text,'') || '|' || coalesce(weight_lbs,'') || '|' || coalesce(reps,'') || '|' || coalesce(notes,'') || '|' || coalesce(created_at,''), '||')) as checksum
from public.workout_log;

select 'event_logs' as table, md5(string_agg(coalesce(source,'') || '|' || coalesce(level,'') || '|' || coalesce(message,'') || '|' || coalesce(created_at::text,''), '||')) as checksum
from public.event_logs;

-- FK integrity (logical; no FK declared). Flag any workout_log rows without matching workouts.
select count(*) as workout_log_orphans
from public.workout_log wl
left join public.workouts w on w.id = wl.workout_id
where w.id is null;

-- RLS policy presence (ensure RLS is enabled)
select relname, relrowsecurity
from pg_class
where relname in ('workouts', 'workout_log', 'event_logs');
