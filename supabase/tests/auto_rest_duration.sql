-- auto_rest_duration_sec fixture. Runs entirely inside BEGIN ... ROLLBACK.
-- Two modes, chosen automatically:
--   * empty disposable DB: creates a minimal notification_preferences table;
--   * existing local stack: reuses the real table (uuid FK to auth.users) and
--     inserts throwaway auth.users rows.
-- The migration is applied only when the column is absent, so the fixture is
-- also re-runnable after `supabase db push`. In that mode the fixture rows are
-- inserted after the column exists, so the "existing rows are NULL" check only
-- re-proves the no-default rule (trivial); the migration-on-existing-rows proof
-- comes from the column-absent mode. Not RLS or deployed Edge IO.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  auto_start_rest_timer boolean NOT NULL DEFAULT false
);
SELECT to_regclass('auth.users') IS NOT NULL AS has_auth \gset
\if :has_auth
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3');
\endif
INSERT INTO public.notification_preferences (user_id, auto_start_rest_timer) VALUES
  ('00000000-0000-4000-8000-0000000000a1', true), ('00000000-0000-4000-8000-0000000000a2', false);
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_preferences' AND column_name = 'auto_rest_duration_sec'
) AS has_col \gset
\if :has_col
\echo 'auto_rest_duration_sec already present: migration skipped'
\else
-- The rows above are pre-existing; apply the real additive migration.
\ir ../migrations/20261013000100_auto_rest_duration.sql
\endif
DO $$
DECLARE
  on_id  constant uuid := '00000000-0000-4000-8000-0000000000a1';
  off_id constant uuid := '00000000-0000-4000-8000-0000000000a2';
  new_id constant uuid := '00000000-0000-4000-8000-0000000000a3';
  value integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'notification_preferences' AND column_name = 'auto_rest_duration_sec'
      AND (is_nullable <> 'YES' OR column_default IS NOT NULL)) THEN
    RAISE EXCEPTION 'auto_rest_duration_sec must be nullable with no default';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id IN (on_id, off_id) AND auto_rest_duration_sec IS NOT NULL) THEN
    RAISE EXCEPTION 'existing rows must be NULL (classifier), not a fixed duration';
  END IF;
  IF NOT (SELECT auto_start_rest_timer FROM public.notification_preferences WHERE user_id = on_id) THEN
    RAISE EXCEPTION 'existing opt-in changed';
  END IF;
  IF (SELECT auto_start_rest_timer FROM public.notification_preferences WHERE user_id = off_id) THEN
    RAISE EXCEPTION 'existing opt-out changed';
  END IF;
  INSERT INTO public.notification_preferences (user_id) VALUES (new_id);
  IF NOT EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id = new_id AND auto_rest_duration_sec IS NULL AND NOT auto_start_rest_timer) THEN
    RAISE EXCEPTION 'new account defaults changed';
  END IF;
  FOREACH value IN ARRAY ARRAY[15, 60, 90, 120, 125, 180, 600] LOOP
    UPDATE public.notification_preferences SET auto_rest_duration_sec = value WHERE user_id = on_id;
    IF NOT EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id = on_id AND auto_rest_duration_sec = value AND auto_start_rest_timer) THEN
      RAISE EXCEPTION 'duration roundtrip failed: %', value;
    END IF;
  END LOOP;
  -- 10 and 605 are 5-second steps, so only the bounds reject them.
  FOREACH value IN ARRAY ARRAY[-5, 0, 10, 14, 16, 599, 601, 605] LOOP
    BEGIN
      UPDATE public.notification_preferences SET auto_rest_duration_sec = value WHERE user_id = on_id;
      RAISE EXCEPTION 'invalid duration accepted: %', value;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  -- Reset to Auto (classifier).
  UPDATE public.notification_preferences SET auto_rest_duration_sec = NULL WHERE user_id = on_id;
  IF NOT EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id = on_id AND auto_rest_duration_sec IS NULL AND auto_start_rest_timer) THEN
    RAISE EXCEPTION 'null reset failed';
  END IF;
END $$;
SELECT user_id, auto_start_rest_timer, auto_rest_duration_sec FROM public.notification_preferences
WHERE user_id::text LIKE '00000000-0000-4000-8000-0000000000a%' ORDER BY user_id;
ROLLBACK;
