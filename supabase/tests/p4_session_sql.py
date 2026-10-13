"""Disposable PG15 only; no environment DB URLs, TCP, secrets or linked CLI.
Fixture uses legacy numeric/PR fixture + actual workouts initial/RLS columns.
Not a full migration-chain/auth.users/RLS deployment proof.
"""
import json, os, pathlib, subprocess, tempfile, time, uuid
os.environ['LC_ALL'] = 'C'
ROOT = pathlib.Path(__file__).resolve().parents[2]
# Short default path: the unix socket path must stay under the 103-byte limit.
SCRATCH = pathlib.Path(os.environ.get('P4_SCRATCH') or tempfile.mkdtemp(prefix='p4s', dir='/tmp')).resolve()
BIN = pathlib.Path('/opt/homebrew/opt/postgresql@15/bin')
BASE = SCRATCH / ('p4-pg-' + uuid.uuid4().hex[:10])
DATA, SOCKET = BASE / 'data', BASE / 'socket'
BASE.mkdir(); SOCKET.mkdir()
PORT = '55484'
OWNER = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'
CMD = [str(BIN / 'psql'), '-h', str(SOCKET), '-p', PORT, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
def sql(text):
    result = subprocess.run(CMD, input=text, text=True, capture_output=True)
    if result.returncode:
        print(result.stderr.strip())
        raise subprocess.CalledProcessError(result.returncode, CMD, result.stdout, result.stderr)
    return result.stdout.strip()
def auth(text, user=OWNER):
    return "SET ROLE authenticated; SET request.jwt.claim.sub = '%s';\n" % user + text
row = {'id':'r1','exercise':'Bench','set':1,'weightLbs':'100','reps':'8','notes':'literal','performance':'performed'}
def op(session, key, revision, kind, payload, row_id=None):
    q = lambda value: "'" + str(value).replace("'", "''") + "'"
    return 'SELECT public.apply_workout_operation(%s,%s,%s,%s,%s,%s::jsonb);' % (q(session),q(key),revision,q(kind),'NULL' if row_id is None else q(row_id),q(json.dumps(payload)))
def put(session='s1', rid='r1', key=None, revision=1):
    r = dict(row, id=rid)
    return op(session,key or 'put:'+rid+':'+str(revision),revision,'put',{'dateISO':'2026-10-08','row':r},rid)
def final(session='s1', rows=None, revision=2, key=None):
    rows = [row] if rows is None else rows
    return op(session,key or 'final:'+str(revision),revision,'finalize',{'dateISO':'2026-10-08','part':'Push','createdAt':1,'rows':rows,'logRows':rows})
def expect_reject(command, user=OWNER):
    try: sql(auth(command,user))
    except subprocess.CalledProcessError: return
    raise AssertionError('unsafe operation accepted: '+command)
started=False
try:
    subprocess.run([str(BIN/'initdb'),'-D',str(DATA),'-A','trust','--no-locale','--encoding=UTF8'],check=True,capture_output=True)
    subprocess.run([str(BIN/'pg_ctl'),'-D',str(DATA),'-l',str(BASE/'postgres.log'),'-o',"-c listen_addresses='' -k %s -p %s" % (SOCKET,PORT),'-w','start'],check=True,capture_output=True); started=True
    assert sql("SHOW listen_addresses;") == ''
    assert sql("SHOW server_encoding;") == 'UTF8'
    fixture=(ROOT/'supabase/tests/in_session_numeric_integrity.sql').read_text().split('INSERT INTO public.pr_tracked_lifts')[0]
    fixture=fixture.replace('BEGIN;','').replace('\\if :i3_apply_proposal','').replace('\\endif','')
    fixture=fixture.replace('\\ir ../migrations/', '\\ir '+str(ROOT/'supabase/migrations')+'/')
    fixture=fixture.replace("SELECT '00000000-0000-0000-0000-000000000001'::uuid", "SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid")
    fixture += '\nCREATE TABLE public.workouts (id text primary key, "dateISO" text, part text, "createdAt" bigint, rows_json text, user_id uuid, review_json text, reflection text);\n'
    fixture += '\n\\ir '+str(ROOT/'supabase/migrations/20261008000200_cardio_metric_capacity.sql')+'\n'
    fixture += '\n\\ir '+str(ROOT/'supabase/migrations/0004_rpc_functions.sql')+'\n'
    sql(fixture)
    sql("CREATE UNIQUE INDEX pr_fixture_norm ON pr_lifts(user_id,lower(trim(lift_name))); INSERT INTO pr_tracked_lifts VALUES ('%s','Bench',true);" % OWNER)
    # Existing malformed legacy bytes and whole ordinals survive the set-column
    # widening; the quarantine remains a read-only classification, not a repair.
    sql("INSERT INTO workout_log(user_id,workout_id,workout_date,exercise,set_number,weight_lbs,reps,notes) VALUES ('%s','pre-p4-raw','2026-10-07','Pre-P4 Raw',2147483647,'NaN','bad','untouched before proposal');" % OWNER)
    legacy_before=sql("SELECT json_build_array(weight_lbs,reps,notes,set_number)::text FROM workout_log WHERE workout_id='pre-p4-raw';")
    if os.environ.get('P4_APPLY') == 'true':
        # Minimal auth.users stub for the proposal's ON DELETE CASCADE owner FK.
        sql("CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('%s'),('%s');" % (OWNER, OTHER))
        sql('\\ir '+str(ROOT/'supabase/migrations/20261008000300_session_operation_integrity.sql'))
        assert sql("SELECT json_build_array(weight_lbs,reps,notes,set_number)::text FROM workout_log WHERE workout_id='pre-p4-raw';")==legacy_before
        assert sql("SELECT reason FROM i3_workout_numeric_quarantine WHERE workout_id='pre-p4-raw';")=='unknown_or_invalid_load'
    # Actual API/Edge success is derived from this cluster's RPC and readback.
    subprocess.run(['node','--experimental-strip-types','supabase/tests/p4_edge_sql.mts'], cwd=ROOT, env=dict(os.environ,P4_FIXTURE=str(BASE),P4_SCRATCH=str(SCRATCH)),check=True)
    # Direct authenticated RPC must validate before creating any session or evidence.
    invalid_rows = [dict(row, performance='unknown-enum'), dict(row, weightLbs='NaN'),
        None, [], dict(row, exercise=[]), dict(row, exercise=' '), dict(row, id=1),
        dict(row, isCardio=None), dict(row, isRest=0), dict(row, set=None),
        dict(row, set=1.5), dict(row, set=9007199254740992), dict(row, setKind='unknown'),
        dict(row, status='unknown'), dict(row, distanceUnit='unknown'), dict(row, notes=[]),
        dict(row, pendingInput={}), dict(row, timestamp='1'), dict(row, timestamp=-1),
        dict(row, plannedTarget=None), dict(row, plannedTarget=[]),
        dict(row, plannedTarget={'reps':'1.5'}), dict(row, plannedTarget={'reps':'1','weightLbs':False}),
        dict(row, heartRate=None), dict(row, calories='0'), dict(row, level=-1),
        dict(row, durationMins=1e309), dict(row, reps='9007199254740992'),
        dict(row, reps='1.0'), dict(row, weightLbs=True), dict(row, weightLbs='1e100')]
    for index, bad in enumerate(invalid_rows):
        # Infinity is represented as a JSON numeric token beyond JS finite capacity.
        for kind in ['put','finalize']:
            sid='invalid-%s-%s' % (kind,index)
            payload={'dateISO':'2026-10-08','row':bad} if kind=='put' else {
                'dateISO':'2026-10-08','part':'Push','createdAt':1,'rows':[bad],'logRows':[]}
            command=op(sid,'bad:1',1,kind,payload,'r1' if kind=='put' else None).replace('Infinity','1e400')
            before=sql("SELECT coalesce(json_agg(p)::text,'[]') FROM pr_lifts p;")
            expect_reject(command)
            for table, column in [('workout_operation_sessions','session_id'),('workout_operation_rows','session_id'),
                                  ('workout_operation_receipts','session_id'),('workouts','id'),('workout_log','p4_session_id')]:
                assert sql("SELECT count(*) FROM %s WHERE %s='%s';" % (table,column,sid))=='0'
            assert sql("SELECT coalesce(json_agg(p)::text,'[]') FROM pr_lifts p;")==before
    # Snapshot metadata and fabricated projections are invalid even on an existing
    # finalized session: compare every persistence surface, including PR evidence.
    sql(auth(put(session='strict-existing')))
    sql(auth(final(session='strict-existing')))
    def effects(sid):
        return sql("SELECT jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(s)) FROM workout_operation_sessions s WHERE session_id='%s'),'rows',(SELECT jsonb_agg(to_jsonb(r) ORDER BY row_id) FROM workout_operation_rows r WHERE session_id='%s'),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_key) FROM workout_operation_receipts r WHERE session_id='%s'),'snapshot',(SELECT jsonb_agg(to_jsonb(w)) FROM workouts w WHERE id='%s'),'logs',(SELECT jsonb_agg(to_jsonb(l) ORDER BY p4_row_id) FROM workout_log l WHERE p4_session_id='%s'),'prs',(SELECT jsonb_agg(to_jsonb(p) ORDER BY lift_name) FROM pr_lifts p));" % ((sid,)*5))
    valid_payload={'dateISO':'2026-10-08','part':'Push','createdAt':1,'rows':[row],'logRows':[row]}
    invalid_snapshots=[dict(valid_payload,rows=None),dict(valid_payload,rows={}),
        dict(valid_payload,logRows=None),dict(valid_payload,part=[]),dict(valid_payload,part=None),
        dict(valid_payload,createdAt='1'),dict(valid_payload,createdAt=1.5),
        dict(valid_payload,createdAt=-1),dict(valid_payload,reflection=[]),dict(valid_payload,review=[]),
        dict(valid_payload,rows=[dict(row,weightLbs='NaN')],logRows=[]),
        dict(valid_payload,logRows=[dict(row,reps='9')]),
        dict(valid_payload,logRows=[dict(row,id='fabricated')]),
        dict(valid_payload,review={'rating':None,'strengths':[],'weakness':'','nextSessionNote':'','generatedAt':1}),
        dict(valid_payload,review={'rating':5,'strengths':[[]],'weakness':'','nextSessionNote':'','generatedAt':1}),
        dict(valid_payload,review={'rating':5,'strengths':[],'weakness':{},'nextSessionNote':'','generatedAt':1}),
        dict(valid_payload,review={'rating':5,'strengths':[],'weakness':'','nextSessionNote':[],'generatedAt':1}),
        dict(valid_payload,review={'rating':5,'strengths':[],'weakness':'','nextSessionNote':'','generatedAt':'1'})]
    for index,payload in enumerate(invalid_snapshots):
        before=effects('strict-existing')
        expect_reject(op('strict-existing','bad-snapshot:'+str(index),3,'finalize',payload))
        assert effects('strict-existing')==before
    # Omission is compatibility, not explicit null metadata. Unknown additive
    # fields are retained; incomplete valid legacy strength is snapshot-only.
    legacy={'id':'legacy-valid','exercise':'Bench','weightLbs':'0','reps':'0','extraFuture':{'raw':True}}
    incomplete={'id':'legacy-incomplete','exercise':'Bench','weightLbs':None,'reps':''}
    cardio_zero={'id':'cardio-zero','exercise':'Run','isCardio':True,'isRest':False,'set':0,
        'durationMins':0,'distance':0,'heartRate':0,'calories':0,'level':0,
        'weightLbs':None,'reps':None,'distanceUnit':'meters'}
    planned=dict(row,id='planned-valid',performance='planned',plannedTarget={'reps':'','weightLbs':''})
    controls=[legacy,incomplete,cardio_zero,planned]
    payload=dict(valid_payload,rows=controls,logRows=[legacy,cardio_zero],reflection='',
        review={'rating':5,'strengths':['Zero preserved'],'weakness':'','nextSessionNote':'','generatedAt':0})
    sql(auth(op('strict-controls','final:1',1,'finalize',payload)))
    assert json.loads(sql("SELECT rows_json FROM workouts WHERE id='strict-controls';"))==controls
    assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='strict-controls';")=='2'
    # Missing/duplicate log projections must not acknowledge an inconsistent snapshot.
    expect_reject(op('missing-log','final:1',1,'finalize',{'dateISO':'2026-10-08','part':'Push','createdAt':1,'rows':[row],'logRows':[]}))
    expect_reject(op('duplicate-log','final:1',1,'finalize',{'dateISO':'2026-10-08','part':'Push','createdAt':1,'rows':[row],'logRows':[row,row]}))
    # First tracer bullet: real distinct rows and idempotent retry.
    sql(auth(put())); sql(auth(put())); sql(auth(put(rid='r2')))
    assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='s1';") == '2'
    expect_reject(put(),OTHER)
    assert sql(auth("SELECT count(*) FROM workout_operation_sessions WHERE session_id='s1';", OTHER)).splitlines()[-1]=='0'
    expect_reject("UPDATE workout_operation_sessions SET state='open' WHERE session_id='s1';")
    expect_reject("SELECT public.save_workout('bypass','2026-10-08','Push',1,'[]'::jsonb);")
    expect_reject(put(key='put:r1:1').replace('100','200'))
    sql(auth(final(rows=[row])))
    assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='s1';") == '1'
    expect_reject(put(rid='late'))
    expect_reject(put(rid='r2',revision=3))
    sql(auth(final(rows=[row])))
    # Same date does not confer ownership; preserve raw legacy evidence.
    sql("INSERT INTO workout_log(user_id,workout_id,workout_date,exercise,set_number,weight_lbs,reps,notes) VALUES ('%s','live-2026-10-08','2026-10-08','Raw',1,'NaN','bad','untouched');" % OWNER)
    sql(auth(put(session='s2')))
    sql(auth(final(session='s1',rows=[],revision=3)))
    assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='s2';") == '1'
    assert sql("SELECT notes FROM workout_log WHERE exercise='Raw';") == 'untouched'
    # Inject a real PR reconcile failure: snapshot/log/receipt/state all roll back.
    sql("CREATE OR REPLACE FUNCTION public.reconcile_workout_prs(p_user_id uuid,p_date text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;")
    pr_before = sql("SELECT row_to_json(p)::text FROM pr_lifts p;")
    expect_reject(final(session='s2', rows=[dict(row,weightLbs='200')]))
    assert sql("SELECT row_to_json(p)::text FROM pr_lifts p;")==pr_before
    assert sql("SELECT count(*) FROM workout_operation_receipts WHERE session_id='s2' AND operation_key='final:2';")=='0'
    assert sql("SELECT state FROM workout_operation_sessions WHERE session_id='s2';") == 'open'
    assert sql("SELECT count(*) FROM workouts WHERE id='s2';") == '0'
    assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='s2';") == '1'
    sql('\\ir '+str(ROOT/'supabase/migrations/20261008000100_in_session_numeric_integrity.sql'))
    # Actual insert/delete errors after snapshot upsert must roll everything back.
    sql("CREATE FUNCTION public.p4_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='INSERT' AND NEW.p4_session_id='fail-insert' THEN RAISE EXCEPTION 'insert failure'; END IF; IF TG_OP='DELETE' AND OLD.p4_session_id='fail-delete' THEN RAISE EXCEPTION 'delete failure'; END IF; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;")
    for stage in ['insert','delete']:
        sid='fail-'+stage
        sql(auth(put(session=sid)))
        sql("CREATE TRIGGER p4_fixture_fail BEFORE INSERT OR DELETE ON workout_log FOR EACH ROW EXECUTE FUNCTION p4_fixture_fail();")
        expect_reject(final(session=sid,rows=[dict(row,weightLbs='200')]))
        assert sql("SELECT count(*) FROM workouts WHERE id='%s';" % sid)=='0'
        assert sql("SELECT state FROM workout_operation_sessions WHERE session_id='%s';" % sid)=='open'
        assert sql("SELECT weight_lbs FROM workout_log WHERE p4_session_id='%s';" % sid)=='100'
        assert sql("SELECT count(*) FROM workout_operation_receipts WHERE session_id='%s' AND operation_key='final:2';" % sid)=='0'
        sql('DROP TRIGGER p4_fixture_fail ON workout_log;')
    # Deterministic barriers: controller holds session row; waiter must be in pg_locks.
    for first_kind in ['live','final']:
        sid='race-'+first_kind
        sql(auth(put(session=sid)))
        controller=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        assert controller.stdin is not None and controller.stderr is not None
        controller.stdin.write("SET request.jwt.claim.sub = '%s'; BEGIN; SELECT session_id FROM workout_operation_sessions WHERE session_id='%s' FOR UPDATE;\n" % (OWNER,sid)); controller.stdin.flush()
        # Wait for controller transaction lock using pg_stat_activity, not guessed sleeps.
        deadline=time.monotonic()+5
        while sql("SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%FOR UPDATE%';") != '1':
            assert time.monotonic()<deadline; time.sleep(.02)
        pending=final(session=sid) if first_kind=='live' else put(session=sid,rid='late')
        waiter=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        assert waiter.stdin is not None and waiter.stderr is not None
        waiter.stdin.write(auth(pending)+'\n'); waiter.stdin.close()
        deadline=time.monotonic()+5
        while sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%apply_workout_operation%';") != '1':
            assert time.monotonic()<deadline; time.sleep(.02)
        action=put(session=sid,rid='before') if first_kind=='live' else final(session=sid)
        controller.stdin.write(action+'\nCOMMIT;\n'); controller.stdin.close()
        controller.wait(timeout=5); waiter.wait(timeout=5)
        assert controller.returncode==0,controller.stderr.read()
        assert waiter.returncode==(0 if first_kind=='live' else 3),waiter.stderr.read()
        assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='%s';" % sid)=='1'
        assert sql("SELECT state FROM workout_operation_sessions WHERE session_id='%s';" % sid)=='finalized'
    # Live-edit/Clear/abandon barriers: late old puts must really wait on the
    # session lock, then lose to a correction, permanent row or session fence.
    for fence in ['revise','clear','abandon']:
        sid='delivery-race-'+fence
        sql(auth(put(session=sid)))
        controller=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        controller.stdin.write("SET request.jwt.claim.sub = '%s'; BEGIN; SELECT session_id FROM workout_operation_sessions WHERE session_id='%s' FOR UPDATE;\n" % (OWNER,sid)); controller.stdin.flush()
        deadline=time.monotonic()+5
        while sql("SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%FOR UPDATE%';")!='1':
            assert time.monotonic()<deadline; time.sleep(.02)
        waiter=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        waiter.stdin.write(auth(put(session=sid,key='delayed:1'))+'\n'); waiter.stdin.close()
        deadline=time.monotonic()+5
        while sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%apply_workout_operation%';")!='1':
            assert time.monotonic()<deadline; time.sleep(.02)
        correction=dict(row,reps='',performance='planned')
        action=op(sid,'revise:2',2,'revise',{'dateISO':'2026-10-08','row':correction},'r1') if fence=='revise' else (
            op(sid,'drop:2',2,'drop',{'dateISO':'2026-10-08'},'r1') if fence=='clear' else op(sid,'delete:2',2,'delete',{}))
        controller.stdin.write(action+'\nCOMMIT;\n'); controller.stdin.close()
        controller.wait(timeout=5); waiter.wait(timeout=5)
        assert controller.returncode==0,controller.stderr.read()
        assert waiter.returncode==3,waiter.stderr.read()
        assert sql("SELECT count(*) FROM workout_log WHERE p4_session_id='%s';" % sid)=='0'
        if fence=='revise':
            sql(auth(put(session=sid,revision=3)))
            assert sql("SELECT deleted FROM workout_operation_rows WHERE session_id='%s' AND row_id='r1';" % sid)=='f'
        elif fence=='clear':
            sql(auth(put(session=sid,rid='later',revision=3)))
            assert sql("SELECT p4_row_id FROM workout_log WHERE p4_session_id='%s';" % sid)=='later'
        else:
            expect_reject(put(session=sid,rid='new',revision=3))
            sql(auth(put(session=sid+'-new')))
    # Direct revise must validate before changes and exact replay is idempotent.
    sql(auth(put(session='revise-validating')))
    for index,bad in enumerate(invalid_rows):
        before=effects('revise-validating')
        expect_reject(op('revise-validating','bad-revise:'+str(index),4,'revise',{'dateISO':'2026-10-08','row':bad},'r1').replace('Infinity','1e400'))
        assert effects('revise-validating')==before
    valid_revise=op('revise-validating','revise:2',2,'revise',{'dateISO':'2026-10-08','row':dict(row,reps='',performance='planned')},'r1')
    sql(auth(valid_revise)); before=effects('revise-validating'); sql(auth(valid_revise))
    assert effects('revise-validating')==before
    print(json.dumps({'deliveryLockBarriers':3,'invalidReviseNoEffects':len(invalid_rows)}))
    # Row deletion arriving before its first live put must allocate a tombstone.
    sql(auth(op('delete-before-put','drop:r1:2',2,'drop',{'dateISO':'2026-10-08'},'r1')))
    expect_reject(put(session='delete-before-put'))
    # Deleted sessions cannot be resurrected by new keys or retry.
    sql(auth(op('s2','delete:4',4,'delete',{})))
    sql(auth(op('s2','delete:4',4,'delete',{})))
    expect_reject(put(session='s2',rid='late'))
    expect_reject(final(session='s2',revision=5))
    assert sql("SELECT count(*) FROM workouts WHERE id='s2';")=='0'
    # Permanent deletion must also work after a valid maximum final revision.
    sql(auth(final(session='max-revision',revision=9007199254740991)))
    terminal_delete=op('max-revision','delete:max-revision:terminal:v1',9007199254740991,'delete',{})
    sql(auth(terminal_delete)); sql(auth(terminal_delete))
    assert sql("SELECT state FROM workout_operation_sessions WHERE session_id='max-revision';")=='deleted'
    # Whole explicit transaction rollback and absence readback.
    sql(auth('BEGIN;'+put(session='rollback')+'ROLLBACK;'))
    assert sql("SELECT count(*) FROM workout_operation_sessions WHERE session_id='rollback';")=='0'
    receipt={'deliveryLockBarriers':3,'invalidReviseNoEffects':len(invalid_rows),'directInvalidRowRejections':len(invalid_rows)*2,'invalidSnapshotNoEffects':len(invalid_snapshots),'legacyCompatibleControlRows':len(controls),'maxRevisionTerminalDelete':True,'distinctRows':True,'retryIdempotent':True,'crossUserRejected':True,'operationKeyPayloadConflictRejected':True,'twoSameDaySessionsIsolated':True,'legacyRawPreserved':True,'finalExclusionTombstone':True,'lateCommitOrders':2,'prFailureRollback':True,'insertDeleteFailureRollback':True,'p4SessionRlsAndBypassRejection':True,'sessionDeletionTombstone':True,'transactionRollback':True,'tcpDisabled':True,'fixture':'minimal actual PR/numeric dependencies, not full schema/RLS'}
    (BASE/'receipt.json').write_text(json.dumps(receipt,indent=2)); print(json.dumps(receipt)); print('evidence='+str(BASE))
finally:
    if started:
        subprocess.run([str(BIN/'pg_ctl'),'-D',str(DATA),'-m','fast','-w','stop'],check=True,capture_output=True)
        assert not (DATA/'postmaster.pid').exists()
        status=subprocess.run([str(BIN/'pg_ctl'),'-D',str(DATA),'status'],capture_output=True,text=True)
        assert status.returncode==3,status.stdout+status.stderr
        print('shutdown_verified='+str(BASE))
