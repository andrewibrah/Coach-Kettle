#!/bin/bash
# Only the private scrubbed cluster owned by meal_plan_disposable.sh.
set -euo pipefail
[[ ${NUTRITION_DISPOSABLE_TEST:-} == YES && ${PGHOST:-} == /tmp/ck-meal.*/socket ]] || exit 2
PSQL=(/opt/homebrew/opt/postgresql@15/bin/psql -X -w -v ON_ERROR_STOP=1)
# Existing writer test leaves complete generation B. Hold replacement C open.
PGAPPNAME=meal_read_writer "${PSQL[@]}" <<'SQL' &
BEGIN;
SELECT public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',snapshot || '{"test_revision":"C"}',(SELECT jsonb_agg(value || '{"title":"Concurrent C"}') FROM jsonb_array_elements(meals)),'concurrent C')->>'meals_inserted' FROM public.meal_test_fixture;
SELECT pg_sleep(2);
COMMIT;
SQL
writer=$!
ready=f
for ((i=0;i<100;i++)); do
 ready=$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='meal_read_writer' AND wait_event='PgSleep')")
 [[ $ready == t ]] && break
 sleep 0.02
done
[[ $ready == t ]] || { printf 'ERROR writer barrier missing\n' >&2; exit 1; }
# Read while C is uncommitted and across its commit. Every complete snapshot,
# notes and all 28 unique children must agree, despite an unchanged parent ID.
"${PSQL[@]}" <<'SQL'
SET ROLE service_role;
DO $$ DECLARE r jsonb; rev text; old_id text; saw_b boolean:=false; saw_c boolean:=false; BEGIN
 FOR i IN 1..300 LOOP
  r := public.read_meal_plan('11111111-1111-4111-8111-111111111111');
  rev := r->'plan'->'targets_snapshot'->>'test_revision';
  ASSERT rev IN ('B','C');
  ASSERT r->'plan'->>'notes'='concurrent '||rev;
  ASSERT jsonb_array_length(r->'meals')=28;
  ASSERT (SELECT count(DISTINCT (value->>'day_of_week',value->>'meal_slot'))=28 FROM jsonb_array_elements(r->'meals'));
  ASSERT (SELECT bool_and(value->>'title'='Concurrent '||rev AND value->>'plan_id'=r->'plan'->>'id' AND value->>'user_id'=r->'plan'->>'user_id') FROM jsonb_array_elements(r->'meals')), 'mixed generation';
  ASSERT (SELECT bool_and((value->>'sort_order')::int=ord-1) FROM jsonb_array_elements(r->'meals') WITH ORDINALITY m(value,ord));
  IF old_id IS NULL THEN old_id := r->'plan'->>'id'; END IF;
  ASSERT old_id=r->'plan'->>'id';
  saw_b := saw_b OR rev='B'; saw_c := saw_c OR rev='C';
  PERFORM pg_sleep(0.01);
 END LOOP;
 ASSERT saw_b AND saw_c, 'must observe both sides of concurrent commit';
END $$;
RESET ROLE;
\echo 'PASS 300 concurrent coherent reads: observed B and C; unchanged parent ID, snapshot/notes/28 unique ordered owned children agree'
SQL
wait "$writer"
