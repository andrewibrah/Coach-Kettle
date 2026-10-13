# Verification and human-controlled release Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:** A3, C1, P5 (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline
- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### V1 — Close unverified gesture, restore and association risks

**Objective / evidence:** risk experiments; not confirmed user-visible defects. Close unverified gesture, restore and association risks.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** P5, C1, A3. **Policy:** D10.

**Exact targets:**
- `app/(tabs)/index.tsx`
- `hooks/useRowActions.ts`
- `components/workout/WorkoutTable.tsx`
- `components/workout/WorkoutCard.tsx`
- `lib/chatStorage.ts`
- `lib/__tests__/inSessionRiskSchedules.test.ts (proposed)`

**Symbols / seams:** `handleReorderRow`, `applyPendingEdit`, `handleSaveSet`, `handleImportRoutine`, `NextSetSuggestionPill`.

**Failure-first reproduction:** Native reorder by positional index during delete/rename could move wrong row; grouping differs modal/inline; no undo exists. These are observations/requirements gaps, not proven bugs. Draft ordering, late DB commits and local races are covered P1/P4/P5.

**Action checklist:**
- [ ] Write controlled reorder+pending edit+delete schedule and invalid fromIndex fixture; assert stable identity and no undefined rows. If reproduced, replace positional request with row ID and bounds checks, commit pending edits first.
- [ ] Ask D10 whether modal/inline rename grouping must match and whether undo is desired; document deferred feature explicitly, no implicit scope expansion.
- [ ] Verify D09 Q/A association and restored questionnaire freshness; native gesture testing follows V2.
- [ ] Record each risk reproduced/fixed/not reproduced/accepted with fixture path and residual limits; do not convert source suspicion into passed claim.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/inSessionRiskSchedules.test.ts`

**Acceptance gate / expected result:** Every listed risk has evidence or explicit owner acceptance, with observed behavior separated from policy decisions. No unchecked positional mutation/data loss remains in required schedules. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Risk fixes surgical and reversible; no broad row-action rewrite absent reproduction.

### V2 — Offline, local DB and real-device release matrix

**Objective / evidence:** verification; not implementation. Offline, local DB and real-device release matrix.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** V1. **Policy:** No additional choice.

**Exact targets:**
- `lib/__tests__/*.test.ts`
- `supabase/functions/_shared/*.test.ts`
- `supabase/functions/chat/handler.test.ts`
- `supabase/functions/coach/handler.test.ts`
- `supabase/tests/*.sql (proposed local fixtures)`
- `docs/plans/in-session-reliability/release-results.md (proposed executor report)`

**Symbols / seams:** `HomeScreen`, `saveWorkout`, `suggest_next_set`, `coach streaming handler`.

**Failure-first reproduction:** Current pure tests/probes do not mount React Native, execute PostgreSQL, verify real AsyncStorage commit order or deployed provider behavior; prior lint/typecheck guard blocked without verdict.

**Action checklist:**
- [ ] Run regression suites and actual route-wiring tests after every change; desired-behavior tests red before fix/green after. Keep probes as historical defect evidence, update durable regression tests rather than invert evidence silently.
- [ ] Run isolated local SQL fixtures including transaction barriers/RLS/legacy rows and schema+function compatibility; missing DB tooling is blocker, not mock pass.
- [ ] Run lint/app typecheck and Edge Deno checks separately. If runtime guard blocks, record exact error and run authorized interactive checks; never bypass guard or mark pass.
- [ ] On simulator and physical iOS device test routine/freeform/bodyweight/cardio, pending inline/modal edits, offline/retry, rapid return+button, End races, clear/delete-last/reopen, kill-mid-parse, overnight/timezone, restore/import, gestures and error/stream states.
- [ ] Inspect actual local history after save/reopen; inspect isolated backend exact user/session/row targets after sync. Confirm no duplicated/finalized live rows and no dropped fields.
- [ ] Adversarial adaptive tests: skip/stale/contradictory pain+effort, stop/clarify, fresh answer refresh and explanation agreement. Record device/OS/build and full output; no real model safety assertion without approved live evaluation.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test "lib/__tests__/*.test.ts"`
- `node --experimental-strip-types --test "supabase/functions/_shared/*.test.ts" supabase/functions/chat/handler.test.ts supabase/functions/coach/handler.test.ts`
- `npm run lint`
- `./node_modules/.bin/tsc --noEmit`
- `deno check --config supabase/functions/deno.json supabase/functions/chat/index.ts supabase/functions/coach/index.ts supabase/functions/log-set/index.ts supabase/functions/history/index.ts supabase/functions/next-set/index.ts` (executor only; preapproved dependency cache/network policy)
- `npx --no-install expo run:ios` (executor only; device/build approval)

**Acceptance gate / expected result:** Every ranked audit regression plus local DB/device matrix has actual results. Missing checks stay blocked; mocks cannot certify deployed behavior. Native tests and approved product safety wording required before adaptive release. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** If gate fails, retain verified logging-only scope with adaptive/review disabled; do not ship guessed fixes.

### V3 — Human-controlled staged rollout and release signoff

**Objective / evidence:** release authorization gate. Human-controlled staged rollout and release signoff.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** V2. **Policy:** No additional choice.

**Exact targets:**
- `supabase/migrations/ (only proposed additive files from I3/H1/P4/C1)`
- `supabase/functions/ (only changed targets)`
- `docs/plans/in-session-reliability/release-results.md (proposed executor record)`
- `app.json (inspect current config; no planning edit)`

**Symbols / seams:** `numeric/history/finalization RPC contracts`, `HomeScreen feature switches`.

**Failure-first reproduction:** No deployed migration/version/provider/device acceptance established by audit. App Store/TestFlight processing and human approval are external prerequisites, not completed development.

**Action checklist:**
- [ ] Review graph impact for every changed symbol; rerun detect-changes and inspect actual diff, including HIGH/CRITICAL callers. No unrelated CLAUDE/dependency changes.
- [ ] Approve backups, additive migration ordering, server/client compatibility, feature-disable switches and recoverable pending-sync handling.
- [ ] Authorized user alone applies migrations/deploys functions to approved target; verify exact deployed schema/function versions, then exact test user/session records and rollout metrics. No deployment during this plan.
- [ ] Release reliability baseline separately from adaptive feature when gates justify; adaptive remains disabled until A1–A3/V2 policy and device signoff.
- [ ] Record human signoff, build identity and processing/review status. Apple build/TestFlight/App Review waiting is external and unpredictable; do not invent deadlines.
- [ ] Monitor duplicates/reconciliation failures/draft recovery/incomplete streams without logging symptom secrets; rollback feature first, preserve compatible schema/data.

**Checks (expected behaviors, not executed results):**
- `node .gitnexus/run.cjs detect-changes --scope all --repo WorkoutTracker`
- `supabase db push` (authorized human only; confirm linked target)
- `supabase functions deploy <approved-changed-function>` (authorized human only)
- `git diff --stat; git status --short`

**Acceptance gate / expected result:** No release until verification report, product decisions, compatible migration/server/client rollout and human signoff are complete. Post-write readback proves deployment effect; success exit alone insufficient. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Disable affected UI/remote features and roll back compatible app/functions; forward-fix additive schema instead of destructive data rollback. User controls deployments.

