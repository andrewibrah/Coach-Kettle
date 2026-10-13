# Session persistence and write ownership Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:** I2, I3 (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline
- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### P1 — Serialize drafts and restore active sessions

**Latest bounded gate (parent-reported): local SPEC PASS / QUALITY APPROVED**, reviewer3127 full /144 P1+schedule /10 extra checks; lint/typecheck/diff exit0. Not native/provider/DB completion. The implementation_pending_review paragraph below is a preserved historical receipt; broader P1 checklist/policy/release items remain open.

**Current bounded local status: implementation_pending_review.** Parent reports initial P1 SPEC PASS, then QUALITY REQUIRED R1/R2. Both quality defects are now repaired locally: automatic hook rollover and route cleanup wait for recovery resolution, and every known optional draft metadata field is checked before restore without modifying raw corrupt data. Final119 P1/144 with schedule/3127 full pass; retained119 I2/2191 first-slice pass; lint/direct app tsc/diff exit0. [Quality repair strict RED/GREEN, real hook/storage/React-child evidence and next review contract](evidence/p1-quality-repairs-local.md). Prior v1 empty-snapshot/queue/generation/overnight/ghost/Start-gate work and all preceding tests are preserved; [original P1 evidence](evidence/p1-draft-integrity-local.md) remains historical. Parent independent SPEC regression then QUALITY re-review required before advance. Original schema-version/lifecycle migration, richer recovery picker/abandoned TTL and native completion below remain unapproved/deferred; no whole-checklist completion claim.

**Objective / evidence:** executed F2; source-verified F8/F9; ordering risks. Serialize drafts and restore active sessions.

**Audit coverage:** F2, F8, F9. **Depends on:** I2. **Policy:** D04, D05.

**Exact targets:**
- `lib/workoutDraft.ts`
- `hooks/useWorkoutSession.ts`
- `app/(tabs)/index.tsx`
- `contexts/AuthProvider.tsx`
- `lib/__tests__/workoutDraftLifecycle.test.ts (proposed)`

**Symbols / seams:** `getWorkoutDraft`, `saveWorkoutDraft`, `clearWorkoutDraft`, `restoreWorkoutSession`, `handleImportRoutine`.

**Failure-first reproduction:** Settled draft + clear/delete-last leaves old saved row. Overnight restore silently discards active session; persisted syncing ghost returns permanent Parsing. Restore/import and write-after-clear are unverified schedules.

**Action checklist:**
- [ ] Add failing storage tests: settled save→clear/delete-last→fresh mount; queued save→clear→late commit; overnight active vs abandoned; malformed draft and syncing ghost.
- [ ] Version draft with explicit lifecycle/revision; serialize save/clear, cancel debounces and write an empty state/tombstone even when rows=[]; surface storage errors.
- [ ] Preserve original workout ID/date and restore title; apply approved D04 retention, not same-day-only logic.
- [ ] Recover ghost as explicit failed/retry input or remove with notice under D05; never automatically replay a provider request.
- [ ] Gate routine import and all Start paths on completed restoration; old read callbacks must not overwrite a newer session. Add new cache keys to AuthProvider cleanup.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/workoutDraftLifecycle.test.ts lib/__tests__/programSchedule.test.ts`

**Acceptance gate / expected result:** No deleted row resurrection, immortal ghost or restore/import overwrite. Overnight policy preserves ID/date and original performance; invalidation failure is visible. Native kill/reopen still required in V2. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Backward-readable v1 conversion; preserve raw draft until migration succeeds. HIGH clearWorkoutDraft impact requires cache/reset review.

### P2 — Fence End/save and late responses

**Current bounded local status: implementation_pending_review.** F3/F4 repaired with synchronous End reservation and snapshot identity/revision, explicit phases/freeze/dismiss guards, shared typed/button confirmation, immediate local performance durability with bounded optional review, honest save/cleanup failure retry and owner/request/lifecycle/P1-generation fences. Both empty and performed paths check their own post-clear generation; stale callbacks cannot unlock newer requests or reset replacement rows. Real API synthetic review fallback removed, not a whole C3 overhaul. Final77 P2/144 P1+schedule/119 retained I2/2191 input/3204 full pass; lint(no warnings)/direct app tsc/diff exit0. [Strict TDD and actual route/storage/component evidence](evidence/p2-session-ownership-local.md). Independent SPEC regression then QUALITY required. D06 uses the recommended integrity-only freeze default; not medical policy. Already-dispatched backend/native writes, global history, P3 cardio, P4/P5 and native/provider/DB/release remain deferred; the original full-contract checklist below is not marked wholly complete.

**Objective / evidence:** executed defects; additional callback schedules unverified. Fence End/save and late responses.

**Audit coverage:** F3, F4. **Depends on:** I2, P1. **Policy:** D06.

**Exact targets:**
- `app/(tabs)/index.tsx`
- `hooks/useWorkoutSession.ts`
- `lib/sessionOwnership.ts (proposed)`
- `components/workout/WorkoutBottomBar.tsx`
- `components/modals/SessionReviewModal.tsx`
- `lib/submitGuard.ts`
- `lib/__tests__/sessionOwnership.test.ts (proposed)`

**Symbols / seams:** `onEndWorkout`, `handleEndWorkoutWithReview`, `sendMessage`, `submitCoachQuestion`, `commitPendingAndGet`, `createSubmitGuard`.

**Failure-first reproduction:** Defer review→close→add row→resolve: new row discarded. Defer parse→clear→resolve: cleared table repopulates. Defer answer→End→resolve: previous-session bubble appears.

**Action checklist:**
- [ ] Write red tests with deferred review/save/chat/streams; include repeat End, local failure and old finally after newer request.
- [ ] Acquire synchronous End ownership before confirmation/await; commit pending edits and freeze one immutable performed snapshot under D06.
- [ ] Capture session ID, row revision and request generation; validate every answer/row/chunk/PR/rest callback and finally.
- [ ] Invalidate on clear/end/restart/delete/rename as applicability requires; clear old bubble/rest prompts. Provider cancellation cannot undo committed backend writes.
- [ ] Disable mutations and review-modal close as approved; button and typed done use same End gate. Review failure must not prevent saving performance (C3).
- [ ] Clear only owning session after confirmed durable local write. Failure retains draft/snapshot and retry; remote failure leaves pending-sync.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/sessionOwnership.test.ts lib/__tests__/submitGuard.test.ts`

**Acceptance gate / expected result:** No silent discarded edit, stale row/answer/chunk/PR/rest effect or stale finally unlocking newer request. Actual HomeScreen wiring tested, not guard utility alone. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Never clear failed local save to simulate success; preserve recoverable snapshot. Disable End rather than remove ownership fences.

### P3 — Cardio and performance final-save roundtrip

**Current bounded local status: implementation_pending_review.** Actual AI ingestion now preserves cardio quantities/units, canonical ID/time, explicit zero/false, set classification and targets using existing performed/planned semantics. End durably saves all performed rows but requests strength review only for performed non-cardio rows; direct API no-strength calls reject before provider IO, and cardio-only saves keep null/absent review. Combined actual send/builder/End/hook/storage/API/history handler offline tests cover mixed/legacy/planned/missing optional/zero rows, local failure then retry and pending-sync retry. Final31 P3 /202 retained P2+I2 /3216 full pass, no skips; lint/diff exit0. **App tsc blocked by lifecycle scan cap, no verdict/bypass.** [Strict RED/GREEN, retained fixture diagnosis, graph risk and limits](evidence/p3-cardio-spec-repairs-local.md). Independent SPEC regression then QUALITY required. Native/SQL/provider/deployed verification and P4/P5 remain open; original checklist is not wholly complete.

**Objective / evidence:** executed payload loss; backend replacement source verified. Cardio and performance final-save roundtrip.

**Audit coverage:** F1. **Depends on:** I2, I3, P2. **Policy:** No additional choice.

**Exact targets:**
- `app/(tabs)/index.tsx`
- `hooks/useWorkoutSession.ts`
- `lib/api.ts`
- `lib/workoutStorage.ts`
- `supabase/functions/history/index.ts`
- `lib/workoutSerialization.ts (proposed)`
- `lib/__tests__/workoutRoundtrip.test.ts (proposed)`
- `supabase/functions/history/roundtrip.test.ts (proposed)`

**Symbols / seams:** `toApiRows`, `buildWorkoutToSave`, `handleEndWorkoutWithReview`, `WorkoutRow`, `saveWorkout`.

**Failure-first reproduction:** Cardio log retains fields live; End storedRows drops isCardio/duration/distance/unit/heartRate/calories/level and final history replacement defaults non-cardio.

**Action checklist:**
- [ ] Add failing composer→End payload→local save/read→history mapping fixture carrying every cardio field.
- [ ] Replace ad hoc maps with explicit typed serializer retaining row/session identity, classification, effort/pain and timestamps.
- [ ] Update buildWorkoutToSave signature and AI-parsed cardio path; strength PR/review exclude cardio and unperformed rows.
- [ ] Verify offline pending-sync retry and history replacement preserve exact quantities/units.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/workoutRoundtrip.test.ts lib/__tests__/workoutSource.test.ts supabase/functions/history/roundtrip.test.ts`

**Acceptance gate / expected result:** All fields survive actual route/local/handler paths; JSON-only fixture is not enough. No cardio converted into strength zero rows. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Additive readable fields; retain original payload. Do not fabricate backfilled cardio values.

### P4 — Idempotent submissions and transactional finalization

**APPROVED (local) 2026-10-13:** independent SPEC then QUALITY passed after repairs (72191e4, 5963350, 5f675c6). Open: F6 LOW, QUALITY residuals, D08 product choices, native/simulator and production rollout per [runbook](P4_ROLLOUT_RUNBOOK.md). [Evidence](evidence/p4-final-review-local.md). Paragraphs below are historical receipts.

**Recovered live-edit/Clear/abandon checkpoint: implementation_pending_review; independent SPEC then QUALITY required.** Prior first/transactional bounded checkpoints parent-approved. Actual owner-bound durable outbox/delivery, reversible row correction, permanent tombstone retries, Clear empty-active recovery plus legitimate later IDs, explicit abandon and replacement isolation are implemented locally. Strict SQL integration RED caught missing `revise` RPC support; final352 focused/3357 full, lint without warnings/permitted app tsc pass;728 actual JS-bridge RPC calls,3 new real lock barriers and31 invalid-revise no-effects retain prior Unicode/IEEE/rollback controls. Migration UNAPPLIED. Native/Deno/full-schema/RLS/rollout/P5 and retention/cross-device product choices remain open; whole P4 not approved. [Current receipts and precise review contract](evidence/p4-live-delivery-recovery.md). Following checkpoint paragraphs are historical receipts.

**SPEC2 R1/R2 follow-up: implementation_pending_review; independent re-SPEC then QUALITY still required.** Direct authenticated SQL strictly validates NEW rows/snapshots and projection coherence before writes; compatible omitted legacy metadata/raw quarantine remain preserved. Permanent delete has deterministic terminal identity and returns the original committed receipt across lost acknowledgements, acknowledged retries and a fresh API module. Disposable actual API/Edge/SQL: retained23 RPC baseline/16 capacity readbacks plus50 shared-contract parity checks,62 invalid-row rejections,18 existing-state no-effect snapshot comparisons and prior lock/rollback controls. Contract-valid large set ordinals exposed int32 capacity; unapplied proposal now widens set_number to bigint, adding a full-schema dependency/grants review gate.214 focused/3338 full pass; lint/diff pass; tsc BLOCKED/no verdict. No rollout, native restart/outbox claim or P5 expansion. Details: [updated evidence](evidence/p4-session-operations-local.md).


**Latest session-operation checkpoint: implementation_pending_review; full P4 incomplete.** Authenticated composer/row-delete/API/Edge operation transport and UNAPPLIED `20261008000300_session_operation_integrity.sql` implemented. Session locks/tombstones/receipts, authoritative transactional snapshot/log/PR and owner rejection verified with real disposable PG barriers and rollback failures;214 focused/3338 full, lint/diff pass. App tsc BLOCKED/no verdict; Deno unavailable. Broader live-edit/Clear/abandon delivery, P5 concurrency and full-schema/native/rollout remain open. Parent reports first bounded checkpoint SPEC/QUALITY approved; this new slice needs independent SPEC then QUALITY. [Actual receipts and minimal fixture limits](evidence/p4-session-operations-local.md). Original checkpoint paragraph below is historical, not the current protocol status.

**First bounded checkpoint: implementation_pending_review; full P4 incomplete.** Actual synchronous rendered-callback fast/skeleton/AI guard and sanitized history delete/insert/PR500 failure handling verified with206 focused/3330 full, lint/direct app tsc/diff exit0. Parent SPEC then QUALITY required. Session-owned authenticated protocol/transactional final snapshot/tombstone/revision/old-client safety and disposable SQL races NOT implemented/verified; existing daily-live deletion still unsafe. No migration proposal or DB execution in this slice. [Strict RED/GREEN, fixture diagnosis and exact next contract](evidence/p4-first-checkpoint-local.md). Parent reports bounded P2/P3/I3/C2 approved; historical pending paragraphs are receipts, not current gates or whole-task completion.

**Objective / evidence:** executed duplicate callback; backend races unverified. Idempotent submissions and transactional finalization.

**Audit coverage:** F5. **Depends on:** I3, P2, P3. **Policy:** D08.

**Exact targets:**
- `lib/submitGuard.ts`
- `app/(tabs)/index.tsx`
- `lib/api.ts`
- `supabase/functions/log-set/index.ts`
- `supabase/functions/history/index.ts`
- `supabase/migrations/20261008000300_session_operation_integrity.sql (UNAPPLIED)`
- `lib/__tests__/submissionIdempotency.test.ts (proposed)`
- `supabase/tests/p4_session_sql.py` and `supabase/tests/p4_edge_sql.mts` (disposable only)

**Symbols / seams:** `createSubmitGuard`, `sendMessage`, `syncSkeletonFilledRow`, `api.logSet`, `history/saveWorkout`, `reconcile_workout_prs`.

**Failure-first reproduction:** Same rendered callback twice: one UI row/two log calls. Source daily live ID lacks session/row idempotency; late insert after reconciliation, abandoned edits and simultaneous sessions are risks, not observed deployed corruption.

**Action checklist:**
- [ ] Fail same-render button+keyboard fast/skeleton/AI and End replay tests; wire synchronous guard to real handlers.
- [ ] Carry stable authenticated session/row ID/revision and operation idempotency key; identical legitimate second sets have distinct row IDs.
- [ ] Resolve D08 corrections/delete/abandon/old-client policy; replace daily shared live ownership.
- [ ] Prepare additive uniqueness/upsert and transactional finalization fence; late live commit checks finalized revision inside transaction, not only at response time.
- [ ] Run local DB commit barriers for live-before/after finalization, duplicate retry, delete tombstone and two same-day sessions. Test cross-user key rejection/RLS.
- [ ] Final history retry and PR reconciliation must be session-safe and idempotent. Document local recovery and staged compatibility rollout.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/submissionIdempotency.test.ts lib/__tests__/submitGuard.test.ts`
- `psql "$COACH_KETTLE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/session_write_ownership.sql` (proposed; disposable local database only)

**Acceptance gate / expected result:** One operation→one row; legitimate repeated sets preserved; actual SQL commit barriers prevent finalized resurrection and cross-session deletion. Until executed, backend race outcome remains unresolved. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Authorized human deploys additive schema before compatible server/client. Disable live sync if old-client safety cannot be retained; preserve user data and pending-sync.

### P5 — Local history concurrency experiments and repair

**Objective / evidence:** unverified storage races. Local history concurrency experiments and repair.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** P3, P4. **Policy:** No additional choice.

**Exact targets:**
- `lib/workoutStorage.ts`
- `lib/__tests__/workoutStorageConcurrency.test.ts (proposed)`

**Symbols / seams:** `upsertLocal`, `syncPendingWorkouts`, `deleteWorkout`, `saveWorkout`.

**Failure-first reproduction:** Unguarded read-modify-write and clearing pending state with stale snapshots support risk; no commit-barrier reproduction was run.

**Action checklist:**
- [ ] Build controlled barriers for two saves, save+delete and old retry acknowledgement after newer revision.
- [ ] If reproduced, serialize storage-key operations and merge session/revisions; stale ack clears only matching revision.
- [ ] Record non-reproduction honestly; avoid speculative broad refactor. Test interruption recovery and history refresh/save callers.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/workoutStorageConcurrency.test.ts`

**Acceptance gate / expected result:** No newer pending revision or separate workout lost in barrier schedules; do not infer cross-process atomicity from JS queue. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Keep history backup/revisions; revert without restoring stale snapshots. HIGH saveWorkout graph risk warrants review.

