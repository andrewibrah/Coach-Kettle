-- UNAPPLIED P4 proposal. Requires 20261008000100 and 20261008000200.
-- No backfill: legacy workout_log rows remain raw and outside managed sessions.
-- New clients MUST use JWT-owned operation RPC. Old write clients fail closed.
-- Safe whole set ordinals exceed legacy int32. Widen without changing any raw
-- values; temporarily recreate the dependent read-only quarantine unchanged.
DROP VIEW public.i3_workout_numeric_quarantine;
ALTER TABLE public.workout_log ALTER COLUMN set_number TYPE bigint USING set_number::bigint;
CREATE VIEW public.i3_workout_numeric_quarantine WITH (security_invoker = true) AS
 SELECT id, user_id, workout_id, weight_lbs, reps,
 CASE WHEN public.i3_load(weight_lbs) IS NULL THEN 'unknown_or_invalid_load'
 WHEN public.i3_reps(reps) IS NULL THEN 'unknown_or_invalid_reps'
 WHEN public.i3_pr_reps(reps) IS NULL THEN 'legacy_pr_storage_unrepresentable'
 ELSE 'not_strength_evidence' END AS reason
 FROM public.workout_log WHERE NOT public.i3_strength_eligible(workout_log);
CREATE TABLE public.workout_operation_sessions (
    session_id text PRIMARY KEY,
    -- Cascades with the account, like every other per-user table; a late write for a deleted
    -- user fails (23503) instead of leaving private session state behind.
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date_iso text NOT NULL,
    state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','finalized','deleted')),
    revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.workout_operation_rows (
    session_id text NOT NULL REFERENCES public.workout_operation_sessions(session_id) ON DELETE CASCADE,
    row_id text NOT NULL,
    revision bigint NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    PRIMARY KEY (session_id,row_id)
);
CREATE TABLE public.workout_operation_receipts (
    session_id text NOT NULL REFERENCES public.workout_operation_sessions(session_id) ON DELETE CASCADE,
    operation_key text NOT NULL,
    request jsonb NOT NULL,
    receipt jsonb NOT NULL,
    PRIMARY KEY (session_id,operation_key)
);
ALTER TABLE public.workout_log ADD COLUMN p4_session_id text REFERENCES public.workout_operation_sessions(session_id) ON DELETE CASCADE;
ALTER TABLE public.workout_log ADD COLUMN p4_row_id text;
CREATE UNIQUE INDEX workout_log_p4_row ON public.workout_log(p4_session_id,p4_row_id);
ALTER TABLE public.workout_operation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_operation_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_operation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4_session_read ON public.workout_operation_sessions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.workout_operation_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_operation_sessions TO authenticated;
REVOKE ALL ON public.workout_operation_rows, public.workout_operation_receipts FROM PUBLIC, anon, authenticated;

-- SQL mirror of lib/workoutValidation.ts. Only NEW managed input is checked;
-- legacy raw log rows are neither scanned nor normalized.
-- ECMAScript WhiteSpace + LineTerminator, not locale-dependent SQL \s.
-- btrim removes these characters only at the edges; internal characters stay invalid.
CREATE FUNCTION public.p4_trim_numeric(token text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
    SELECT btrim(token, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
REVOKE ALL ON FUNCTION public.p4_trim_numeric(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.p4_numeric_kind(v jsonb, whole boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE token text; n numeric;
BEGIN
    IF v IS NULL OR v='null'::jsonb THEN RETURN 'unknown'; END IF;
    IF jsonb_typeof(v) NOT IN ('number','string') THEN RETURN 'invalid'; END IF;
    token := public.p4_trim_numeric(v #>> '{}');
    IF jsonb_typeof(v)='string' THEN
        IF token='' THEN RETURN 'unknown'; END IF;
        IF token !~ '^(\d+(\.\d+)?|\.\d+)$' OR (whole AND token !~ '^\d+$') THEN RETURN 'invalid'; END IF;
    END IF;
    n := token::numeric;
    IF n<0 OR (whole AND (n<>trunc(n) OR n>9007199254740991)) THEN RETURN 'invalid'; END IF;
    -- Use the IEEE-754 conversion, not comparison against MAX_VALUE's shortest
    -- printed decimal: slightly larger exact decimals can still round to finite MAX.
    BEGIN
        PERFORM token::double precision;
    EXCEPTION WHEN numeric_value_out_of_range THEN
        -- PostgreSQL rejects underflow to zero; JS Number accepts it. With the
        -- grammar/nonnegative/safe-whole checks above, only a positive fraction
        -- can underflow here. Overflow is never rescued by this branch.
        IF n>0 AND n<1 AND NOT whole THEN RETURN 'known'; END IF;
        RETURN 'invalid';
    END;
    RETURN 'known';
EXCEPTION WHEN OTHERS THEN RETURN 'invalid';
END $$;
REVOKE ALL ON FUNCTION public.p4_numeric_kind(jsonb,boolean) FROM PUBLIC,anon,authenticated;

-- Returns performed eligibility only AFTER strict validation of every known field.
CREATE FUNCTION public.p4_validate_row(r jsonb, complete boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE f text; allowed text[]; t jsonb; cardio boolean;
BEGIN
    IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR
       jsonb_typeof(r->'exercise') IS DISTINCT FROM 'string' OR
       coalesce(regexp_replace(r->>'exercise','\s','','g'),'')='' OR
       jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR
       coalesce(regexp_replace(r->>'id','\s','','g'),'')='' THEN
        RAISE EXCEPTION 'Invalid row identity or exercise';
    END IF;
    FOREACH f IN ARRAY ARRAY['isCardio','isRest'] LOOP
        IF r ? f AND jsonb_typeof(r->f) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid row flag'; END IF;
    END LOOP;
    IF r ? 'set' AND public.p4_numeric_kind(r->'set',true)<>'known' THEN RAISE EXCEPTION 'Invalid set number'; END IF;
    FOREACH f IN ARRAY ARRAY['performance','setKind','status','distanceUnit'] LOOP
        allowed := CASE f WHEN 'performance' THEN ARRAY['planned','performed']
            WHEN 'setKind' THEN ARRAY['work','warmup','backoff','drop','superset','cardio']
            WHEN 'status' THEN ARRAY['syncing','committed'] ELSE ARRAY['miles','km','meters'] END;
        IF r ? f AND (jsonb_typeof(r->f) IS DISTINCT FROM 'string' OR NOT (r->>f=ANY(allowed))) THEN
            RAISE EXCEPTION 'Invalid row metadata enum';
        END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['notes','pendingInput'] LOOP
        IF r ? f AND jsonb_typeof(r->f) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid row text'; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['timestamp','durationMins','distance','heartRate','calories','level'] LOOP
        IF r ? f AND (jsonb_typeof(r->f) IS DISTINCT FROM 'number' OR public.p4_numeric_kind(r->f)<>'known') THEN
            RAISE EXCEPTION 'Invalid finite row quantity';
        END IF;
    END LOOP;
    IF r ? 'plannedTarget' THEN
        t := r->'plannedTarget';
        IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR jsonb_typeof(t->'reps') IS DISTINCT FROM 'string' OR
           public.p4_numeric_kind(t->'reps',true)='invalid' OR
           (t ? 'weightLbs' AND (jsonb_typeof(t->'weightLbs') IS DISTINCT FROM 'string' OR
             public.p4_numeric_kind(t->'weightLbs')='invalid')) THEN RAISE EXCEPTION 'Invalid planned target'; END IF;
    END IF;
    cardio := coalesce((r->>'isCardio')::boolean,false);
    FOREACH f IN ARRAY ARRAY['weightLbs','reps'] LOOP
        IF cardio THEN
            IF r ? f AND r->f<>'null'::jsonb AND jsonb_typeof(r->f)<>'string' AND
               (jsonb_typeof(r->f)<>'number' OR public.p4_numeric_kind(r->f)<>'known') THEN
                RAISE EXCEPTION 'Invalid cardio display value';
            END IF;
        ELSIF public.p4_numeric_kind(r->f,f='reps')='invalid' OR
              (complete AND public.p4_numeric_kind(r->f,f='reps')<>'known') THEN
            RAISE EXCEPTION 'Invalid strength quantity';
        END IF;
    END LOOP;
    RETURN NOT coalesce((r->>'isRest')::boolean,false) AND
        coalesce(r->>'performance','performed')<>'planned' AND coalesce(r->>'status','committed')<>'syncing' AND
        (cardio OR (public.p4_numeric_kind(r->'weightLbs')='known' AND public.p4_numeric_kind(r->'reps',true)='known'));
END $$;
REVOKE ALL ON FUNCTION public.p4_validate_row(jsonb,boolean) FROM PUBLIC,anon,authenticated;

-- Private typed insertion helper: trigger and constraints execute in the caller transaction.
CREATE FUNCTION public.p4_insert_row(p_owner uuid,p_session text,p_date text,p_row jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NOT public.p4_validate_row(p_row,true) THEN RAISE EXCEPTION 'Invalid performed row'; END IF;
    INSERT INTO public.workout_log(user_id,workout_id,workout_date,p4_session_id,p4_row_id,
        exercise,set_number,weight_lbs,reps,notes,created_at,performance,set_kind,
        is_cardio,duration_mins,distance,distance_unit,heart_rate,calories,level)
    VALUES (p_owner,p_session,p_date,p_session,p_row->>'id',p_row->>'exercise',
        coalesce(public.p4_trim_numeric(p_row->>'set')::numeric::bigint,1),
        -- JSON numeric scalars stringify in decimal in PostgreSQL; strength
        -- strings only lose surrounding whitespace (same as numericText).
        -- Cardio display text/null/absence is not strength numeric evidence.
        CASE WHEN coalesce((p_row->>'isCardio')::boolean,false) THEN p_row->>'weightLbs'
             ELSE public.p4_trim_numeric(p_row->>'weightLbs') END,
        CASE WHEN coalesce((p_row->>'isCardio')::boolean,false) THEN p_row->>'reps'
             ELSE public.p4_trim_numeric(p_row->>'reps') END,
        nullif(p_row->>'notes',''),now(),p_row->>'performance',p_row->>'setKind',
        coalesce((p_row->>'isCardio')::boolean,false),(p_row->>'durationMins')::numeric,
        (p_row->>'distance')::numeric,p_row->>'distanceUnit',(p_row->>'heartRate')::numeric,
        (p_row->>'calories')::numeric,(p_row->>'level')::numeric);
END $$;
REVOKE ALL ON FUNCTION public.p4_insert_row(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.apply_workout_operation(p_session_id text,p_operation_key text,p_revision bigint,
    p_kind text,p_row_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    owner_id uuid := auth.uid();
    session public.workout_operation_sessions%ROWTYPE;
    previous public.workout_operation_receipts%ROWTYPE;
    old_row public.workout_operation_rows%ROWTYPE;
    request_json jsonb := jsonb_build_object('revision',p_revision,'kind',p_kind,'rowId',p_row_id,'payload',p_payload);
    result jsonb := jsonb_build_object('ok',true,'sessionId',p_session_id,'operationKey',p_operation_key,'revision',p_revision);
    row_json jsonb;
    previous_e1rm numeric;
    committed_row public.workout_log%ROWTYPE;
    date_text text := p_payload->>'dateISO';
BEGIN
    IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
    IF coalesce(p_session_id,'')='' OR length(p_session_id)>256 OR
       coalesce(p_operation_key,'')='' OR length(p_operation_key)>512 OR
       p_revision IS NULL OR p_revision < 1 OR p_revision > 9007199254740991 OR
       p_kind NOT IN ('put','revise','drop','finalize','delete') OR p_kind IS NULL OR p_payload IS NULL THEN
        RAISE EXCEPTION 'Invalid operation identity';
    END IF;
    -- Validate NEW input before even allocating the session; invalid snapshots never
    -- become history merely because their malformed rows are absent from logRows.
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
    IF p_kind='put' THEN
        IF NOT public.p4_validate_row(p_payload->'row',true) OR
           p_payload->'row'->>'id' IS DISTINCT FROM p_row_id THEN RAISE EXCEPTION 'Invalid performed row'; END IF;
    ELSIF p_kind='revise' THEN
        PERFORM public.p4_validate_row(p_payload->'row');
        IF p_payload->'row'->>'id' IS DISTINCT FROM p_row_id THEN RAISE EXCEPTION 'Row identity mismatch'; END IF;
    ELSIF p_kind='finalize' THEN
        IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR
           jsonb_typeof(p_payload->'logRows') IS DISTINCT FROM 'array' OR
           jsonb_typeof(p_payload->'part') IS DISTINCT FROM 'string' OR
           coalesce(regexp_replace(p_payload->>'part','\s','','g'),'')='' OR
           jsonb_typeof(p_payload->'createdAt') IS DISTINCT FROM 'number' OR
           public.p4_numeric_kind(p_payload->'createdAt',true)<>'known' OR
           (p_payload ? 'reflection' AND p_payload->'reflection'<>'null'::jsonb AND
            jsonb_typeof(p_payload->'reflection')<>'string') OR
           (p_payload ? 'review' AND p_payload->'review'<>'null'::jsonb AND
            jsonb_typeof(p_payload->'review')<>'object') THEN RAISE EXCEPTION 'Invalid final snapshot'; END IF;
        IF p_payload ? 'review' AND p_payload->'review'<>'null'::jsonb THEN
            row_json := p_payload->'review';
            IF jsonb_typeof(row_json->'rating') IS DISTINCT FROM 'number' OR
               public.p4_numeric_kind(row_json->'rating')<>'known' OR
               (row_json->>'rating')::numeric NOT BETWEEN 1 AND 10 OR
               jsonb_typeof(row_json->'strengths') IS DISTINCT FROM 'array' OR
               jsonb_typeof(row_json->'weakness') IS DISTINCT FROM 'string' OR
               jsonb_typeof(row_json->'nextSessionNote') IS DISTINCT FROM 'string' OR
               jsonb_typeof(row_json->'generatedAt') IS DISTINCT FROM 'number' OR
               public.p4_numeric_kind(row_json->'generatedAt')<>'known' THEN RAISE EXCEPTION 'Invalid review'; END IF;
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(row_json->'strengths') s WHERE
                jsonb_typeof(s) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Invalid review strengths'; END IF;
        END IF;
        FOR row_json IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
            PERFORM public.p4_validate_row(row_json);
        END LOOP;
        FOR row_json IN SELECT value FROM jsonb_array_elements(p_payload->'logRows') LOOP
            IF NOT public.p4_validate_row(row_json,true) THEN RAISE EXCEPTION 'Invalid performed projection'; END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'rows') r WHERE coalesce(r->>'id','')='') OR
           (SELECT count(*) FROM jsonb_array_elements(p_payload->'rows')) <>
           (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(p_payload->'rows') r) THEN
            RAISE EXCEPTION 'Unique stable row IDs required';
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'logRows')) <>
           (SELECT count(DISTINCT l->>'id') FROM jsonb_array_elements(p_payload->'logRows') l) OR
           EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'rows') r WHERE
               public.p4_validate_row(r) AND
               NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'logRows') l WHERE l->>'id'=r->>'id')) THEN
            RAISE EXCEPTION 'Missing or duplicate performed log projection';
        END IF;
        -- logRows may canonicalize the name only. Never allow a fabricated performance projection.
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'logRows') l WHERE NOT EXISTS
            (SELECT 1 FROM jsonb_array_elements(p_payload->'rows') r WHERE r->>'id'=l->>'id' AND r-'exercise'=l-'exercise')) THEN
            RAISE EXCEPTION 'Log projection conflicts with snapshot';
        END IF;
    END IF;
    -- Never claim an ambiguous legacy history ID, even for its own user. No raw destructive conversion.
    IF EXISTS (SELECT 1 FROM public.workouts w WHERE w.id=p_session_id AND
        (w.user_id IS DISTINCT FROM owner_id OR NOT EXISTS
            (SELECT 1 FROM public.workout_operation_sessions s WHERE s.session_id=p_session_id))) THEN
        RAISE EXCEPTION 'Legacy or foreign session identity';
    END IF;
    IF p_kind IN ('put','revise','drop','finalize') THEN
        IF date_text IS NULL OR date_text !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(date_text::date,'YYYY-MM-DD')<>date_text THEN
            RAISE EXCEPTION 'Invalid session date';
        END IF;
        INSERT INTO public.workout_operation_sessions(session_id,user_id,date_iso)
        VALUES (p_session_id,owner_id,date_text) ON CONFLICT DO NOTHING;
    END IF;
    -- All mutations serialize here, including concurrent first creation.
    SELECT * INTO session FROM public.workout_operation_sessions WHERE session_id=p_session_id FOR UPDATE;
    IF NOT FOUND OR session.user_id<>owner_id THEN RAISE EXCEPTION 'Session ownership required' USING ERRCODE='42501'; END IF;
    IF date_text IS NOT NULL AND date_text<>session.date_iso THEN RAISE EXCEPTION 'Session date conflict'; END IF;
    SELECT * INTO previous FROM public.workout_operation_receipts WHERE session_id=p_session_id AND operation_key=p_operation_key;
    IF FOUND THEN
        IF previous.request<>request_json THEN RAISE EXCEPTION 'Operation key payload conflict'; END IF;
        IF session.state='deleted' AND p_kind<>'delete' THEN RAISE EXCEPTION 'Session deleted'; END IF;
        RETURN previous.receipt;
    END IF;
    IF session.state='deleted' THEN RAISE EXCEPTION 'Session deleted'; END IF;
    -- PR evidence is shared across sessions: serialize this owner's trigger/reconcile window too.
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text || ':workout-prs',0));
    IF p_kind IN ('put','revise','drop') THEN
        IF session.state<>'open' THEN RAISE EXCEPTION 'Session finalized'; END IF;
        IF coalesce(p_row_id,'')='' THEN RAISE EXCEPTION 'Row identity required'; END IF;
        SELECT * INTO old_row FROM public.workout_operation_rows WHERE session_id=p_session_id AND row_id=p_row_id;
        IF FOUND AND (old_row.deleted OR old_row.revision>=p_revision) THEN RAISE EXCEPTION 'Stale or deleted row'; END IF;
        INSERT INTO public.workout_operation_rows(session_id,row_id,revision,deleted)
        VALUES(p_session_id,p_row_id,p_revision,p_kind='drop')
        ON CONFLICT(session_id,row_id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted;
        DELETE FROM public.workout_log WHERE p4_session_id=p_session_id AND user_id=owner_id AND p4_row_id=p_row_id;
        -- Corrections may retract evidence without permanently deleting the row.
        -- A later higher-revision completion keeps the same stable identity.
        IF p_kind IN ('put','revise') AND public.p4_validate_row(p_payload->'row') THEN
            IF p_payload->'row'->>'id' IS DISTINCT FROM p_row_id THEN RAISE EXCEPTION 'Row identity mismatch'; END IF;
            SELECT estimated_1rm INTO previous_e1rm FROM public.pr_lifts
                WHERE user_id=owner_id AND lower(trim(lift_name))=lower(trim(p_payload->'row'->>'exercise'))
                ORDER BY estimated_1rm DESC LIMIT 1;
            PERFORM public.p4_insert_row(owner_id,p_session_id,session.date_iso,p_payload->'row');
            SELECT * INTO committed_row FROM public.workout_log WHERE p4_session_id=p_session_id AND p4_row_id=p_row_id;
            IF public.i3_strength_eligible(committed_row) AND EXISTS
                (SELECT 1 FROM public.pr_tracked_lifts WHERE user_id=owner_id AND is_active AND lower(trim(lift_name))=lower(trim(committed_row.exercise))) AND
                (previous_e1rm IS NULL OR public.i3_epley(public.i3_load(committed_row.weight_lbs),public.i3_pr_reps(committed_row.reps))>previous_e1rm) THEN
                result := result || jsonb_build_object('pr',jsonb_build_object('liftName',committed_row.exercise,
                    'weight',public.i3_load(committed_row.weight_lbs),'reps',public.i3_pr_reps(committed_row.reps),
                    'newE1rm',public.i3_epley(public.i3_load(committed_row.weight_lbs),public.i3_pr_reps(committed_row.reps)),
                    'previousE1rm',previous_e1rm));
            END IF;
        END IF;
        PERFORM public.reconcile_workout_prs(owner_id,session.date_iso);
    ELSE
        -- The one permanent terminal delete sorts after every valid final revision,
        -- including MAX_SAFE_INTEGER. No stale-final/live guard is relaxed.
        IF p_revision<=session.revision AND NOT (p_kind='delete' AND
            p_revision=9007199254740991 AND p_operation_key='delete:' || p_session_id || ':terminal:v1') THEN
            RAISE EXCEPTION 'Stale session revision';
        END IF;
        IF p_kind='finalize' THEN
            IF EXISTS (SELECT 1 FROM public.workout_operation_rows t JOIN
                jsonb_array_elements(p_payload->'rows') r ON r->>'id'=t.row_id
                WHERE t.session_id=p_session_id AND t.deleted) THEN RAISE EXCEPTION 'Deleted row cannot return'; END IF;
            UPDATE public.workout_operation_rows SET deleted=true WHERE session_id=p_session_id AND row_id NOT IN
                (SELECT r->>'id' FROM jsonb_array_elements(p_payload->'rows') r);
            INSERT INTO public.workout_operation_rows(session_id,row_id,revision)
            SELECT p_session_id,r->>'id',p_revision FROM jsonb_array_elements(p_payload->'rows') r
            ON CONFLICT(session_id,row_id) DO UPDATE SET revision=excluded.revision;
            INSERT INTO public.workouts(id,user_id,"dateISO",part,"createdAt",rows_json,review_json,reflection)
            VALUES(p_session_id,owner_id,session.date_iso,p_payload->>'part',(p_payload->>'createdAt')::bigint,
                (p_payload->'rows')::text,nullif((p_payload->'review')::text,'null'),p_payload->>'reflection')
            ON CONFLICT(id) DO UPDATE SET rows_json=excluded.rows_json,part=excluded.part,
                review_json=excluded.review_json,reflection=excluded.reflection;
        ELSE
            UPDATE public.workout_operation_rows SET deleted=true WHERE session_id=p_session_id;
            DELETE FROM public.workouts WHERE id=p_session_id AND user_id=owner_id;
        END IF;
        DELETE FROM public.workout_log WHERE p4_session_id=p_session_id AND user_id=owner_id;
        IF p_kind='finalize' THEN
            FOR row_json IN SELECT value FROM jsonb_array_elements(p_payload->'logRows') LOOP
                PERFORM public.p4_insert_row(owner_id,p_session_id,session.date_iso,row_json);
            END LOOP;
        END IF;
        -- Snapshot, log trigger writes, PR retraction, state and receipt commit or roll back together.
        PERFORM public.reconcile_workout_prs(owner_id,session.date_iso);
        UPDATE public.workout_operation_sessions SET revision=p_revision,
            state=CASE WHEN p_kind='delete' THEN 'deleted' ELSE 'finalized' END WHERE session_id=p_session_id;
    END IF;
    INSERT INTO public.workout_operation_receipts VALUES(p_session_id,p_operation_key,request_json,result);
    RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_workout_operation(text,text,bigint,text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.apply_workout_operation(text,text,bigint,text,text,jsonb) TO authenticated;
-- Prevent old clients bypassing serialization; reflection-only PATCH retains existing owner RLS.
REVOKE INSERT,UPDATE,DELETE ON public.workouts,public.workout_log FROM anon,authenticated;
GRANT UPDATE(reflection) ON public.workouts TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_workout(text,text,text,bigint,jsonb),public.delete_workout(text) FROM PUBLIC,anon,authenticated;

-- Account deletion must also purge P4 session state: receipts hold full row payloads,
-- review and reflection text. Same contract as 20260924000900 plus the P4 tables, deleted
-- child-first (log rows, receipts, rows, then sessions). CREATE OR REPLACE keeps the
-- service_role-only grants. No other dollar signs inside the body (CLI statement splitter).
CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  t text;
  n bigint;
  result jsonb := '{}'::jsonb;
  skipped jsonb := '[]'::jsonb;
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
      IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
        skipped := skipped || to_jsonb(t);
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.workout_log WHERE p4_session_id IN
    (SELECT session_id FROM public.workout_operation_sessions WHERE user_id = p_user_id);
  DELETE FROM public.workout_operation_receipts WHERE session_id IN
    (SELECT session_id FROM public.workout_operation_sessions WHERE user_id = p_user_id);
  DELETE FROM public.workout_operation_rows WHERE session_id IN
    (SELECT session_id FROM public.workout_operation_sessions WHERE user_id = p_user_id);
  DELETE FROM public.workout_operation_sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('workout_operation_sessions', n);

  DELETE FROM public.event_logs WHERE user_id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('event_logs', n);

  UPDATE public.subscription_events SET raw_payload = NULL
  WHERE user_id = p_user_id AND raw_payload IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  result := result || jsonb_build_object('subscription_events_scrubbed', n);

  RETURN result || jsonb_build_object('skipped', skipped);
END;
$$;
