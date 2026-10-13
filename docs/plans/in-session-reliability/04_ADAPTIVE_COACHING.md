# Proposed adaptive coaching Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:** C1, C2, C3, H1, I3, P1, P2, P4 (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline
- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### A1 — Structured readiness, pain and effort answers with applicability

**Objective / evidence:** proposed feature; architecture gap verified, not existing functionality. Structured readiness, pain and effort answers with applicability.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** I3, P1, P2, C1. **Policy:** D01, D09.

**Exact targets:**
- `types/coaching.ts (proposed)`
- `types/workout.ts`
- `lib/coachingAnswers.ts (proposed)`
- `lib/workoutDraft.ts`
- `components/workout/CoachingQuestions.tsx (proposed)`
- `app/(tabs)/index.tsx`
- `supabase/functions/next-set/index.ts`
- `lib/__tests__/coachingAnswers.test.ts (proposed)`

**Symbols / seams:** `proposed CoachingAnswer/validateAnswer/isApplicable`, `LogRow`, `sendMessage`.

**Failure-first reproduction:** Current UI has no structured readiness/pain/RPE/RIR questionnaire and RPC accepts only user+exercise. Write feature absence tests first; do not claim preexisting behavior regressed.

**Action checklist:**
- [ ] Approve D09 wording/trigger cadence, pain scale vs descriptive flags, readiness/effort ranges and freshness; exercise-specific/whole-session scopes explicitly distinguish.
- [ ] Define answer ID, session/exercise/set ID, capturedAt, row revision, provenance and answered/skipped/unknown state. Explicit no-pain differs from skip; original disclosure retained.
- [ ] Validate bounds and applicability; reject stale/other-session/exercise/revision answers, retain contradiction evidence and request clarification.
- [ ] Render optional answer/skip controls after approved triggers without making routine logging inaccessible; persist/restore scoped answer state and clear stale decision.
- [ ] Test no answer, skip, changed answer, stale timestamp, clock change, rename/delete and overnight recovery; no default effort or no-pain invented.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/coachingAnswers.test.ts`

**Acceptance gate / expected result:** Answer→session/exercise/set association is testable and durable. Skipped=unknown; freshness/precedence explicit. Product approval required before feature build/release. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Additive feature switch, preserve evidence; do not let disabled questionnaire imply safety clearance.

### A2 — Deterministic next-set decisions and aligned explanations

**Objective / evidence:** proposed adaptive feature; progression/pain disconnect source verified. Deterministic next-set decisions and aligned explanations.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** A1, H1, P4. **Policy:** D07, D09.

**Exact targets:**
- `lib/nextSetDecision.ts (proposed)`
- `types/coaching.ts (proposed)`
- `types/programming.ts`
- `supabase/functions/_shared/nextSetDecision.ts (proposed adapter)`
- `supabase/functions/next-set/index.ts`
- `supabase/functions/coach/index.ts`
- `supabase/functions/chat/index.ts`
- `lib/api.ts`
- `lib/__tests__/nextSetDecision.test.ts (proposed)`
- `supabase/functions/_shared/nextSetDecision.test.ts (proposed)`

**Symbols / seams:** `proposed decideNextSet`, `suggest_next_set`, `fetchNextSetSuggestion`, `generateSessionReview`.

**Failure-first reproduction:** Current RPC looks only at date/weight/reps, not pain/effort/targets; coach/review prompts independently recommend numbers without consuming deterministic result. No observed contradictory live advice.

**Action checklist:**
- [ ] Approve deterministic rule table and thresholds D07/D09 before coding. Proposed priority: safety stop→contradictory/stale/incomplete clarify→approved fatigue/effort response→target/equipment progression→hold/no-history, never model override.
- [ ] Add table-driven red feature tests for painful high-rep set, unresolved pain with low effort, exhausted/max-effort set, missed target, prescribed backoff, skipped answer, no history/bodyweight and equipment constraints.
- [ ] Use ordered current-session performed sets separately from prior completed baseline; apply typed effort/goal/increment bounds only when fresh applicable evidence exists.
- [ ] Return decision code, allowed action/load/reps, reason and evidence IDs/version; stop/clarify contains no automatic increase. Safety copy: stop the painful exercise and seek appropriate qualified help when warranted, without diagnosis or promise of injury prevention; wording requires approval.
- [ ] Pass same deterministic result into coach/chat/review explanation contract; validate structured output for agreement and discard conflicting numeric proposals. Free prose alone is not enforcement.
- [ ] Parity-test app/Edge rule adapters and stale/revision race rejection; all thresholds live in approved versioned policy, not hidden prompt defaults.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/nextSetDecision.test.ts supabase/functions/_shared/nextSetDecision.test.ts` (proposed)

**Acceptance gate / expected result:** Pain/uncertainty cannot be overruled by high reps or model text; decisions reproducible from evidence and explanation numerics match. No medical diagnosis, treatment recommendation or injury-prevention guarantee. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Disable adaptive load advice while keeping logs and stop/clarify UX. Version rules so explanations remain interpretable; do not silently revert to legacy ungated progression.

### A3 — Mounted, refreshed in-session next-set decision UI

**Objective / evidence:** proposed feature; dormant component mount/refresh gap verified. Mounted, refreshed in-session next-set decision UI.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** A2, C2, C3. **Policy:** D09.

**Exact targets:**
- `components/workout/NextSetSuggestion.tsx`
- `components/workout/WorkoutTable.tsx`
- `components/workout/WorkoutCard.tsx`
- `app/(tabs)/index.tsx`
- `lib/programming.ts`
- `app/program/day.tsx`
- `lib/__tests__/nextSetUi.test.ts (proposed)`

**Symbols / seams:** `NextSetSuggestionPill`, `fetchNextSetSuggestion`, `HomeScreen`, `ProgramDayScreen`.

**Failure-first reproduction:** Pill definition has no HomeScreen mount; fetch effect depends only on exercise. Program day refreshes only on day change; casing-only cleanup may leave dormant pill loading (unverified).

**Action checklist:**
- [ ] Write mounted UI feature tests proving pill visible for active exercise and refresh after completed set, edit/delete, fresh answer and session change.
- [ ] Mount one decision surface at intended workout group; key refresh by session/exercise/row/answer/policy revision, not name alone.
- [ ] Use ownership/abort fence and normalized identity consistently; explicit loading/unavailable/no-history/clarify/stop states with retry and stale-label semantics.
- [ ] On Use Weight apply only the still-current approved action to next planned set, never retroactively alter performed row; stop/clarify has no increase control.
- [ ] Render evidence-linked reason and aligned coach explanation; verify keyboard, accessibility, focus, batch fills and no repeated questionnaire flood. Check program-day compatibility.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/nextSetUi.test.ts`

**Acceptance gate / expected result:** Real mounted UI responds to new evidence, rejects stale tap/response, never stuck on casing-only change and explains deterministic action. Device verification V2 is mandatory; component-only tests cannot prove session integration. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Feature-switch mount off without losing evidence/performance; fail unavailable rather than show stale load.

