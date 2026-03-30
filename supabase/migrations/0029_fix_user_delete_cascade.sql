-- Fix: Add ON DELETE CASCADE to all user_id foreign keys that are missing it.
-- Without this, deleting a user from Supabase Auth dashboard fails with
-- "Database error deleting user" because PostgreSQL blocks the delete
-- due to dependent rows in these tables.

-- ============================================================
-- 1. workouts.user_id  (added in 0011 without CASCADE)
-- ============================================================
DO $$
DECLARE
  _con text;
BEGIN
  SELECT con.conname INTO _con
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'workouts'
     AND att.attname = 'user_id'
     AND con.contype = 'f';

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workouts DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 2. workout_log.user_id  (added in 0011 without CASCADE;
--    0024 ADD COLUMN IF NOT EXISTS was a no-op)
-- ============================================================
DO $$
DECLARE
  _con text;
BEGIN
  SELECT con.conname INTO _con
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'workout_log'
     AND att.attname = 'user_id'
     AND con.contype = 'f';

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workout_log DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.workout_log
  ADD CONSTRAINT workout_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 3. chat_history.user_id  (added in 0011 without CASCADE)
-- ============================================================
DO $$
DECLARE
  _con text;
BEGIN
  SELECT con.conname INTO _con
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'chat_history'
     AND att.attname = 'user_id'
     AND con.contype = 'f';

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chat_history DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.chat_history
  ADD CONSTRAINT chat_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 4. workout_media.user_id  (added in 0027 without CASCADE)
-- ============================================================
DO $$
DECLARE
  _con text;
BEGIN
  SELECT con.conname INTO _con
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'workout_media'
     AND att.attname = 'user_id'
     AND con.contype = 'f';

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workout_media DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.workout_media
  ADD CONSTRAINT workout_media_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
