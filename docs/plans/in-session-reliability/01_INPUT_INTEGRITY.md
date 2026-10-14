# Input integrity and performed-set identity Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:**  (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline

**Latest quality-review R1 repair (still partial):** Attached/spaced colon/equal terminates an ambiguous unit label before bodyweight fallback; unsupported/malformed label-delimiter-number attempts now clarify, preserve the composer, and cannot fabricate reps or cause AI/log/rest/PR/end effects. Literal `RPE:9`, `RIR=2`, unknown/narrative/explicit-delimiter notes and custom/bodyweight/mode controls remain covered. The actual-route harness now captures async chat-history storage and rejects unexpected caught exceptions, exempting only its deliberate provider-error fixture by identity; a successful-answer regression verifies storage without entering catch. Strict TDD receipts are in `doc.md`: parser matrix RED 702/56, route-first exact R1 RED 0/4; final targeted **2191 pass / 0 fail**, full lib **2906 pass / 0 fail**, standalone reviewer repro **9/9 pass**. Prior 10/64/345 probes pass, lint/direct app typecheck/diff check exit 0. Aggregate graph remains HIGH/stale/truncated, not all-clear. Parent independent spec regression gate then quality re-review pending; D1/I1 remain partial, I2 not begun.

**Latest three-family boundary repair (still partial):** Spaced signs and x/×/colon/equal separators cannot rescue arbitrary single/multiword unit-shaped pairs through the bodyweight fallback. Punctuated RPE/RIR/pain/fatigue annotations remain literal notes; predicate/elapsed-time symptom narratives remain answer-only even when an offline model response contains rows. No exercise allowlist was introduced; legitimate custom/movement controls remain covered. Four vertical RED→GREEN cycles are recorded in `doc.md`. Final real-parser/actual-route targeted suite: **1426 pass / 0 fail**; full lib suite: **2141 pass / 0 fail**; unmodified adversarial 10-scenario, independent 64-scenario and structural 345-check probes all pass. Lint/direct app typecheck/diff check exit 0. Aggregate graph remains HIGH with stale/truncated coverage. This is bounded grammar evidence, not universal NLP or independent approval. D1/I1 remain partial, spec re-review then quality review pending; structured effort, comma/bare policy and I2 deferred.
**First slice progress — partial D1 / partial I1:** Authorized development implements an offline AST-extracted HomeScreen `sendMessage` harness using the real parser, explicit validation outcomes for the corrupted single-set examples, and literal trailing metadata in notes. Independent spec review found bodyweight-note and question-punctuation gaps; strict RED→GREEN repairs now cover explicit bodyweight disclosures/new rows, valid `Bench 185 8 shoulder pain?`, genuine numerical question compatibility, and malformed question-tail validation without effects. A further failed spec re-review required a coherent set-intent classifier before punctuation-based question routing and literal weighted/bodyweight delimiter grammar. Missing-reps/sign/fraction/unit punctuation families and standalone numeric questions now execute both the real parser and actual extracted route. Latest structural follow-up: narrative classification runs independently of punctuation before exercise recognition; annotations cannot select cardio/dropset/superset or prose warmup modes, while intentional command shapes remain tested. Conversational AI-returned rows are refused by the actual route. Latest unsupported-unit fallback follow-up: an apparent single-label/second-number suffix cannot override failed weighted parsing as bodyweight notes; positive effort/observation/relational annotation introducers remain literal, not structured metadata. Varied arbitrary unit tokens and token punctuation are covered through the real parser/extracted route without expanding a unit denylist. Final targeted regressions: 813 passed / 0 failed; full lib suite: 1528 passed / 0 failed; the unmodified independently failing 64-scenario scratch spec now passes 64 / 0, and the prior 345-check scratch probe still passes. App lint, direct `npx tsc --noEmit`, and diff check exit 0. Two vertical RED→GREEN cycles and exact syntax limitations are recorded in `doc.md`. These are execution receipts, not spec approval; independent spec re-review then quality review remain pending. No device, Edge, SQL or deployment verification. See `doc.md` for exact RED/GREEN history, guard error and graph HIGH residual risk, and implementation defaults in `DECISIONS.md`. Do not check off all D1/I1 actions: structured effort policy, comma skeleton grammar/overflow, broader harness contracts, and I2 performed-state/warmup/fill-sync remain unimplemented.

- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### D1 — Lock contracts and failing regression harness

**Objective / evidence:** planning prerequisite. Lock contracts and failing regression harness.

**Audit coverage:** Architecture/risk/verification scope; see master supplemental map. **Depends on:** None. **Policy:** D01, D02, D03, D04, D05, D06, D07, D08, D09.

**Exact targets:**
- `AGENTS.md`
- `types/workout.ts`
- `lib/submitGuard.ts`
- `lib/__tests__/inSessionHarness.test.ts (proposed)`
- `docs/plans/in-session-reliability/DECISIONS.md (record approved choices in this existing plan document)`

**Symbols / seams:** `LogRow`, `createSubmitGuard`, `HomeScreen`.

**Failure-first reproduction:** Run all three scratch probes against unchanged source; their assertions confirm defects rather than verify fixes. Capture parser/session/transport fixtures as expectations that fail on current behavior. Do not mistake current probe exit 0 for fixed behavior.

**Action checklist:**
- [ ] Read the preserved audits and graph evidence; compare HEAD/status, preserving both existing CLAUDE edits.
- [ ] Have product owner resolve blocking D01–D09; record choices and dissent, not implicit defaults.
- [ ] Build small deferred Promise, fake clock/storage, and captured request helpers with explicit offline doubles.
- [ ] Extract only pure transition/serialization functions needed by tests; keep an actual HomeScreen wiring regression so helper-only coverage cannot mask unused utilities.
- [ ] Separate confirmed defect tests from risk experiments; record baseline failures and test exclusions.

**Checks (expected behaviors, not executed results):**
- `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-set-probe.cjs`
- `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-question-probes.cjs`
- `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-state-probe.cjs`
- `node --experimental-strip-types --test lib/__tests__/inSessionHarness.test.ts`

**Acceptance gate / expected result:** Fixtures are offline, deterministic and execute real domain/route wiring; current defects produce red desired-behavior tests. New file/test names in this plan are proposed, not present or passing. Decisions requiring clinical/product input remain blocked until approved. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Documentation/harness can be reverted without data changes; no framework installs during planning.

### I1 — Stop parser corruption and preserve disclosed effort/pain

**Objective / evidence:** runtime-verified bugs. Stop parser corruption and preserve disclosed effort/pain.

**Audit coverage:** S1, S2, S6, Q1. **Depends on:** D1. **Policy:** D01, D02.

**Exact targets:**
- `lib/structuredGate.ts`
- `types/workout.ts`
- `lib/__tests__/structuredGateIntegrity.test.ts (proposed)`

**Symbols / seams:** `decideAndParse`, `ParsedRow`, `LogRow`.

**Failure-first reproduction:** Bench 185kg → 18×5; Bench 185 x -8 → 18×5; Bench 100 oz 8 → 10×0; Bench -185 x 8 loses sign. Bench 185 8 RPE 9/RIR 2/sharp shoulder pain loses tail. With four template rows, 100,10,120,10 becomes four weights instead of two pairs.

**Action checklist:**
- [ ] Add table-driven red fixtures for every example, valid kg/plates/bodyweight/multiple-pair grammar, and unknown trailing text.
- [ ] Require full token consumption and explicit separators/units; never backtrack-split a numeral or skip a negative sign.
- [ ] Parse effort metadata only when explicit and valid; retain original symptom language and unknown tail losslessly. No NLP diagnosis from a regex.
- [ ] Apply one comma-pair grammar before routine filling; on excess pairs ask/retain input instead of truncation.
- [ ] Make ambiguous bare numbers request confirmation under approved D02; distinguish high-rep bodyweight from inferred load.
- [ ] Return validation/clarification decisions with preserved input rather than malformed fast rows; connect route in I2.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/structuredGateIntegrity.test.ts`

**Acceptance gate / expected result:** All invalid examples produce no performed row/PR/live write; valid Bench 100kg 5 still equals 220.5 lb×5; pain/no-pain/exhaustion are distinct evidence, RPE/RIR retained, no unconsumed text silently erased. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Revert parser independently only behind temporary disabled fast-logging path; never roll back to silent corruption for existing users.

### I2 — Separate planned targets, performed sets and warmup identity

**Current status: implementation_pending_review.** Parent reports preceding bounded I1 slice independently SPEC PASS / QUALITY APPROVED; whole D1/I1 stay partial. Independent I2 SPEC FAIL exposed three production-path gaps; strict RED-first follow-up now repairs performed-only repeat/dependent-history sources, incomplete AI-row live-effect exclusion, and explicit warmup-preserving same. Real builder/numbering/ID helpers replace clean-row/row-count stubs in actual extracted route tests; intermediate ghost/loading lifecycle and End/local JSON consistency are checked. First eligible target10/actual8 identity, load-only staging, zero and original classifications remain covered. Final **39 new repair tests /90 targeted /2979 full /2191 retained first-slice pass**, lint/direct app tsc/diff exit0. Exact commands, RED/GREEN receipts, explicit-TS-import config change and limitations are in doc.md. No independent I2 approval yet. Graph remains CRITICAL/27 flows, stale/truncated; native/actual storage/DB/deployment unverified. Next: parent spec re-review then quality review. I3/H1 server/PR/SQL and P4 live-edit/replay, broad warmup/backoff policy deferred.


**Objective / evidence:** runtime/source-verified bugs; SQL downstream predicted. Separate planned targets, performed sets and warmup identity.

**Audit coverage:** S3, S4, S5, F7. **Depends on:** I1. **Policy:** D03.

**Exact targets:**
- `types/workout.ts`
- `lib/workoutRules.ts`
- `app/(tabs)/index.tsx`
- `components/workout/WorkoutCard.tsx`
- `hooks/useRowActions.ts`
- `lib/workoutStorage.ts`
- `lib/__tests__/performedSets.test.ts (proposed)`

**Symbols / seams:** `LogRow`, `expandTemplateToRows`, `resequenceSets`, `nextSetNumberForExercise`, `sendMessage/addOrFillRow`, `handleEndWorkoutWithReview`.

**Failure-first reproduction:** Two Bench placeholders planned 10 reps + Bench 185 8 updates last placeholder to 185×10. Work 185×8 + Bench 95 10 warmup mutates previous notes and drops new set. Multi-pair/prefix warmup loses classification; resequencing changes set0 to1; unfilled templates save as completed.

**Action checklist:**
- [ ] Write failing tests for first eligible stable row ID, actual reps overriding planned target, new warmup identity, multi-pair warmups, partial/no template completion.
- [ ] Introduce explicit planned target vs performed state and classification (work/warmup/backoff/drop/cardio); keep sync status separate. Preserve IDs through edits/restoration.
- [ ] Replace notes-based fill eligibility with planned-state matching; update performed values together and emit changed-row effects for fills as well as appends.
- [ ] Make resequencing/display policy independent of warmup classification; D03 decides display numbering, not set===0 as sole semantics.
- [ ] Use one performed-row selector for End/review/live sync and template UI; explicit bodyweight is performed even with zero external load.
- [ ] Roundtrip new fields via storage adapter; do not infer legacy blank placeholders as completed. Test hooks/useRowActions callers of CRITICAL resequenceSets.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/performedSets.test.ts lib/__tests__/programTemplates.test.ts lib/__tests__/programFormat.test.ts`

**Acceptance gate / expected result:** Explicit 185×8 is retained in first intended placeholder, all changed performed rows sync once, warmup cannot alter previous work, and unperformed templates never enter completion review/history/PR. Warmup metadata survives editing/serialization; PR and SQL exclusions complete in I3/H1. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Quality R1 follow-up (implementation_pending_review):** Explicit pending AI actual reps8 survive inline/modal missing-load edits without target fabrication. Shared edit transition distinguishes metadata-free legacy templates from explicit performance provenance, and uses numeric performed eligibility. Ten new real-builder/edit/End/history/draft regressions pass; 100 targeted /2989 full /2191 retained first-slice tests green, lint/app tsc/diff exit0. Original quality repro2/0. Old independent64-case probe now63/1 due stale expected clean-row ID, left unmodified; other10/345/9 probes green. CRITICAL stale/truncated graph10 tracked files/34 symbols/27 flows. Exact RED/GREEN receipts and limits in `doc.md`. Parent independent spec regression then quality re-review required; no I3/H1/P3/P4 or native/server/deploy completion.

**Latest composer follow-up (implementation_pending_review):** Single/batch shorthand and named fast fills use the existing shared edit transition, not pending-without-target inference. Explicit AI actual8 plus185/0 retains ID/actual8 and no invented target; entered actual6 does not fabricate target8. Genuine target10 remains independent; metadata-free legacy load-only remains unperformed. Nineteen additional route/builder/End/local serializer cases; final119 targeted /3008 full /2191 retained first-slice pass, lint/direct app tsc/diff exit0. Exact vertical RED/GREEN and fixture-only compatibility corrections recorded in `doc.md`. Independent spec then quality gates remain pending; CRITICAL stale/truncated graph and native/server/I3/H1/P3/P4 limitations unchanged.

**Rollback:** Keep additive backward-readable fields; unknown legacy completion remains unknown. Revert UI feature without stripping saved evidence. CRITICAL graph impact requires owner/caller review.
