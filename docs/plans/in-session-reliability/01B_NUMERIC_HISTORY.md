# Numeric boundaries and history baseline Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:** I2 (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline

**Authorized I3 SPEC follow-up:** implementation_pending_review, not whole-task complete. Cardio whole-token scanner, actual chat metadata projection and untrusted enums/envelopes repaired with strict TDD;155 focused/3308 full pass, lint/direct app tsc/diff exit0. Reused disposable scratch PG15.14 TCP-disabled transaction:59 JS/SQL trigger/quarantine/reconcile parity cases pass, ROLLBACK, cluster stopped verified. Additive unapplied SQL aligns guarded floating-point rounding/overflow and classification. Deno/full RLS/native/deployed/coordinated schema rollout gates remain open. [Latest evidence](evidence/i3-spec-repairs-local.md); [historical checkpoint](evidence/i3-numeric-integrity-local.md). Independent SPEC then QUALITY required; unchecked policy/release items below remain unresolved.
- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### I3 — One numeric contract across parser, inline/modal, Edge and SQL

**Objective / evidence:** runtime/source-verified bugs; database effects predicted. One numeric contract across parser, inline/modal, Edge and SQL.

**Audit coverage:** S7, S8, F6. **Depends on:** I2. **Policy:** D01, D03.

**Exact targets:**
- `lib/workoutValidation.ts (proposed)`
- `types/workout.ts`
- `lib/structuredGate.ts`
- `components/modals/EditSetModal.tsx`
- `app/(tabs)/index.tsx`
- `supabase/functions/_shared/workoutValidation.ts (proposed adapter)`
- `supabase/functions/log-set/index.ts`
- `supabase/functions/chat/index.ts`
- `supabase/functions/history/index.ts`
- `supabase/functions/_shared/liftMatching.ts`
- `supabase/migrations/20261008000100_in_session_numeric_integrity.sql (proposed; check timestamp conflict)`
- `lib/__tests__/workoutValidation.test.ts (proposed)`
- `supabase/functions/_shared/workoutValidation.test.ts (proposed)`
- `supabase/tests/in_session_numeric_integrity.sql (proposed)`

**Symbols / seams:** `applyPendingEdit`, `handleSaveSet`, `EditSetModal/onSave`, `epley1rm`, `update_pr_from_workout_log`, `reconcile_workout_prs`.

**Failure-first reproduction:** Paste blank exercise/NaN weight/-1 reps into Edit Set: accepted. 8.5 or 8oops is truncated in API/inline but DB integer cast differs. Missing values become 0; bodyweight 0×12 can recommend external 5 lb. Invalid historical strings can throw SQL casts.

**Action checklist:**
- [ ] Create a shared golden matrix: empty/null, 0, negative, decimal reps, NaN/Infinity, 8oops, kg/unsupported units, set number, cardio quantities.
- [ ] Approve missing/bodyweight/zero-rep policy D01; represent unknown distinctly from explicit zero. Parse canonical finite load and whole reps without parseInt prefix acceptance.
- [ ] Use a pure validation contract in app and Deno adapter with parity tests; enforce again server-side for untrusted AI/HTTP requests and history uploads.
- [ ] Block invalid modal/inline save with visible field feedback; retain input on blur/backdrop rather than silently committing.
- [ ] Prepare additive SQL validation/backfill quarantine strategy; audit counts locally, exclude malformed/unknown/unperformed/warmup/cardio from strength PR and progression. Guard reconcile casts too. Do not delete legacy raw strings.
- [ ] Run isolated disposable PostgreSQL fixtures before claiming SQL correctness; verify RLS/auth and no PR response/trigger numeric mismatch.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/workoutValidation.test.ts supabase/functions/_shared/workoutValidation.test.ts`
- `psql "$COACH_KETTLE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/in_session_numeric_integrity.sql` (proposed fixture; disposable local DB only)

**Acceptance gate / expected result:** All entry paths agree on golden cases; incomplete load/reps is never a training zero; bodyweight does not invent external loading; malformed stored history cannot 500 PR/next-set. DB test is blocked, not passed, if local fixture environment unavailable. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Additive columns/read fallback; preserve raw legacy values and export quarantine counts before any conversion. User approves migration separately; never rewrite applied migrations.

### H1 — Correct aliases, completed-session history and progression baseline

**Objective / evidence:** source-verified bugs plus proposed policy. Correct aliases, completed-session history and progression baseline.

**Audit coverage:** S9. **Depends on:** I3. **Policy:** D03, D07.

**Exact targets:**
- `lib/programming.ts`
- `types/programming.ts`
- `supabase/functions/next-set/index.ts`
- `supabase/functions/_shared/liftMatching.ts`
- `supabase/migrations/20261008000200_in_session_history_baseline.sql (proposed; confirm chronology)`
- `app/program/day.tsx`
- `components/workout/NextSetSuggestion.tsx`
- `supabase/tests/in_session_history_baseline.sql (proposed)`
- `lib/__tests__/nextSetBaseline.test.ts (proposed)`

**Symbols / seams:** `fetchNextSetSuggestion`, `resolveTrackedLift`, `suggest_next_set`, `ProgramDayScreen`, `NextSetSuggestionPill`.

**Failure-first reproduction:** Bench logging canonicalizes Bench Press but RPC lookup Bench misses history; newest calendar day/current live sets supplant prior completed session and merge same-day workouts. Warmup/backoff spread contaminates load decisions; micro_load label hardcodes +2.5.

**Action checklist:**
- [ ] Build completed yesterday/live today/two completed same-day sessions/alias/warmup/backoff/bodyweight fixtures.
- [ ] Resolve canonical exercise identity consistently at log and query, retaining typed display name. Do not merge distinct exercises without approved alias mapping.
- [ ] Select prior completed workout ID, not MAX(date), excluding current session; keep within-session performed sequence as separate input for future A2.
- [ ] Guard numeric selection and classifications with I3 contract; choose approved goal/equipment step D07 rather than blindly copying legacy increments.
- [ ] Render numeric delta from actual suggestion and explicit unavailable/no-history states on program day; test casing-only component refresh cancellation risk.
- [ ] Check direct callers ProgramDayScreen/NextSetSuggestionPill; document in-session mount is new A3 scope, not already implemented.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/nextSetBaseline.test.ts`
- `psql "$COACH_KETTLE_TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/in_session_history_baseline.sql` (proposed; isolated local DB)

**Acceptance gate / expected result:** Aliases resolve same valid historical lift; prior session never silently means today live or merged day. Warmup/cardio/unknown values excluded; backoff policy approved; labels match returned deltas. No in-session adaptive claim yet. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Version RPC response/additive migration, keep old clients readable; disable suggestion display if contract mismatch, never return confident invented load.
