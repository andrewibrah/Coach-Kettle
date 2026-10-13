# P4 live-edit / Clear / explicit abandon recovery checkpoint

Status: **implementation_pending_review — independent SPEC, then QUALITY required.** Parent reports prior bounded first and transactional checkpoints approved; this continuation is not an approval or rollout. All pre-existing dirty work, including CLAUDE edits and approved I1/I2/I3/P1/P2/P3/C2, was preserved. P5/coaching/adaptive work was not expanded. Migration `20261008000300_session_operation_integrity.sql` remains **UNAPPLIED outside fresh disposable fixtures**.

## Recovery and repaired contract

The interrupted trace `deleg_51280e2c/task-0.log` lines140–171 records production edits, a genuine missing-setRows harness error, assertion-preserving fixture corrections, later tests and HTTP429 without final verification. Recovery began by executing current `p4OperationOutbox.test.ts` + `p4SessionProtocol.test.ts`: **20 pass, zero failures/skips**. This established only the local/handler-double checkpoint, not SQL integration.

The actual durable delivery path exposed an unfinished protocol: Edge accepted `revise`, but the real RPC rejected that kind. Strict SQL RED retained the prior660-case matrix, then failed `revise acknowledged by actual SQL` (pending1 rather than0); the cluster shut down. The unapplied RPC now validates `revise` before allocation, serializes it under the existing session/owner locks, deletes prior managed evidence and reinserts only eligible corrected performance. Incomplete/planned corrections retain a nonterminal row identity; a higher-revision completion can use that same ID. Malformed rows, finalized/deleted sessions and permanent row tombstones remain rejected. Raw projection/Unicode/IEEE validation is unchanged.

Recovered durable outbox and delivery:
- Owner/session/row-scoped stable operation keys, serialized local ledger, monotonically increasing safe revisions. Failed HTTP, lost acknowledgement and storage acknowledgement failure retain retry identity. A stale acknowledgement removes only its exact pending key, not a later correction/tombstone.
- Repeat local drop intent now preserves its original tombstone key; it previously threw `Deleted row identity cannot return` on its own retry. Reusing the dropped row ID for a put remains forbidden.
- Actual transport supplies `expectedOwner` to the auth wrapper on every send/retry. Other-owner flush does not select these operations; changed login is rejected before requesting an operation under the replacement identity. Auth/unmount do not clear this ledger or valid drafts.
- Actual composer, modal, inline blur, inline focus change, pending composer edit, duplicate/increment and reorder deliver stable-ID changes. Performed-to-incomplete inline/modal corrections retract without terminal deletion. Deletion queues its tombstone before removing local recovery and reconciles remaining performed ordinals.
- Clear cancellation does not queue anything. Confirmed Clear durably queues all captured row tombstones before removal; it retains active identity/date/empty recovery rather than abandoning the session. Rows legitimately added during the durability wait survive in real draft readback. Late prior row puts cannot resurrect; different later row IDs remain allowed.
- Confirmed empty End queues explicit abandon before clearing recovery. The outbox first uses a no-performance bootstrap tombstone for an ID never sent remotely, then deterministic permanent `delete:<session>:terminal:v1`; it fences future old-session intent without touching replacement sessions. End snapshot collection suppresses pre-confirmation remote mutations; confirmed nonempty End retains the approved synchronous ownership/freeze and authoritative finalization.

## Failure-first receipts

Active-profile scratch directory: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/`.

- `p4-recovery-sql-red.log`: actual outbox/Edge/SQL `revise` rejection; expected pending1/0 assertion, verified shutdown.
- `p4-recovery-inline-red.log`: inline incomplete edit produced zero correction operations (11 pass/1 fail); repaired with reversible revision.
- Outbox/reorder tracer run: repeat drop threw; reorder emitted no live ordinal updates (12 pass/2 fail). Same assertions pass after fixes.
- `p4-recovery-focus-red.log`: focus change and pending composer commit each omitted live correction (14 pass/2 fail); original assertions retained.
- `p4-recovery-delete-red.log`: deletion sent only tombstone, not remaining row ordinal correction (16 pass/1 fail); original assertions retained.
- Original retained fixtures were not weakened or skipped. Editor diagnostics for Node imports in excluded test files remain distinct from actual app typecheck. No packages/types were installed.

## Final executed verification

Repository root: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.

Focused command:

```sh
node --experimental-strip-types --test lib/__tests__/p4OperationOutbox.test.ts lib/__tests__/p4SessionProtocol.test.ts lib/__tests__/submissionIdempotency.test.ts lib/__tests__/submitGuard.test.ts lib/__tests__/workoutRoundtrip.test.ts lib/__tests__/sessionOwnership.test.ts lib/__tests__/sessionFinalizationUi.test.ts lib/__tests__/sessionReviewFailure.test.ts lib/__tests__/p3SpecRepairs.test.ts lib/__tests__/i3SpecRepairs.test.ts lib/__tests__/workoutValidation.test.ts lib/__tests__/workoutDraftLifecycle.test.ts
node --experimental-strip-types --test lib/__tests__/*.test.ts
P4_APPLY=true python3 supabase/tests/p4_session_sql.py
npm run lint
./node_modules/.bin/tsc --noEmit
git diff --check
```

- **352 focused /3357 full library pass**, zero failures/cancellations/skips. Logs `p4-recovery-focused-final.log` and `p4-recovery-full-final.log`. Existing intentional-offline diagnostics/Node module-type warnings are not suppressed.
- Actual API/Edge plus **actual `sessionOperationDelivery.ts` and outbox → actual Edge → authenticated disposable SQL**: **728 RPC calls** in the JS bridge; retained220 generated rows/660 parity checks,403 accepted persistence readbacks/257 invalid no-effects, zero failures. Retained raw projection/Unicode/IEEE/cardio/legacy/PR/lost-delete-ack controls pass.
- New delivery readbacks prove lost put acknowledgement after real commit, fresh delivery module retry with single original receipt, revise/recompletion, Clear then different later row, abandon both known and never-sent session, replacement-session isolation. AsyncStorage is an in-memory adapter, auth/HTTP/SDK are controlled offline seams; no native/device/PostgREST/JWT signing certification.
- Python adds **3 actual lock barriers** for correction/Clear/abandon with the waiter observed on PostgreSQL `Lock`, then old put rejected after controller commit; retains both final/live ordering barriers. **31 invalid-revise full-state no-effect comparisons**,62 prior invalid-row rejections,18 invalid-snapshot controls, explicit transaction rollback and real insert/delete/PR-reconcile rollback pass.
- Final cluster: `p4-pg-795270097f/receipt.json`; fresh UTF8 PG15, fixed scratch-only Unix socket, `listen_addresses=''` queried/asserted, no TCP. Shutdown in `finally`, postmaster PID absence and pg_ctl status3 verified. Minimal schema/roles/actual PR dependencies only, not full migration chain/RLS deployment proof.
- App typecheck was **permitted and actually executed, exit0** in this recovery; historical guard-blocked verdicts remain historical, never relabeled or bypassed. Lint initially exited0 with3 unstable callback dependency warnings; the gateway was then memoized after its celebration dependency as a green refactor. Final memoized rerun: **352 focused /3357 full pass**, zero failures/skips (`p4-recovery-focused-memoized.log`, `p4-recovery-full-memoized.log`); lint exit0 **without warnings** (`p4-recovery-lint-memoized.log`); actual app tsc exit0 (`p4-recovery-tsc-memoized.log`). Final documentation `git diff --check` **exit0**; ledger parses with P4 `implementation_pending_review` and P5 `planned`; disposable receipt/PID absence read back. `command -v deno` returned no executable, so Deno verification remains unavailable.

## Graph / callers / unresolved release gates

Pre-edit graph impact ran for outbox/gateway/SQL and changed route symbols. New/unindexed SQL/outbox/gateway were **UNKNOWN**, not cleared. Ambiguous route symbols were followed by exact UID runs: inline/focus/delete/reorder LOW0, pending-edit gateway **CRITICAL5 callers/5 affected process entries**. Actual current caller fallback found composer, End, openCoach and home-start; stale index additionally reports Clear, which no longer calls that gateway. End explicitly disables pre-confirmation delivery; ordinary pending-edit consumers commit legitimate edits. Production route→delivery→auth/log-set/history→RPC and stable row/revision/draft consumers were inspected directly; regression suites exercise those consumers.

Aggregate detect-changes rerun with limit300: **CRITICAL24 tracked files/94 symbols/84 affected processes**, formatted output still abbreviated and inherited dirty/untracked/cross-language coverage stale. `p4-recovery-graph.log` is not an all-clear. No commit.

Remaining: independent SPEC then QUALITY for this bounded slice; whole P4/full-schema/RLS/old-client coordinated rollout, native process-death/AsyncStorage, Deno checks and broader D08 product decisions remain open. No new TTL, legacy conversion/backfill, cross-device overwrite or final-outbox retirement/pruning policy was invented. Failed operations retain evidence; after authoritative finalization, previously superseded live intents can remain in the ledger fail-closed rather than being silently erased. P5 local-history concurrency remains separate and unimplemented. No install/reset/stash/commit/deployment/provider/live DB/payment/production migration or guard bypass.

Review-ready contract: verify the reversible `revise` wire/SQL validation and stable recompletion; durable operation identity across storage/network uncertainty; Clear's empty active recovery plus late old-row fences and legitimate later rows; abandon ownership/replacement isolation; cancellation, P2 freeze, P1 restore gates and P3/I3 raw numeric regressions. Do not mark whole P4 approved from test counts alone.
