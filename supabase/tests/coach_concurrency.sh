#!/bin/bash
# Runs ONLY inside coach_disposable.sh's private cluster.
set -euo pipefail
[[ ${PGHOST:-} == /tmp/ck-coach.*/socket ]] || exit 2
PSQL=(/opt/homebrew/opt/postgresql@15/bin/psql -X -w -v ON_ERROR_STOP=1)
# A holds the per-user transaction lock after all writes. B must wait,
# rather than mixing its summary/event with A's report/state.
"${PSQL[@]}" -c "BEGIN; SELECT coach_fixture('00000000-0000-0000-0000-000000000001','concurrent-A'); SELECT pg_sleep(3); COMMIT;" >/dev/null &
a=$!
for i in {1..100}; do
 held=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted")
 [[ $held != 0 ]] && break
 sleep .02
done
[[ $held != 0 ]] || { wait "$a"; exit 1; }
"${PSQL[@]}" -c "SELECT coach_fixture('00000000-0000-0000-0000-000000000001','concurrent-B');" >/dev/null &
b=$!
waiting=0
for i in {1..100}; do
 waiting=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")
 [[ $waiting != 0 ]] && break
 sleep .02
done
wait "$a"; wait "$b"
[[ $waiting != 0 ]] || { printf 'No lock contention observed
'; exit 1; }
"${PSQL[@]}" <<'SQL'
DO $$ BEGIN
 ASSERT (SELECT gap_summary->>'marker'='concurrent-B' FROM daily_nutrition_summaries WHERE summary_date=current_date AND user_id='00000000-0000-0000-0000-000000000001');
 ASSERT (SELECT payload->>'marker'='concurrent-B' FROM behavior_events WHERE event_date=current_date AND user_id='00000000-0000-0000-0000-000000000001');
 ASSERT (SELECT did_well='concurrent-B' AND streak_days=1 AND harshness_level=0 FROM daily_feedback WHERE feedback_date=current_date AND user_id='00000000-0000-0000-0000-000000000001');
 ASSERT (SELECT consecutive_good_days=1 AND harshness_level=0 FROM behavior_state WHERE user_id='00000000-0000-0000-0000-000000000001');
END $$;
SELECT 'Concurrent generations blocked on per-user lock; final four-table generation coherent PASS';
SQL

# Historical creators and today's regeneration share the same user lock.
"${PSQL[@]}" -c "INSERT INTO daily_nutrition_summaries(user_id,summary_date,calorie_target,protein_target,carb_target,fat_target) VALUES('00000000-0000-0000-0000-000000000001',current_date-2,2000,100,200,60);" >/dev/null
history="SELECT coach_fixture('00000000-0000-0000-0000-000000000001','history-winner',current_date-2,true,(SELECT to_jsonb(s) FROM daily_nutrition_summaries s WHERE user_id='00000000-0000-0000-0000-000000000001' AND summary_date=current_date-2));"
"${PSQL[@]}" -c "BEGIN; $history SELECT pg_sleep(3); COMMIT;" >/dev/null &
a=$!
for i in {1..100}; do
 held=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted")
 [[ $held != 0 ]] && break
 sleep .02
done
[[ $held != 0 ]] || { wait "$a"; exit 1; }
"${PSQL[@]}" -c "SELECT coach_fixture('00000000-0000-0000-0000-000000000001','history-loser',current_date-2,true,NULL);" >/dev/null &
b=$!
"${PSQL[@]}" -c "SELECT coach_fixture('00000000-0000-0000-0000-000000000001','cross-date-today');" >/dev/null &
c=$!
for i in {1..100}; do
 waiting=$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted")
 [[ $waiting == 2 ]] && break
 sleep .02
done
wait "$a"; wait "$b"; wait "$c"
[[ $waiting == 2 ]] || exit 1
"${PSQL[@]}" <<'SQL'
DO $$ BEGIN
 ASSERT (SELECT did_well='history-winner' FROM daily_feedback WHERE feedback_date=current_date-2);
 ASSERT (SELECT gap_summary IS NULL FROM daily_nutrition_summaries WHERE summary_date=current_date-2);
 ASSERT NOT EXISTS(SELECT FROM behavior_events WHERE event_date=current_date-2);
 ASSERT (SELECT did_well='cross-date-today' AND streak_days=1 FROM daily_feedback WHERE feedback_date=current_date AND user_id='00000000-0000-0000-0000-000000000001');
 ASSERT (SELECT last_evaluated_date=current_date AND consecutive_good_days=1 FROM behavior_state WHERE user_id='00000000-0000-0000-0000-000000000001');
END $$;
SELECT 'Concurrent historical creators insert once; cross-date user lock observed PASS';
SQL
