#!/bin/bash
# Called only inside meal_plan_disposable.sh's scrubbed private cluster.
set -euo pipefail
[[ ${NUTRITION_DISPOSABLE_TEST:-} == YES && ${PGHOST:-} == /tmp/ck-meal.*/socket ]] || exit 2
PSQL=(/opt/homebrew/opt/postgresql@15/bin/psql -X -w -v ON_ERROR_STOP=1)
# Exercise locking for a previously nonexistent parent, not just a row lock.
"${PSQL[@]}" -c "DELETE FROM public.meal_plans WHERE user_id='11111111-1111-4111-8111-111111111111'"
PGAPPNAME=meal_test_A "${PSQL[@]}" <<'SQL' &
BEGIN;
SELECT public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',snapshot || '{"test_revision":"A"}',(SELECT jsonb_agg(value || '{"title":"Concurrent A"}') FROM jsonb_array_elements(meals)),'concurrent A')->>'meals_inserted' FROM public.meal_test_fixture;
SELECT pg_sleep(5);
COMMIT;
SQL
first=$!
# B starts only after A holds the transaction lock and is sleeping.
ready=f
for ((i=0;i<100;i++)); do
  ready=$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='meal_test_A' AND wait_event='PgSleep')")
  [[ $ready == t ]] && break
  sleep 0.02
done
[[ $ready == t ]] || { printf 'ERROR A did not reach lock barrier\n' >&2; exit 1; }
PGAPPNAME=meal_test_B "${PSQL[@]}" <<'SQL' &
SELECT public.replace_meal_plan('11111111-1111-4111-8111-111111111111','2026-09-13',snapshot || '{"test_revision":"B"}',(SELECT jsonb_agg(value || '{"title":"Concurrent B"}') FROM jsonb_array_elements(meals)),'concurrent B')->>'meals_inserted' FROM public.meal_test_fixture;
SQL
second=$!
blocked=f
for ((i=0;i<100;i++)); do
  blocked=$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM pg_stat_activity a, pg_stat_activity b WHERE a.application_name='meal_test_A' AND b.application_name='meal_test_B' AND b.wait_event='advisory' AND a.pid=ANY(pg_blocking_pids(b.pid)))")
  [[ $blocked == t ]] && break
  sleep 0.02
done
[[ $blocked == t ]] || { printf 'ERROR B did not block on A advisory lock\n' >&2; exit 1; }
printf 'Observed B waiting on A per-owner/week advisory lock\n'
wait "$first"
wait "$second"
"${PSQL[@]}" <<'SQL'
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.meal_plans WHERE user_id='11111111-1111-4111-8111-111111111111')=1;
 ASSERT (SELECT count(*) FROM public.planned_meals WHERE user_id='11111111-1111-4111-8111-111111111111')=28;
 ASSERT (SELECT count(DISTINCT (day_of_week,meal_slot)) FROM public.planned_meals WHERE user_id='11111111-1111-4111-8111-111111111111')=28;
 ASSERT (SELECT notes='concurrent B' AND targets_snapshot->>'test_revision'='B' FROM public.meal_plans WHERE user_id='11111111-1111-4111-8111-111111111111');
 ASSERT (SELECT bool_and(title='Concurrent B') FROM public.planned_meals WHERE user_id='11111111-1111-4111-8111-111111111111'), 'mixed generation children';
 ASSERT (SELECT notes FROM public.meal_plans WHERE user_id='22222222-2222-4222-8222-222222222222')='other owner';
END $$;
\echo 'PASS concurrent replacements: advisory blocking, one new parent, complete B snapshot/notes/28 unique children, other owner unchanged'
SQL
