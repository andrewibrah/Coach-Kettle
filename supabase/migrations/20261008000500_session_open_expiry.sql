-- D08 decision (2026-10-13): a workout session still open 24 hours after it was created is
-- auto-closed with the sets it already has, exactly like an End, and locked against late live
-- writes. A later End from the phone (higher revision) still replaces the snapshot.
-- Requires 20261008000300. No positional parameters or other dollar signs inside function
-- bodies (CLI statement splitter); the cron command is single-quoted.
ALTER TABLE public.workout_operation_sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
-- Last failed auto-close attempt: failing sessions sort after never-failed ones so they cannot
-- starve the queue; they are still retried, least recently failed first.
ALTER TABLE public.workout_operation_sessions ADD COLUMN expire_failed_at timestamptz;
CREATE INDEX workout_operation_sessions_open_due ON public.workout_operation_sessions
    (expire_failed_at NULLS FIRST, created_at) WHERE state = 'open';

-- Closes due sessions one by one, at most p_limit per run (the run is one transaction, so a small
-- batch keeps each owner's PR advisory lock short; the 15-minute schedule drains any backlog). Each close runs apply_workout_operation as the session owner, so
-- the snapshot is validated, the history row written and PRs reconciled by the same code as an End.
-- The snapshot is rebuilt from the latest committed put/revise payload of every live row.
CREATE FUNCTION public.expire_open_workout_sessions(p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    due record;
    snapshot jsonb;
    performed jsonb;
    caller text := current_setting('request.jwt.claim.sub', true);
    closed integer := 0;
BEGIN
    FOR due IN
        SELECT s.session_id, s.user_id, s.date_iso, s.created_at
        FROM public.workout_operation_sessions s
        WHERE s.state = 'open' AND s.created_at <= p_now - interval '24 hours'
        ORDER BY s.expire_failed_at NULLS FIRST, s.created_at
        LIMIT greatest(p_limit, 0)
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            -- Keep each exercise together, in the order it was first logged (History groups adjacent
            -- rows); within it, by each row's first write. Revisions are client epoch ms, so the
            -- first receipt of a row is its logging time and a later correction does not move it.
            SELECT coalesce(jsonb_agg(ordered.row_json ORDER BY ordered.exercise_first, ordered.first_rev, ordered.row_id), '[]'::jsonb)
            INTO snapshot
            FROM (
                SELECT latest.row_json, latest.row_id, latest.first_rev,
                       min(latest.first_rev) OVER (PARTITION BY lower(btrim(latest.row_json->>'exercise'))) AS exercise_first
                FROM (
                    SELECT t.row_id, r.request->'payload'->'row' AS row_json,
                           (SELECT min((f.request->>'revision')::bigint) FROM public.workout_operation_receipts f
                            WHERE f.session_id = t.session_id AND f.request->>'rowId' = t.row_id) AS first_rev
                    FROM public.workout_operation_rows t
                    JOIN public.workout_operation_receipts r
                      ON r.session_id = t.session_id
                     AND r.request->>'rowId' = t.row_id
                     AND (r.request->>'revision')::bigint = t.revision
                     AND r.request->>'kind' IN ('put', 'revise')
                    WHERE t.session_id = due.session_id AND NOT t.deleted
                ) latest
            ) ordered;
            SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO performed
            FROM jsonb_array_elements(snapshot) x WHERE public.p4_validate_row(x); -- performed evidence only
            IF jsonb_array_length(performed) = 0 THEN
                -- Nothing performed (no sets, or all retracted): lock it without inventing a history
                -- entry, which would otherwise read as "workout done" for daily feedback.
                UPDATE public.workout_operation_sessions SET state = 'finalized' WHERE session_id = due.session_id;
            ELSE
                PERFORM set_config('request.jwt.claim.sub', due.user_id::text, true);
                PERFORM public.apply_workout_operation(due.session_id, 'expire:' || due.session_id || ':v1', 1,
                    'finalize', NULL, jsonb_build_object(
                        'dateISO', due.date_iso, 'part', 'Workout',
                        'createdAt', floor(extract(epoch FROM due.created_at) * 1000)::bigint,
                        'rows', snapshot, 'logRows', performed));
            END IF;
            closed := closed + 1;
        EXCEPTION WHEN OTHERS THEN
            -- One bad session must not block the others; it stays open and is retried next run.
            RAISE WARNING 'expire_open_workout_sessions: % skipped: %', due.session_id, SQLERRM;
            UPDATE public.workout_operation_sessions SET expire_failed_at = p_now WHERE session_id = due.session_id;
        END;
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
    RETURN closed;
END $$;
-- Only the cron job (postgres) runs it: no API role may force-close sessions or pick p_now.
REVOKE ALL ON FUNCTION public.expire_open_workout_sessions(timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role;

-- Schedule every 15 minutes where pg_cron is available (Supabase hosted and local stacks).
-- A plain Postgres without pg_cron still applies the migration; call the function manually there.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
       AND current_setting('shared_preload_libraries', true) LIKE '%pg_cron%' THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
        PERFORM cron.schedule('expire-open-workout-sessions', '*/15 * * * *', 'SELECT public.expire_open_workout_sessions()');
    ELSE
        RAISE NOTICE 'pg_cron unavailable or not preloaded: expire_open_workout_sessions is not scheduled';
    END IF;
END $$;
