# Task C backend native closeout checkpoint

## Status / scope
Local backend verification complete for this bounded resume; **Task C is not declared done**. Parent spec/quality acceptance, client/device checks, and authorized deployed/PostgREST/provider gates remain open. No Codex, external agent, commit, deployment, live provider request or production DB access. Existing dirty work preserved. Approved resolver and target-save SQL were not rewritten.

## Changes in this resume
- `supabase/functions/daily-feedback/index.ts`: fixed ignored profile/timezone query errors, summary write error, behavior-state write/read errors. Reject impossible ISO calendar dates before DB queries. Regression tests first reproduced erroneous success (200 instead of 500), or invalid-date queries (409/500 instead of 400).
- `supabase/functions/daily-feedback/handler.test.ts`: expanded actual handler VM coverage for all relevant read/write errors, invalid dates, authoritative weekday override, immutable historical report/snapshot behavior, no-food evidence, and verified ownership.
- `supabase/functions/meal-plan/handler.test.ts`: added provider network/truncation/invalid-week failures, owner-scoped per-date override/training recalibration, DB read failures, missing targets, and RPC failure. Existing auth, entitlement, unsupported allergies, timeout, byte bounds, invalid JSON/totals and GET error tests retained.
- `supabase/tests/meal_plan_replacement.sql`: execute RPC as service role, execute rejected authenticated cross-user/anonymous calls, malformed payload rejection with unchanged rows; late failure now attempts a changed snapshot as well as notes and children.
- `supabase/tests/meal_plan_concurrency.sh`: deterministic barrier via pg_stat_activity; observe B blocked on A's advisory lock for a previously nonexistent parent. Assert complete winning B snapshot/notes/28 unique children, no mixed generation, other owner unchanged.
- This checkpoint.

Unchanged but read/exercised: meal-plan handler implementation, pure validator, shared target loader, narrative tests, atomic migration `20260914000200_atomic_meal_plan_replacement.sql`, and disposable PG runner.

## Exact local verification

```sh
node --experimental-strip-types --test supabase/functions/meal-plan/handler.test.ts supabase/functions/meal-plan/validation.test.ts supabase/functions/daily-feedback/handler.test.ts supabase/functions/daily-feedback/narrative.test.ts
```

Actual final summary (full log `/tmp/ck-c-backend-tests.log`):

```text
ℹ tests 187
ℹ suites 0
ℹ pass 187
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 628.690792
```

The VM executes actual Edge handlers and shared resolver/validator code, replacing clock/auth/database/provider transport with explicit synthetic fixtures. This is **not** live API/PostgREST proof. The provider429 case is simulated; no actual provider throttling occurred. Node emits the existing MODULE_TYPELESS_PACKAGE_JSON warning; package metadata was not changed.

```sh
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/meal_plan_disposable.sh --red
```
Exit 3 as expected without migration (`replace_meal_plan` does not exist). Cleanup succeeded. Log `/tmp/ck-c-meal-pg-red.log`.

```sh
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/meal_plan_disposable.sh
```
Exit 0 on real local **PostgreSQL 15.14 (Homebrew)**. Fresh private `/tmp/ck-meal.*` cluster, scrubbed inherited PG variables and credential/service files, private Unix socket, SQL assertion `listen_addresses = ''` (no TCP). Actual log `/tmp/ck-c-meal-pg.log`:

```text
service_success
 t
PASS meal replacement, owner isolation, executed role grants, malformed payloads, snapshot/notes/children late rollback
Observed B waiting on A per-owner/week advisory lock
PASS concurrent replacements: advisory blocking, one new parent, complete B snapshot/notes/28 unique children, other owner unchanged
Disposable cluster stopped; PID/socket absent; owned directory removed
```
Separate post-run process/filesystem check:
```text
Disposable dirs remaining: []
Owned postgres processes: []
```
This uses the actual nutrition schema migration 0033 plus atomic meal migration, but minimal auth/bootstrap roles. It is not full Supabase PG17/RLS/PostgREST deployment verification. The service role is intentionally trusted to supply any verified owner; the Edge gate provides owner + entitlement, not SQL entitlement lookup.

Deno absent from PATH/common locations, but existing npm cache binary discovered (no installation):
```sh
/Users/me/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno check --no-lock --cached-only supabase/functions/meal-plan/index.ts supabase/functions/daily-feedback/index.ts
```
Deno 2.9.6 / TypeScript 6.0.3; exit 0. Actual `/tmp/ck-c-deno.log`:
```text
Check supabase/functions/meal-plan/index.ts
Check supabase/functions/daily-feedback/index.ts
```

- `npx tsc --noEmit`: exit 0 (`/tmp/ck-c-tsc.log`, empty); app check excludes Edge code.
- `npm run lint`: exit 0 (`/tmp/ck-c-lint.log`), existing client-lane warning `app/(tabs)/nutrition/plan.tsx:33:21 mealPlanStatus assigned but never used`; no client edits made.
- `bash -n supabase/tests/meal_plan_disposable.sh supabase/tests/meal_plan_concurrency.sh`: exit 0.
- `git diff --check`: exit 0.
- RED logs retained: `/tmp/ck-c-coach-red-reads.log`, `/tmp/ck-c-coach-red-writes.log`, `/tmp/ck-c-coach-red-state-date.log`; write-fix GREEN `/tmp/ck-c-coach-green-writes.log`.

## Impact / limitations
GitNexus impact attempted before existing symbol edits: `generateFeedback`, `updateBehaviorState`, `isIsoDate`, and test/SQL review `host`, `replace_meal_plan`. All report **UNKNOWN**, DB format 43 versus runtime storage 42. No zero-result interpreted as safe. Source corroboration: generateFeedback called by GET today / POST generate; updateBehaviorState called by generateFeedback; isIsoDate gates POST date; replace_meal_plan called by meal generation and disposable tests. No graph repair, commits or unrelated edits attempted. Risk remains unresolved at graph level.

Strict structural/numeric validation proves 7 days × 4 slots, explicit food portions, matching dates/training flags and summed macros under explicit nonmedical tolerance. It cannot certify nutrient truth, food identity, dietary suitability, portion plausibility or allergens. Allergy profiles are withheld rather than certified safe.

Meal replacement is transactionally verified. Daily-feedback summary/event/state/report writes remain separate operations; error propagation now stops false-success responses, but late failure can leave earlier writes. This is not a claim of atomic Coach persistence. Existing historical reports are retained; backfills need matching complete snapshots and do not silently use current targets/schedule or rewind behavior state.

Remaining gates: parent acceptance, client/device behavior and warning cleanup in its own lane, deployed Supabase/PostgREST integration and real provider output/latency validation with explicit authorization. No deployment was attempted.
