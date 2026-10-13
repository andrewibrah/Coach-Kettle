# P4 first bounded checkpoint — implementation_pending_review, NOT full P4 completion

## Outcome and preserved work

Checkout `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`, HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`. Preserved the existing dirty app/Edge/SQL/CLAUDE work; no reset/stash/install/commit/deploy/provider/production DB/credentials/guard bypass. This is a deliberately bounded handoff for independent SPEC then QUALITY, not completion of the requested session-owned SQL barrier work.

- Actual HomeScreen composer callback reserves submission synchronously before parsing or effects. Existing `createSubmitGuard` retains reusable single-flight default; additive `{ once: true }` makes a rendered callback one operation even when replayed after settlement. Each newer render creates its own guard, so a previous provider latch does not prevent a replacement session/request. P2 ownership/generation fences are untouched.
- Actual fast, skeleton and AI closures exercise simultaneous callback dispatch plus post-settlement replay: one row/log, stable filled ID, one AI request. Identical legitimate sets on a subsequent render retain the first ID and create a different second ID. No content-based deduplication.
- Actual history handler now returns sanitized HTTP500 for workout_log delete failure, insert failure and PR reconciliation failure, instead of acknowledging incomplete finalization. Actual API → real local-first serializer keeps exact local rows pending; repeated failures keep pending, subsequent success clears it. DB/auth/AsyncStorage are offline IO doubles, not PostgreSQL/native.
- Parent-reported bounded P2/P3/I3/C2 approvals are recorded as latest gates; task statuses are partial, not whole-task automatically approved. I3 parent receipt:183 focused/65 strength SQL/16 cardio SQL/3322 full, lint/worker tsc passed; reviewer's last app typecheck blocked by guard remains a missing verdict, not bypassed.

## Strict vertical TDD receipts

All commands from repository root. Raw logs in `/Users/me/.hermes/profiles/telegramlite/cache/scratch/`:

1. `node --test --test-reporter=tap lib/__tests__/submissionIdempotency.test.ts`: actual callback RED0 pass/1 fail, rows2 instead of1 (`ck-p4-submit-red.log`). That first shell wrapper printed the receipt and returned0; the TAP verdict is explicitly failing, not a green command. Wire guard only after observing it. Combined submit/guard GREEN4/0 (`ck-p4-submit-green.log`).
2. `node --test --test-reporter=tap lib/__tests__/submitGuard.test.ts`: settled replay RED3/1, actual second execution true instead of false (`ck-p4-replay-red.log`, exit1). Add opt-in once semantics, leaving default reusable behavior unchanged. Final guard/control coverage is in focused/full runs below.
3. `node --test --test-reporter=tap --test-name-pattern='history insert failure' lib/__tests__/workoutRoundtrip.test.ts`: actual Edge RED0/1, HTTP200 instead of500 (`ck-p4-history-red.log`, exit1). Return500 on insert error; unfiltered file GREEN5/0 with actual API/local pending retry (`ck-p4-history-green.log`, exit0).
4. `node --test --test-reporter=tap --test-name-pattern='failure is not acknowledged' lib/__tests__/workoutRoundtrip.test.ts`: delete/PR RED0/2, both200 instead of500 (`ck-p4-history-red2.log`, exit1). Narrow failure returns implemented afterward. All assertions pass in final suites.

The initial full run (`ck-p4-full.log`) was3327 pass/1 fail: retained P2 `actual old finally cannot unlock a newer request after Clear`. Diagnosis: the shared extraction fixture mutated a reused context with one guard, incorrectly sharing it between separate simulated renders. Corrected only the new fixture dependency: each extracted callback gets a fresh default guard; explicitly supplied guards remain supported. Original P2 assertions and production ownership unchanged. Subsequent full3330/0. The primary composer fixture now AST-extracts and evaluates the actual production `submissionGuard` initializer, not a guessed guard configuration; final reruns below include that change.

## Final execution

- `node --test --test-reporter=tap lib/__tests__/submissionIdempotency.test.ts lib/__tests__/submitGuard.test.ts lib/__tests__/workoutRoundtrip.test.ts lib/__tests__/sessionOwnership.test.ts lib/__tests__/sessionFinalizationUi.test.ts lib/__tests__/sessionReviewFailure.test.ts lib/__tests__/p3SpecRepairs.test.ts lib/__tests__/i3SpecRepairs.test.ts lib/__tests__/workoutValidation.test.ts`:206 pass/0 fail/0 skips, exit0 (`ck-p4-focused-actual-guard.log`).
- `node --test --test-reporter=tap 'lib/__tests__/*.test.ts'`:3330 pass/0 fail/0 skips, exit0 (`ck-p4-full-actual-guard.log`). All retained input/P1/P2/P3/I3 lib tests included. Existing module/react-renderer warnings and deliberate error fixtures remain; not warning-free.
- `npm run lint`: exit0 (`ck-p4-lint.log`). Direct `npx tsc --noEmit`: permitted, exit0 tool receipt, no alternative runner. App tsc excludes tests/Edge; neither is claimed typechecked. Test editor still lacks Node types; no installs/suppressions.
- `git diff --check`: exit0 tool receipt; rerun after documentation.
- Deno/native/provider/SQL/production database/rollout: NOT VERIFIED in this slice. No PostgreSQL cluster started and no migration created or applied.

## Graph and source risk

Pre-production edit file-qualified upstream impacts: sendMessage LOW0 indexed callers; createSubmitGuard LOW0; history saveWorkout LOW1 caller (Edge file). Actual composer/BottomBar/End routes, full affected closure, shared guard callers, API/storage retry and history reconciliation paths inspected. Prior aggregate CRITICAL risk remains unresolved; source fallback is not graph clearance.

Untracked harness symbols runWorkoutRoute/sourceClosure/historyEdge/roundtrip UNKNOWN/not indexed. Read actual fixture callers and function bodies. The first harness signature-only test edit preceded its separate UNKNOWN query; record this ordering limitation rather than claim perfect pre-edit compliance. No production edit preceded its relevant impact.

Final `node .gitnexus/run.cjs detect-changes --scope all --repo . --limit 200`: CRITICAL23 tracked files/88 range-attributed symbols/37 flows, includes all preserved work; truncates15 symbols/10 flows despite limit. Stale/new/untracked coverage unresolved, not all-clear (`ck-p4-graph.log`). No commit attempted.

## Exact remaining P4 contract — do not advance past this

1. Authenticated session ID, stable row ID, per-session revision and operation key must be carried app/API/log-set/history end-to-end. This slice does NOT yet carry them.
2. Legacy daily-live deletion remains in the existing history implementation and is unsafe across two sessions on one day. This slice's500 response is honest failure handling, NOT transactional rollback; preceding writes can already have committed. Do not deploy it as a finalization integrity guarantee.
3. Implement D08 integrity-only defaults: final snapshot authoritative, per-session revision/tombstone barrier, reject or safely segregate old daily-live clients. No raw destructive cleanup/backfill or abandoned TTL policy invented.
4. Add chronological UNAPPLIED SQL proposal after `20261008000200`; authenticated ownership/RLS, transactional final history+PR reconciliation, idempotent retry and late-live-before/after-finalize races required. Disposable PG with TCP disabled, real commit barriers, duplicate retry, deleted-row tombstone, same-day separate sessions, cross-user checks, teardown/status verification. Distinguish minimal fixture from full schema/RLS and keep production rollout separate.
5. Retained `supabase/tests/i3_cardio_storage.mts` legacy negative-control receipt historically exposed HTTP200 on failed insert. Not rerun here; the new honest500 contract may require a separately documented assertion adaptation before SQL rerun, never relabel the original receipt green.
6. Parent independent SPEC then QUALITY for this bounded checkpoint. Full P4 remains incomplete until SQL and integration acceptance criteria are implemented/executed/reviewed; no deadline promise.
