# P4 final review: SPEC then QUALITY (local only)

Scope: P4 (idempotent submissions, transactional finalization, session operations, auth/provenance).
Reviewed at 1f77fe2 + b3e8e9e, repaired in 72191e4 (SPEC), 5963350 (QUALITY) and 5f675c6 (lint/stale
closure). No push, deploy or remote Supabase command was run. Migrations remain unapplied in
production.

## Reviews

| Pass | Reviewer | Verdict |
|---|---|---|
| SPEC 1 | independent, read-only, fresh context | FAIL: 1 HIGH, 3 MEDIUM, 3 LOW, 1 decision |
| re-SPEC | independent, read-only, fresh context | PASS: F1–F5, F7 and item 13 closed; 2 new LOW (N1, N2) fixed afterwards |
| QUALITY 1 | separate independent reviewer | CHANGES REQUIRED: 1 HIGH, 1 MEDIUM, 4 LOW, 1 NIT |
| QUALITY 2 | same QUALITY reviewer, re-review of 5963350; 5f675c6 confirmation requested separately | **APPROVED**: all blocking findings closed, no regression; 2 non-blocking residuals |

## Findings → fix → test

| # | Sev | Finding | Fix | RED → GREEN test |
|---|---|---|---|---|
| F1 | HIGH | `delete_user_data` left P4 sessions, rows and receipts (receipts hold row payloads and reflection) | 0300 replaces `delete_user_data` and deletes child-first | `supabase/tests/p4_account_purge.sql`: 4 rows survive → 0 |
| Q-M | MED | No FK from sessions to `auth.users`; a write committing after the purge outlived the deletion | `user_id REFERENCES auth.users ON DELETE CASCADE`; rows, receipts and `workout_log.p4_session_id` cascade | same file: purge → late apply → `DELETE auth.users`: 3 rows survive → 0 |
| Q-H | HIGH | `syncPendingWorkouts` could POST user A's pending workouts with B's JWT after a sign-out/sign-in | owner-bound `syncPendingWorkouts(owner)`: the generation check stops the loop, and `api.saveWorkout(…, expectedOwner)` → `fetchWithAuth` | `p4LegacySync`: `['a1@A','a2@B']` → `['a1@A']`; `workoutRoundtrip`: owner forwarded |
| F2 | MED | The device op queue (`workout_session_operations_v1`) survived account deletion | owner-filtered `purge(owner)` plus a `clearLocalOperations` deletion step | `p4OperationOutbox`, `privacyRelease` |
| F3 | MED | Pre-P4 pending sessions got a 400 forever | identity assigned inside the queued write before HTTP; known 403/409 or Edge 400 → `syncBlocked`, kept local, not retried (user decision) | `p4LegacySync` |
| F4 | MED | No rollout/recovery runbook | `P4_ROLLOUT_RUNBOOK.md` | reviewed against 1f77fe2^ write paths and 0300 revokes |
| F5 | LOW | Deterministic rejections returned 500 and were retried forever | `_shared/operationErrors.ts`: P0001 → 409 with a stable code; the RPC's own 42501 messages → 403; anything else stays 500 | `_shared/workoutValidation.test.ts`; `p4_edge_sql.mts` uses real SQLSTATEs |
| 13 | decision | Legacy workouts can't be deleted | user decision: stay server read-only; History explains why (`deleteFailureMessage`) | `p4LegacySync` |
| N1 | LOW | Edge 400 pre-validation was retried forever | an Edge-shaped 400 is terminal (`invalid_session`) | `p4LegacySync` |
| N2 | LOW | A never-synced delete (403) said "can no longer be deleted" | message says retry after it syncs | `p4LegacySync` |
| Q-L1 | LOW-MED | The abandon delete raced ahead of its failed bootstrap row and was dropped as terminal | a session `delete` waits for earlier unacked ops of the same session | `p4OperationOutbox` |
| Q-L2 | LOW | Any 403/409/42501 (gateway page, grant error) was terminal | only known stable codes, and the RPC's own 42501 messages | `p4OperationOutbox`, `p4LegacySync`, Edge test |
| Q-L3 | LOW | The `seen` ledger grew without bound | an acked delete prunes that session's keys; the abandon fence stays | `p4OperationOutbox` |
| Q-L4 | LOW | Default grants on the sessions table | `REVOKE ALL`, then `GRANT SELECT` to authenticated | fresh-chain `has_table_privilege` check |
| Q-N | NIT | The owner-bound HTTP test asserted nothing | the test calls `fetchWithAuth`; reaching the network would raise a ReferenceError | `p4OperationOutbox` |
| F7 | LOW | SQL suites hardcoded a machine path | `P4_SCRATCH` or a short `mkdtemp` | the suite runs from the repo |
| lint | LOW | The focus callback captured a stale owner (exhaustive-deps) | owner ref read at call time | `expo lint --max-warnings 0` exits 0 |
| F6 | LOW | A never-synced workout with no live ops can't be server-deleted until it syncs | **open**, documented in the runbook | — |

## Local verification

- Isolated worktrees (`node_modules` symlinked, no other session's uncommitted work):
  - 72191e4: lib 3411/0, Edge `_shared` 81/0, `tsc` 0, lint exit 0, SQL suite exit 0.
  - 5963350: lib 3428/0, `_shared` 85/0, `tsc` 0, SQL suite exit 0. It had one lint warning
    (`exhaustive-deps`), because only the exit code was checked; fixed in 5f675c6.
  - Final HEAD 80a039d, which includes the later C1 commit: lib 3446/0, `_shared` 85/0, `tsc` 0,
    `expo lint --max-warnings 0` exit 0, `P4_APPLY=true python3 supabase/tests/p4_session_sql.py` exit 0.
  - All four P4 commits pass `git diff --check`. Earlier phase commits 5189c7a, 1f77fe2 and ae32d91 carry
    pre-existing whitespace (0100 trailing spaces, doc EOF blank lines).
- Local Supabase stack (colima, project `ck-local`), fresh chain: 64 migrations apply, including
  0100/0200/0300/0400, and the purge test passes. `20260113205331_remote_schema.sql` fails from scratch
  ("chats already exists"). That predates P4 and needs a decision before `supabase db reset` can work
  from the repo.
- `supabase functions serve` at HEAD has to run from a root that contains `lib/` and `types/`. Edge
  imports reach `../../../lib` and `../../../types`, so deploy from the repo root.
- Curl receipts on the fresh chain, 24 cases, all as expected:
  - log-set: put 200, replay 200 with 1 row; same key with a different payload → 409 `operation_conflict`;
    B into A's session → 403 `forbidden`.
  - history: finalize 200; A sees it and B gets `[]`; B finalize or delete over A's ID → 409 `legacy_session`.
  - next-set: 200 `policy_unapproved`.
  - chat/coach: validation 400s; 500 only from the dummy provider key.
- The simulator flows are BLOCKED because Xcode isn't installed.

## Non-blocking residuals from QUALITY 2

- LOW: `seen` is pruned only when a session delete is acknowledged (abandon). Normally finalized
  sessions keep their row fingerprints (about 216 KB per 1000 rows). Fix later: prune a session's keys once
  its finalize is acknowledged. This ties to the open D08 retention choice.
- NIT: the End path (`saveWorkout`, `lib/workoutStorage.ts`) calls `api.saveWorkout(session)`
  without `expectedOwner`. The `isCurrent()` fence leaves only a microsecond window, and `saveWorkout`
  is graph-CRITICAL, so this is deferred rather than changed at the finish line.

## Remaining

F6 (LOW) and the D08 product choices (abandon TTL, cross-device overwrite, deleted-ID restore, legacy
backfill) are open by decision. So are native process-death durability, the simulator E2E and the
production rollout (see `P4_ROLLOUT_RUNBOOK.md`).

## Follow-ups closed in 05c1459 (2026-10-14)

User D08 decisions: auto-close after 24 h, keeping sets; higher revision wins; deleted IDs never return; no legacy backfill.

| Item | Fix | Test |
|---|---|---|
| D08 abandon policy | `20261008000500`: `expire_open_workout_sessions()` plus pg_cron every 15 min (guarded on available + preloaded). It finalizes through `apply_workout_operation` as the owner, from the latest receipts. | `supabase/tests/p4_session_expiry.sql` (local stack): 24 h boundary, sets kept, phone End wins, late set rejected, H1 baseline counts it |
| Retracted-only session (SPEC F1) | locked only when there are no performed sets; no history row | `exp-ret` |
| Exercise interleaving (QUALITY M1) | grouped by exercise first appearance, then row first revision | `exp-order`, `exp-group` |
| Failing session starves the queue (L2) | `expire_failed_at`, sorted last | `exp-stuck` with batch-1 runs |
| `service_role` could force-close sessions (F3) | `REVOKE` from every API role | test asserts all three API roles are denied |
| F6, never-synced delete | `lib/historyDelete.ts`: durable abandon before the local delete; `session_deleted` sync drops the stale copy | `p4HistoryDelete`, `p4LegacySync` |
| `seen` growth (residual LOW) | pruned when a new session logs | `p4OperationOutbox` |
| End save owner (residual NIT) | `saveWorkout({owner})`; index.tsx passes `endOwner` | `p4LegacySync` |
| Prod pre-check | `supabase/tests/prod_precheck_p4.sql`, read-only; columns, tables, functions, result types, dependent views, pg_cron | exits 0 on migrated and empty databases; reviewer mutation-checked |

Reviews: SPEC FAIL, repaired, SPEC PASS (mutation-checked); QUALITY CHANGES REQUIRED, repaired, QUALITY APPROVED.

Gates, isolated staged snapshot: lib 3657/0, `_shared` 113/0, tsc 0, lint `--max-warnings 0` exit 0, P4 PG15 suite exit 0. 0500 applied through the real CLI (`supabase migration up --local`). 24 curl receipts as expected.

Accepted: L1 (the batch holds owner PR locks until commit; batch of 100). Not done:
- `remote_schema` rebaseline (needs the prod schema; use the pre-check, then a user-run `db pull`);
- simulator flows (no Xcode).
