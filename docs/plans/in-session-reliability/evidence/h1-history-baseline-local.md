# H1 completed-session history baseline: local evidence

Scope: `supabase/functions/_shared/liftMatching.ts` (`liftNameVariants`), new additive migration `20261008000400_in_session_history_baseline.sql`, `supabase/functions/next-set/{index,baseline}.ts`, `types/programming.ts`, `lib/programming.ts`, `components/workout/NextSetSuggestion.tsx`, `app/program/day.tsx`. Adaptive output stays off (D07 unresolved). No P4/A3 files touched.

## Reproduced (RED at pre-H1 source)

| # | Defect | RED receipt |
|---|---|---|
| 1 | No variant set for a canonical lift; "Bench Press" history query could not see legacy typed `bench` rows | `liftMatching.test.ts` 0/4 |
| 2 | No completed-session baseline: nothing distinguished live/open/deleted sessions, same-day sessions or MAX(date) vs createdAt | SQL fixture: `function public.exercise_history_baseline(text[],text) does not exist`, psql exit 3 |
| 3 | next-set returned only `policy_unapproved`: no canonical resolution, no session exclusion, no baseline | `next-set/baseline.test.ts` 1/10 (only the unchanged auth/validation test passed) |
| 4 | Client: `fetchNextSetSuggestion` threw on 401 and returned `null` for every other state, so the day screen showed `Suggest: loading…` forever for unavailable/no history; pill hardcoded `+2.5 lb`; a casing-only edit (`bench` → `Bench`) during a fetch cancelled it and the effect early-returned on `lastExerciseRef`, leaving `Loading suggestion…` forever | `nextSetBaseline.test.ts` 0/12; the casing test failed with actual `'Loading suggestion…'` |

## Repair (minimal)

- `liftNameVariants(canonical)` returns the normalized canonical name plus that lift's existing `ALIASES` entries. No new aliases and no reverse lookup.
- `exercise_history_baseline(p_names, p_exclude_session)` is `LANGUAGE sql STABLE SECURITY INVOKER`. It picks the single owned `workouts` row with the newest `"createdAt"` (ties broken by id) that has at least one I3-eligible set (`i3_strength_eligible`) under a normalized name in `p_names`. Workouts excluded are `p_exclude_session` and any with a P4 session in `open`/`deleted`; legacy workouts with no session row count as completed. It returns only that workout's sets, as `i3_load` / `i3_pr_reps` / `i3_epley`, with `set_kind` kept. EXECUTE is granted to authenticated and revoked from PUBLIC/anon.
- next-set: auth and validation are unchanged. It accepts an optional `session` (GET) or `sessionId` (POST). It reads active `pr_tracked_lifts` through a **user-scoped anon client with the caller JWT** (log-set's service-role read is not copied), resolves the canonical lift via `resolveTrackedLift` with the typed name as fallback, and calls the RPC with `liftNameVariants`. The response is `{ suggestion: null, reason: 'policy_unapproved', baseline }`. Legacy `suggest_next_set` is never called. A tracked-read error, RPC error or malformed (non-array, mixed-workout, non-finite) payload returns `500 { error: 'History unavailable' }`, never an empty baseline.
- Client: `NextSetResult` is a discriminated union. Fetch never throws; HTTP or network failure becomes `unavailable/error`. A 200 response with no `baseline` field (older server) maps to `unavailable`, not `no_history`. The pill and day screen render explicit states: `No previous session`, `Last session: <load> lb × <reps>` + `Suggestions off`, or `Suggestions unavailable`. Load is not rounded. The `micro_load` label is `loadDeltaLabel` (suggested − last top, 0.1 lb precision). The pill effect is keyed on the normalized name (`exercise.trim().toLowerCase()`), so a casing-only edit neither refetches nor cancels.

## Gates

- `node --test supabase/functions/_shared/liftMatching.test.ts`: RED 0/4, then GREEN 4/4.
- `node --test supabase/functions/next-set/baseline.test.ts`: RED 1/10, then GREEN 10/10. This includes an index-level harness with distinct env keys, asserting that every `createClient` uses the anon key and the caller's `Bearer`.
- `node --test lib/__tests__/nextSetBaseline.test.ts`: RED 0/12, then GREEN 12/12.
- SQL fixture: RED was exit 3 (function missing). The migration was applied with `psql ... --single-transaction -f supabase/migrations/20261008000400_in_session_history_baseline.sql` to the disposable local DB at `127.0.0.1:55122`. Then `psql ... -v ON_ERROR_STOP=1 -f supabase/tests/in_session_history_baseline.sql` gave `H1 baseline fixture: 23/23` and rolled back. SPEC-review repair: legacy workouts with NULL `createdAt` were tie-broken by ID, not recency (reproduced RED: `zz-fs-old` chosen over the newer `aa-fs-new`). Adding `workout_date DESC` before the ID tie-break turned that into GREEN at **24/24**. Coverage:
  - yesterday chosen over today's live session in each form: open with no workouts row, open with a workouts row, and deleted
  - same-day pair: only the latest by createdAt is returned, also against a later `dateISO` with an older createdAt
  - typed `bench` and whitespace/case variants match only when the alias is in `p_names`
  - warmup, cardio, planned, zero-load and NaN rows excluded
  - backoff kept with `set_kind='backoff'`
  - `p_exclude_session` is honoured
  - user isolation both ways
  - no history and empty `p_names` both return 0 rows
  - `prosecdef=false`, anon has no EXECUTE, and `current_user='authenticated'` inside the assertions
- Mutation check: ordering by `workout_date` first fails the fixture (it returns `h1-dl-late-date`), and ignoring session state fails it (it returns `h1-sq-del`).
- `node --test "lib/__tests__/*.test.ts"`: 3421/0. The pre-H1 baseline in this tree was 3393/11; those 11 were in-flight P4 history/log-set tests and now pass by the P4 session's own edits.
- `node --test "supabase/functions/_shared/*.test.ts"`: 84/1 (see Residual).
- `npx expo lint --max-warnings 0`, direct `npx eslint --max-warnings 0` on the changed client files, `npx tsc --noEmit` and `git diff --check`: all exit 0. The new untracked files have no trailing whitespace.

## Residual, recorded

- LOW (D03): legacy rows with `set_kind IS NULL` are eligible, so unlabeled historical warmups count as work sets. Classification may not be inferred from notes or set 0, so this stays until a backfill is approved.
- Local smoke over real HTTP (`smoke-h1.mjs`, ck-p5 `functions serve`): newest completed session only, current session excluded, warmup dropped, backoff kept with its kind, no history → null, adaptive off: **7/7**.

- **Coordinated test edit pending.** `_shared/workoutValidation.test.ts` contains uncommitted P4 edits, so H1 did not touch it. Its existing test `actual next-set disables unapproved adaptive RPC...` asserts `writes.length === 0` and has no `./baseline.ts` dependency, so it now fails. The prepared patch adds the `./baseline.ts` dependency and has the mock return `[]` for `exercise_history_baseline`. It then asserts that the only write is that RPC, with `p_names=['pushups']` and `baseline: null`. Verified on a temporary copy: 79/79.
- A typed name with no matching tracked lift resolves only to itself. For example, `bench` without a tracked "Bench Press" queries `['bench']`, which is per spec, so that lift's canonical-name history is not found until it is tracked.
- The pill fetches with the normalized (lowercased) name. When no tracked lift matches, `baseline.exercise` is the lowercased typed name. The pill does not display it.
- The baseline returns backoff/drop/superset sets unfiltered. Choosing the top set for display (`lastSessionLabel`, heaviest then most reps) is display-only and is not a progression input.

**Not claimed:**
- Any progression policy, increment or threshold (D07; `suggestion` is always `null`), and any backoff policy (D03).
- An in-session pill mount: `NextSetSuggestionPill` still has no callers (GitNexus impact 0, confirmed by grep), and mounting it with `sessionId` is A3 scope.
- Remote deployment, and the full repo migration chain from scratch: only the local scratch DB that already held migrations through 0300 was used.
