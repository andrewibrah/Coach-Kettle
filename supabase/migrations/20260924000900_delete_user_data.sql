-- Class: new function (no schema change, no data change on apply).
-- Account-deletion purge for rows that auth.admin.deleteUser does NOT remove
-- (.superpowers g11 inventory §0/§1c), called only by the delete-account Edge Function
-- with the verified caller's uid, right before it deletes the auth user:
--   - workout_log, workouts, chats (and chat_history if it still exists): the repo chain
--     cannot tell whether these still have a user_id column or an FK to auth.users
--     (20260113205331_remote_schema drops both, live code still filters by user_id).
--     Each is deleted only if public.<table>.user_id exists. Deleting them explicitly also
--     means a NO ACTION FK left on any of them cannot block the auth delete.
--     workout_log goes before workouts; workout_media rows cascade from workouts (0027:7).
--   - event_logs: user_id has no FK (0007:10).
--   - subscription_events: FK is ON DELETE SET NULL (0028:61) and raw_payload keeps the
--     RevenueCat/Apple payload (app_user_id, aliases, subscriber attributes). The billing
--     row stays for the audit trail; only the payload is nulled.
-- Every other per-user table cascades from auth.users (inventory §1a). Storage objects are
-- removed by the Edge Function before this runs.
-- Runs in one transaction (a single function call). Idempotent: a retry purges zero rows.
-- No positional parameters or other dollar signs inside the body: the Supabase CLI
-- statement splitter misreads them (see 667e8d1). Dynamic SQL uses format() %I / %L.
BEGIN;
CREATE FUNCTION public.delete_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  t text;
  n bigint;
  result jsonb := '{}'::jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_data: user id is required' USING ERRCODE = '22004';
  END IF;

  FOREACH t IN ARRAY ARRAY['workout_log', 'workouts', 'chats', 'chat_history'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE user_id = %L', t, p_user_id);
      GET DIAGNOSTICS n = ROW_COUNT;
      result := result || jsonb_build_object(t, n);
    ELSE
      result := result || jsonb_build_object(t, NULL);
    END IF;
  END LOOP;

  DELETE FROM public.event_logs WHERE user_id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('event_logs', n);

  UPDATE public.subscription_events SET raw_payload = NULL
  WHERE user_id = p_user_id AND raw_payload IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('subscription_events_scrubbed', n);

  RETURN result;
END;
$$;
COMMENT ON FUNCTION public.delete_user_data(uuid) IS
  'delete-account Edge Function only (service_role): purge rows the auth.users cascade leaves behind for the verified uid.';
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid) TO service_role;
COMMIT;
