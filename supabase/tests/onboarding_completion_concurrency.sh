#!/usr/bin/env bash
# Requires the atomic onboarding migration already applied to a disposable Supabase DB.
# Supply a postgres connection explicitly; this script never reads credential files.
set +x
set -euo pipefail
if [[ -z ${ONBOARDING_TEST_DATABASE_URL:-} || ${ONBOARDING_TEST_CONFIRM_DISPOSABLE:-} != YES ]]; then
    echo 'Require ONBOARDING_TEST_DATABASE_URL and ONBOARDING_TEST_CONFIRM_DISPOSABLE=YES.' >&2
    exit 1
fi
command -v psql >/dev/null
export PGDATABASE="$ONBOARDING_TEST_DATABASE_URL" PGPASSFILE=/dev/null
unset PGSERVICE PGSERVICEFILE
work=$(mktemp -d)
pids=()
owned=0
users=(b7090900-0000-4000-8000-000000000001 b7090900-0000-4000-8000-000000000002 b7090900-0000-4000-8000-000000000003 b7090900-0000-4000-8000-000000000004)
user_list="'${users[0]}','${users[1]}','${users[2]}','${users[3]}'"
db() { psql -X -w -qAt -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
    rc=$?
    trap - EXIT
    for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
    if [[ $owned == 1 ]]; then
        if ! db -c "DELETE FROM auth.users WHERE id IN ($user_list)" >"$work/cleanup" 2>&1; then
            echo 'Fixture cleanup failed; remove only the four UUIDs declared in this script.' >&2
            rc=1
        fi
    fi
    rm -rf "$work"
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { echo "FAIL: $*" >&2; exit 1; }
# Suppress connection diagnostics: a driver error could contain connection details.
if ! db >"$work/preflight" 2>&1 <<SQL
SELECT to_regprocedure('public.complete_onboarding_atomic(uuid,jsonb)') IS NOT NULL
    AND NOT EXISTS (SELECT FROM auth.users WHERE id IN ($user_list))
    AND NOT EXISTS (SELECT FROM public.profiles WHERE user_id IN ($user_list));
SQL
then fail 'database preflight failed'; fi
[[ $(cat "$work/preflight") == t ]] || fail 'migration missing or fixture UUID already exists'
# A transaction makes fixture creation all-or-nothing. Lock/recheck protects cleanup ownership.
if ! db >"$work/setup" 2>&1 <<SQL
BEGIN;
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
SELECT NOT EXISTS (SELECT FROM auth.users WHERE id IN ($user_list)) AS vacant \gset
\if :vacant
INSERT INTO auth.users(id,aud,role,email)
SELECT id::uuid,'authenticated','authenticated',id || '@onboarding-concurrency.invalid'
FROM unnest(ARRAY[$user_list]) AS fixture(id);
INSERT INTO public.profiles(user_id) SELECT id FROM auth.users WHERE id IN ($user_list)
ON CONFLICT (user_id) DO NOTHING;
COMMIT;
\else
ROLLBACK;
\quit 1
\endif
SQL
then fail 'fixture setup failed'; fi
owned=1
snapshot_others() {
    db -c "SELECT jsonb_agg(row_data ORDER BY table_name,row_data::text)::text FROM (
      SELECT 'profile' table_name,to_jsonb(t) row_data FROM public.profiles t WHERE user_id IN ($user_list) AND user_id <> '$1'
      UNION ALL SELECT 'tracked',to_jsonb(t) FROM public.pr_tracked_lifts t WHERE user_id IN ($user_list) AND user_id <> '$1'
      UNION ALL SELECT 'pr',to_jsonb(t) FROM public.pr_lifts t WHERE user_id IN ($user_list) AND user_id <> '$1'
      UNION ALL SELECT 'template',to_jsonb(t) FROM public.workout_templates t WHERE user_id IN ($user_list) AND user_id <> '$1'
      UNION ALL SELECT 'item',to_jsonb(t) FROM public.workout_template_items t WHERE user_id IN ($user_list) AND user_id <> '$1'
      UNION ALL SELECT 'receipt',to_jsonb(t) FROM public.onboarding_receipts t WHERE user_id IN ($user_list) AND user_id <> '$1'
    ) snapshots;"
}
worker() {
    local app=$1 uid=$2 rid=$3 weight=$4
    PGAPPNAME="$app" exec psql -X -w -qAt -v ON_ERROR_STOP=1 <<SQL
\set VERBOSITY terse
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL request.jwt.claim.sub = '$uid';
SET LOCAL request.jwt.claims = '{"sub":"$uid","role":"authenticated"}';
SET LOCAL ROLE authenticated;
SELECT public.complete_onboarding_atomic($rid, '{"profile":{},"tracked_lifts":["Bench Press"],"pr_values":[{"lift_name":"Bench Press","weight_lbs":$weight,"reps":5}],"workout_templates":[{"name":"Race","items":[{"lift_name":"Bench Press","target_sets":3,"target_reps":5}]}]}'::jsonb);
RESET ROLE;
COMMIT;
SQL
}
# Poll database evidence with a deadline, never release based on elapsed sleep alone.
await_true() {
    local query=$1 deadline=$((SECONDS + 20)) value
    while (( SECONDS < deadline )); do
        value=$(db -c "$query" 2>"$work/poll-error") || fail 'barrier query failed'
        [[ $value == t ]] && return
        sleep 0.05
    done
    fail 'timed out waiting for advisory-lock barrier'
}
for scenario in 0 1 2 3; do
    uid=${users[$scenario]}
    snapshot_others "$uid" >"$work/before" 2>"$work/snapshot-error" || fail 'snapshot failed'
    rid1="'a7090900-0000-4000-8000-000000000001'::uuid"
    rid2=$rid1
    weight=200.00
    expected=''
    case $scenario in
        1) weight=201; expected='request ID payload conflict' ;;
        2) rid2="'a7090900-0000-4000-8000-000000000002'::uuid"; expected='onboarding already completed; ambiguous new request' ;;
        3) rid1=NULL; rid2=NULL ;;
    esac
    blocker="onboarding-blocker-$$-$scenario"
    app1="onboarding-worker-$$-$scenario-1"
    app2="onboarding-worker-$$-$scenario-2"
    mkfifo "$work/barrier-$scenario"
    exec 3<>"$work/barrier-$scenario"
    PGAPPNAME="$blocker" psql -X -w -qAt -v ON_ERROR_STOP=1 <"$work/barrier-$scenario" >"$work/blocker-$scenario" 2>&1 &
    bp=$!; pids+=("$bp")
    printf "BEGIN;\nSET LOCAL idle_in_transaction_session_timeout = '30s';\nSELECT pg_advisory_xact_lock(hashtextextended('complete_onboarding_atomic:%s',0));\n" "$uid" >&3
    await_true "SELECT EXISTS (SELECT FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name='$blocker' AND l.locktype='advisory' AND l.granted)"
    worker "$app1" "$uid" "$rid1" 200 >"$work/result1" 2>"$work/error1" &
    p1=$!; pids+=("$p1")
    worker "$app2" "$uid" "$rid2" "$weight" >"$work/result2" 2>"$work/error2" &
    p2=$!; pids+=("$p2")
    await_true "SELECT count(*)=2 FROM pg_stat_activity a WHERE a.application_name IN ('$app1','$app2') AND a.wait_event='advisory' AND EXISTS (SELECT FROM pg_stat_activity b WHERE b.application_name='$blocker' AND b.pid=ANY(pg_blocking_pids(a.pid)))"
    printf 'COMMIT;\n\\quit\n' >&3
    exec 3>&-
    wait "$bp" || fail 'blocker failed'
    r1=0; r2=0
    wait "$p1" || r1=$?
    wait "$p2" || r2=$?
    pids=()
    if [[ -z $expected ]]; then
        [[ $r1 == 0 && $r2 == 0 ]] || fail "scenario $scenario: expected two successes"
        cmp -s "$work/result1" "$work/result2" || fail 'replay results differ'
        winner="$work/result1"
    else
        if [[ $r1 == 0 && $r2 != 0 ]]; then loser="$work/error2"; winner="$work/result1"
        elif [[ $r2 == 0 && $r1 != 0 ]]; then loser="$work/error1"; winner="$work/result2"
        else fail "scenario $scenario: expected exactly one success"; fi
        [[ $(cat "$loser") == "ERROR:  $expected" ]] || fail 'unexpected rejection diagnostic'
    fi
    if ! db >"$work/assertion" 2>"$work/assertion-error" <<SQL
SELECT (SELECT count(*)=1 AND bool_and(onboarding_completed) FROM public.profiles WHERE user_id='$uid')
 AND (SELECT count(*)=1 FROM public.onboarding_receipts WHERE user_id='$uid')
 AND (SELECT count(*)=1 FROM public.pr_tracked_lifts WHERE user_id='$uid' AND is_active)
 AND (SELECT count(*)=1 FROM public.pr_tracked_lifts WHERE user_id='$uid')
 AND (SELECT count(*)=1 FROM public.pr_lifts WHERE user_id='$uid')
 AND (SELECT count(*)=1 FROM public.workout_templates WHERE user_id='$uid')
 AND (SELECT count(*)=1 FROM public.workout_template_items WHERE user_id='$uid');
SQL
    then fail 'readback failed'; fi
    [[ $(cat "$work/assertion") == t ]] || fail 'domain application counts/completion incorrect'
    db -c "SELECT result FROM public.onboarding_receipts WHERE user_id='$uid'" >"$work/receipt" 2>"$work/receipt-error" || fail 'receipt readback failed'
    cmp -s "$winner" "$work/receipt" || fail 'result differs from receipt'
    snapshot_others "$uid" >"$work/after" 2>"$work/snapshot-error" || fail 'snapshot failed'
    cmp -s "$work/before" "$work/after" || fail 'cross-user writes detected'
    echo "PASS: concurrency scenario $scenario"
done
