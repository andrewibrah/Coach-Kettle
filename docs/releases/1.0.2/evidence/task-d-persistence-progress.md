# Task D — opt-in two-user persistence verifier

## Checkpoint / evidence boundary

Completed 2026-09-21 (UTC), resuming the interrupted worker's existing script/tests after reading its transcript. Only the verifier, its focused safeguard tests, and this evidence note were changed. No backend/client modifications, commits, deployment, secret discovery, package installation, or production-target startup.

**The runner and its safeguards are verified locally. Actual Edge → PostgREST persistence (R4) remains NOT RUN / NOT PROVEN.** The local HTTP server in the tests is explicitly synthetic in-memory persistence. Its successful responses are not evidence of PostgreSQL conflict semantics, RLS, actual authentication, or a deployed Edge function.

The earlier environment discovery reported no usable PostgREST binary or Docker/Podman daemon; PostgreSQL 15 and Deno alone do not provide the required authenticated Edge/PostgREST stack. This continuation did not install/start a stack or obtain a live target. An operator-provided, isolated disposable stack and two explicit user sessions are still required.

## Files

- `scripts/verify-body-metrics-persistence.mjs`: executable Node opt-in runner; no dependencies or credential-file loading.
- `lib/__tests__/bodyMetricsVerifier.test.ts`: 20 synthetic local HTTP/config/CLI safeguard tests. (Now 25 after the 2026-09-23 fix wave; see [task-d-final-progress.md](task-d-final-progress.md).)
- `docs/releases/1.0.2/evidence/task-d-persistence-progress.md`: this checkpoint and operator instructions.

## Current contract checked

Read the current `supabase/functions/body-metrics/index.ts`, `lib/bodyMetrics.ts`, and `types/body.ts` before finishing. The Edge contract authenticates ownership server-side, accepts only real calendar dates, validates supplied measurements before writing, omits null/blank metric columns from the sparse conflict upsert, and returns `{ entry }`. Delete is `{ action: 'delete', id }`, scoped to the authenticated owner; a foreign ID returns HTTP 200 `{ ok: true }` with no effect, not 403.

The runner checks:

1. Explicit opt-in, disposable target, two distinct authenticated JWT claims/expected UUIDs, and remote `/auth/v1/user` confirmation. No service-role tokens, service keys, URL userinfo, query strings, paths, or production defaults.
2. Three to ten explicit, distinct, real `YYYY-MM-DD` dates within the last 999 UTC days. All must be absent for both users before any POST. UTC-day rollover fails closed rather than silently changing the visibility window.
3. Edge list completeness against authorized PostgREST full-row readback with exact counts, plus exact per-date readback. Missing counts, truncation (including a server cap below 1000), mismatched rows, mixed ownership, or insufficient list headroom abort before writing.
4. Weight then waist and waist then weight, preserving one row and the same ID with both metric values. Concurrent disjoint sparse writes are separately checked.
5. Invalid-plus-valid and all-blank/null requests return 400 with complete A/B rows, including timestamps, unchanged. Blank/null with a valid companion metric preserves stored weight/waist.
6. Body owner spoof under session B cannot modify A; any successfully returned B-created row is recorded. B's delete of A returns 200 and changes neither user's rows. A's whole-row delete is verified absent.
7. Finally cleanup only deletes recorded, validated returned IDs from initially empty designated dates. Each delete is read back through Edge and PostgREST, followed by complete baseline comparison. No date-based cleanup or discovered-ID sweep.

### Timeout / ambiguous outcome safety

Requests have a 10-second timeout. Verification has a 180-second budget and cleanup a separate 60-second budget. Date count and PostgREST queries are bounded (`limit=1000` for the visible list; `limit=2` per designated date, with exact total counts). No writes are retried; redirects are refused. Concurrent requests use `Promise.allSettled` before the finalizer.

**Settling/aborting a client fetch does not prove the server transaction stopped.** Any ambiguous mutation (disconnect, timeout, malformed response, uncertain write status/identity, or delete failure) suspends automatic cleanup, even for already known IDs. The report lists generated IDs and reconciliation context and exits nonzero. This prevents a late server upsert racing a cleanup delete. After confirming server work has settled, the operator must reconcile the designated user/date pairs and recorded IDs manually; never indiscriminately delete rows by date. If the process is externally killed, retain the isolated stack for reconciliation rather than assuming cleanup ran.

The optional second argument to the exported runner can only shorten the request timeout, for local tests. CLI settings do not increase any time budget. Reports omit bearer tokens, API keys, response bodies, and raw server error text. A PostgREST version is recorded only when explicitly advertised in a narrowly parsed version header; otherwise it remains null and must be supplied separately in real evidence.

## Verified commands and exact results

- `node --check scripts/verify-body-metrics-persistence.mjs` — exit 0.
- `node --test lib/__tests__/bodyMetricsVerifier.test.ts` — **20 tests, 20 passed, 0 failed**, final recorded duration **1049.274083 ms**.
- `npx eslint scripts/verify-body-metrics-persistence.mjs lib/__tests__/bodyMetricsVerifier.test.ts` — exit 0.
- `npx tsc --noEmit` — exit 0.
- `npm run lint` — exit 0.
- CLI tests execute `--help` in an empty environment (exit 0), and missing-setup refusal (exit 1) with a secret sentinel confirmed absent from output. These make no target requests.

Safeguards include wrong remote identity, occupied dates, leaked owner lists, missing/truncated exact counts, short Edge lists, sparse replace regression, rejected-write timestamp mutation, REST/Edge mismatch, cleanup no-op, lost first response, lost known-row update, delayed timed-out update, concurrent lost/delayed responses, and preservation of an unrelated pre-existing row. Synthetic requests are bounded below 500 for the normal run; the unrelated-row full run is asserted below five seconds. Timeout fixtures wait for their delayed server work before closing and verify no cleanup raced it.

TDD regression checks observed failures for the unbounded date input, known-ID cleanup after a lost response, delayed write timeout handling, and lower-cap Edge truncation before implementing the fixes. An ESLint `Buffer` global error was corrected with an explicit `node:buffer` import.

Node prints `MODULE_TYPELESS_PACKAGE_JSON` when directly running the TypeScript test; this is a warning, not a failed test. The repository package module mode was not changed.

GitNexus upstream impact was attempted for `runVerification` and `loadConfig`; both were unresolved (`UNKNOWN`) because the installed reader expects database version 42 but the index is version 43. Text fallback found these exports used only by this standalone script and focused test. No app callers or production execution flow were found in that fallback; this is not a claim of a clean graph analysis. No index rebuild or commit was performed.

## Explicit operator setup for the remaining real gate

1. Provision an **exclusive disposable** local/staging Supabase-compatible stack with the current body-metrics Edge handler, schema/migrations, unique `(user_id, measured_date)` conflict key, auth, and appropriate read RLS. Confirm both `/functions/v1/body-metrics` and `/rest/v1/body_metrics` are backed by the actual PostgreSQL database. Do not point this at production or a shared account with concurrent jobs.
2. Provision two disposable users through that stack's normal authentication flow. Securely place their current access JWTs in `CK_BM_TOKEN_A` / `CK_BM_TOKEN_B` and their expected distinct UUIDs in `CK_BM_USER_A` / `CK_BM_USER_B`. Tokens must have role `authenticated`, matching `sub`, and more than five minutes left before expiration. Do not paste tokens into evidence or command logs. The runner neither reads an auth file nor logs in/provisions sessions.
3. Provide the public anon/publishable key as `CK_BM_PUBLIC_KEY` — usually required by standard Supabase gateways (anon/publishable key only, never service role). Choose three to ten real, recently dated, empty test dates for BOTH users and securely set `EMPTY_TEST_DATES` to that comma-separated list. Set `DISPOSABLE_SUPABASE_URL` explicitly to the verified base URL without a path/query/userinfo.
4. Review help, then run with explicit acknowledgement (A/B session and ID variables must already be present in the environment):

   ```sh
   node scripts/verify-body-metrics-persistence.mjs --help
   CK_BM_CONFIRM=YES \
   CK_BM_ENVIRONMENT=disposable-local \
   CK_BM_URL="$DISPOSABLE_SUPABASE_URL" \
   CK_BM_DATES="$EMPTY_TEST_DATES" \
   node scripts/verify-body-metrics-persistence.mjs
   ```

   For approved disposable staging use `CK_BM_ENVIRONMENT=disposable-staging` and HTTPS. Local mode accepts only loopback hosts. Neither mode proves that an operator-labeled target is disposable; the operator must establish that before opting in.

5. Preserve the redacted JSON report, actual stack/PostgreSQL/PostgREST/Edge versions, applied migration/deployment revision, and exact runner revision. Require exit 0, `ok: true`, `cleanupVerified: true`, and empty failure/reconciliation lists. A synthetic fixture pass or bare PostgreSQL/Deno test must **not** be labeled R4. If a report is nonzero or a response was lost, reconcile manually as described above before rerunning.

**Remaining release gate:** execute this runner successfully against the real disposable authenticated two-user Edge → PostgREST stack and attach that report/version evidence. No such report is claimed here.
