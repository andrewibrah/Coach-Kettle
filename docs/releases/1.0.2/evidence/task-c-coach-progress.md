# Package C atomic Coach persistence checkpoint

## Completed locally (not all package C; not deployed)
- Resumed exact interrupted files: existing checkpoint plus one failing atomic-RPC handler test; no atomic migration. Preserved all unrelated dirty work.
- Reproduced handler RED (23/24 passed; expected one persistence RPC, got zero). Disposable --red fails on absent RPC and cleans up its own cluster.
- Read actual 0033/0034/0042/0044 and current narrative/state algorithm. New `20260919000100_atomic_coach_persistence.sql` has service-role-only EXECUTE, fixed pg_catalog/public search_path, trusted Edge owner argument, and per-user transaction advisory lock across dates.
- Current-day optional summary + event upsert + locked 90-day inclusive state derivation + final report write are one transaction. No caller-precomputed state fields sent. Existing narrative depends only on evidence, not tone/streak; SQL supplies committed state/tone.
- Historical report read precedes live totals/workout/target queries. Historical backfill verifies full saved matching-owner/date JSON snapshot under lock, requires complete positive targets, never writes summary/event/state, and inserts only if absent. Server calendar guard uses current timezone and clock_timestamp AFTER lock to reject rollover/new future writes; existing historical report wins.
- Handler errors do not expose SQL details in responses or logs.

## Verification
- `node --experimental-strip-types --test supabase/functions/*/*.test.ts`: **210/210 pass**. Actual Coach handler/narrative subset: **27/27 pass**. Old separate-write/read failure assertions replaced with the new single atomic-RPC failure transport contract; DB fault tests cover transaction operations.
- Cached Deno `check --no-lock --cached-only supabase/functions/daily-feedback/index.ts` passes.
- `NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/coach_disposable.sh`: PASS on local PG15, private mktemp Unix socket, no TCP, scrubbed PG environment; owned cluster PID/socket absent and directory removed after execution.
- SQL regression forces a final-report trigger fault after summary/event/state writes and compares every existing row in all four tables byte-for-byte after rollback. Tests real service/authenticated roles, anon ACL, payload-owner spoof isolation, historical mismatch/immutability, rollover guard and original state algorithm including neutral/recalibration/gaps/90-day window.
- Real concurrent sessions observe advisory-lock waiters: same-day generations stay coherent; historical creators insert once while concurrent today request blocks on the same USER lock across dates.
- Output artifacts: `task-c-coach-pg15.txt`, `task-c-coach-backend-tests.txt` in this evidence directory.

## Limits / handoff
- GitNexus impact attempted for generateFeedback/updateBehaviorState and new RPC: DB43/runtime42 mismatch; UNKNOWN unresolved, NOT zero impact. Text corroboration identifies handler GET/POST callers and handler/narrative tests. No graph rebuild or commit.
- Minimal PG15 bootstrap uses actual nutrition/coaching migrations with a minimal notification_preferences table. This is NOT full Supabase17 migration/PostgREST proof and NOT deployed verification.
- No commits, deployments, production DB access, external coding CLI, or other workers.
- Changed handler/index and handler.test; added migration and three `supabase/tests/coach_*` SQL/disposable/concurrency files plus this evidence. Current tests retain existing module-type Node warnings.
