-- READ-ONLY pre-check to run against PRODUCTION before `supabase db push` of the
-- in-session reliability migrations (20261008000100 … 20261008000500) and the auto-rest
-- migration 20261013000100. It changes nothing.
--   psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prod_precheck_p4.sql
-- Every row should say ok = true. Any false row blocks the push until resolved. It checks the
-- known schema dependencies; it is not a full proof that the push succeeds (Edge/runtime tables
-- such as event_logs are not covered).
-- Why: the repo chain cannot be replayed from scratch (20260113205331_remote_schema fails on
-- a fresh database), so the only truth about production's schema is production itself.
BEGIN TRANSACTION READ ONLY;
WITH
cols(tbl, col) AS (VALUES
  ('workouts','id'), ('workouts','user_id'), ('workouts','dateISO'), ('workouts','part'),
  ('workouts','createdAt'), ('workouts','rows_json'), ('workouts','review_json'), ('workouts','reflection'),
  ('workout_log','user_id'), ('workout_log','workout_id'), ('workout_log','workout_date'),
  ('workout_log','exercise'), ('workout_log','set_number'), ('workout_log','weight_lbs'),
  ('workout_log','id'), ('workout_log','reps'), ('workout_log','notes'), ('workout_log','created_at'),
  ('workout_log','is_cardio'),
  ('workout_log','duration_mins'), ('workout_log','distance'), ('workout_log','distance_unit'),
  ('workout_log','heart_rate'), ('workout_log','calories'), ('workout_log','level'),
  ('notification_preferences','user_id'), ('notification_preferences','auto_start_rest_timer')),
checks(check_name, ok, detail) AS (
  SELECT 'column public.' || c.tbl || '.' || c.col,
         EXISTS (SELECT 1 FROM information_schema.columns i
                 WHERE i.table_schema = 'public' AND i.table_name = c.tbl AND i.column_name = c.col),
         'pre-existing column 0100/0200/0300 rely on (performance/set_kind are added by 0100)'
  FROM cols c
  UNION ALL
  SELECT 'table ' || t, to_regclass(t) IS NOT NULL, 'required dependency'
  FROM unnest(ARRAY['auth.users','public.pr_lifts','public.pr_tracked_lifts','public.pr_history']) t
  UNION ALL
  SELECT 'function ' || f, to_regprocedure(f) IS NOT NULL, '0300 references or revokes it'
  FROM unnest(ARRAY['public.reconcile_workout_prs(uuid,text)',
                    'public.save_workout(text,text,text,bigint,jsonb)',
                    'public.delete_workout(text)']) f
  UNION ALL
  SELECT 'not yet created: ' || t, to_regclass(t) IS NULL, 'must not exist before 0300'
  FROM unnest(ARRAY['public.workout_operation_sessions','public.workout_operation_rows',
                    'public.workout_operation_receipts']) t
  UNION ALL
  SELECT 'workout_log has no p4_session_id yet',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'workout_log' AND column_name = 'p4_session_id'),
         'added by 0300'
  UNION ALL
  -- CREATE OR REPLACE cannot change an existing function's result type: the push would fail.
  SELECT 'result type unchanged: ' || r.sig,
         to_regprocedure(r.sig) IS NULL OR pg_get_function_result(to_regprocedure(r.sig)) = r.result,
         'existing result: ' || coalesce(pg_get_function_result(to_regprocedure(r.sig)), 'absent')
  FROM (VALUES
    ('public.reconcile_workout_prs(uuid,text)', 'void'),
    ('public.delete_user_data(uuid)', 'jsonb'),
    ('public.update_pr_from_workout_log()', 'trigger'),
    ('public.suggest_next_set(uuid,text)', 'TABLE(last_workout_date text, last_top_weight_lbs numeric, last_top_reps numeric, last_top_e1rm numeric, suggested_weight_lbs numeric, suggested_reps_low integer, suggested_reps_high integer, strategy text, rationale text)')
  ) r(sig, result)
  UNION ALL
  -- 0300 changes workout_log.set_number to bigint; any other view depending on it blocks that.
  SELECT 'no unexpected view depends on workout_log.set_number',
         NOT EXISTS (
           SELECT 1 FROM pg_depend d
           JOIN pg_rewrite rw ON rw.oid = d.objid
           JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
           WHERE d.refobjid = to_regclass('public.workout_log') AND a.attname = 'set_number'
             AND rw.ev_class <> coalesce(to_regclass('public.i3_workout_numeric_quarantine'), 0)),
         'only i3_workout_numeric_quarantine (recreated by 0300) may depend on it'
  UNION ALL
  SELECT 'pg_cron available and preloaded', EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
         AND current_setting('shared_preload_libraries', true) LIKE '%pg_cron%',
         'needed to schedule the 24h auto-close (0500); without it the job is not scheduled'
  UNION ALL
  SELECT 'notification_preferences has no auto_rest_duration_sec yet',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'notification_preferences'
                       AND column_name = 'auto_rest_duration_sec'),
         '20261013000100 adds it (nullable, no default)'
  UNION ALL
  SELECT 'migration history table present', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
         'db push compares local files against it'
)
SELECT check_name, ok, detail FROM checks ORDER BY ok, check_name;

-- Which reliability versions production already has (expect none of 20261008000100..0500).
-- Guarded so a missing history table is reported above instead of aborting the script.
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_history \gset
\if :has_history
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version >= '20260113205331' ORDER BY version;
\endif
ROLLBACK;
