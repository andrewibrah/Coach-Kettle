# P1 quality repairs — local implementation pending independent re-review

## Authority / outcome
The parent reports P1 SPEC PASS followed by QUALITY REQUIRED: R1 HIGH unresolved recovery deleted by automatic midnight cleanup; R2 MEDIUM optional draft metadata admitted an object React child. Both reproduced and repaired locally. Prior source/tests/docs/CLAUDE work retained; no commits, installs, resets, secrets, live DB/provider calls, migrations or deployment. P1 remains **implementation_pending_review**; parent must independently run spec regression then quality re-review before advancing. P2 late active AI/End/save ownership remains outside this change.

## R1: unresolved recovery is not an empty inactive session
- HomeScreen explicitly passes `recoveryResolved: draftChecked` into the real `useWorkoutSession`. Both 30-second interval and foreground checks stop while recovery is unresolved, independently of workoutActive. The hook keeps its existing default for callers without persistence; the actual persistence-owning route always supplies the gate.
- The route's `onResetForNewDay` also refuses cleanup until draftChecked, and its dependency list follows that state. Explicit End/auth cleanup and queued clear semantics are unchanged.
- Actual hook effects, actual route hook options/reset/restore/Start closures and real queued storage helper reproduce malformed rows:null and actual storage read rejection followed by midnight: pre-fix raw storage becomes null. A valid deferred read spanning midnight likewise loses the cache and invalidates restoration pre-fix. Post-fix all retain exact raw data; valid restore retains ID `original`, date `2026-10-07`, createdAt1, title `10/07 Push`, original rows, active state and no restart/delete. A resolved no-draft control still rolls over and starts a new current-date session.

## R2: validate known metadata before restore, without normalization
- All optional LogRow fields are runtime checked: status/performance/setKind/distanceUnit exact enum literals; isRest/isCardio booleans; pendingInput string; durationMins/distance/heartRate/calories/level finite numbers; plannedTarget a non-null non-array record with string reps and optional string weightLbs. Mandatory row identity is nonempty; existing mandatory scalar/session metadata validation is retained.
- The validator map is keyed by all optional LogRow metadata, so a future optional field requires a validator at app typecheck. Unknown additional session/row/target fields remain accepted and intact. Missing legacy optional fields, blank string targets, explicit zero bodyweight, all setKind/unit literals, rest/planned metadata and valid cardio quantities remain compatible. No new numeric sign/range/whole-number policy or calendar/TTL policy was invented.
- Malformed known metadata rejects the entire helper read with existing sanitized application text; no fields are dropped/coerced or written back, raw JSON remains byte-identical, actual restore stays unresolved, actual Start remains locked and no corrupt row reaches the card.
- Actual WorkoutCard JSX children are passed through ReactDOMServer's real child reconciler with native host tags mapped to spans. The original target object fixture provably throws `Objects are not valid as a React child` when directly rendered; after the read boundary rejects it, actual restored rows are empty and render safely. Valid restored metadata renders safely. This is a real React child boundary with native/hook doubles, not mounted HomeScreen/device proof.

## Strict vertical TDD receipts
All commands run from `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`. Each slice uses `node --test lib/__tests__/workoutDraftLifecycle.test.ts` before and after its production edit.

| Slice | RED pass/fail | Expected behavioral failure | GREEN pass/fail |
|---|---:|---|---:|
| R1 actual hook/storage/route midnight | 28/3 | raw draft null for malformed/read-error/deferred valid read | 31/0 |
| R1 route reset defense + resolved-empty control | 32/1 | actual reset mutates pending recovery UI | 33/0 |
| R2 nested object target + real React child repro | 33/1 | real getWorkoutDraft missing expected rejection | 34/0 |
| R2 remaining optional-field/type/finite/ID matrix | 49/70 | real helper missing expected rejection | 119/0 |

The metadata matrix contains generated value/type cases, not 85 distinct new product behaviors. Nested-target rejection cases already green after the first target slice remain in the matrix. Compatibility controls were added without additional production changes. Final P1 file has **119 cases**, up from28, preserving all prior expectations. Initial new hook harness mistakenly used an unsupported third sourceModule argument; corrected with local VM globals before any RED execution. No harness error is reported as behavioral RED. Initial SSR compatibility run warned about array keys; the host-element adapter now supplies stable keys without changing children. Test editor diagnostics report missing existing Node/react-dom typings (tests excluded from app tsc); no packages installed or suppression added.

Raw logs under `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-p1-quality-`:
`red1.log`, `green1.log`, `red1-route.log`, `green1-route.log`, `red2-target.log`, `green2-target.log`, `red2-metadata.log`, `green2-metadata.log`.

## Final executed verification after last production edit
- `node --test lib/__tests__/workoutDraftLifecycle.test.ts lib/__tests__/programSchedule.test.ts`: **144 pass/0 fail/0 skipped**, exit0 (`targeted-final.log`):119 P1 +25 schedule.
- `node --test lib/__tests__/i2QualityRepairs.test.ts lib/__tests__/i2SpecRepairs.test.ts lib/__tests__/performedSets.test.ts lib/__tests__/programTemplates.test.ts lib/__tests__/programFormat.test.ts`: **119/0/0**, exit0 (`i2-final.log`).
- `node --test lib/__tests__/attachedUnitDelimiters.test.ts lib/__tests__/bodyweightAmbiguity.test.ts lib/__tests__/grammarBoundaries.test.ts lib/__tests__/inSessionHarness.test.ts lib/__tests__/structuredGateIntegrity.test.ts lib/__tests__/structuredRouting.test.ts`: **2191/0/0**, exit0 (`firstslice-final.log`).
- `node --test "lib/__tests__/*.test.ts"`: **3127 pass/0 fail/0 skipped**, exit0 (`full-final.log`). Existing module/react-test-renderer warnings and intentional offline diagnostics remain; not warning-free.
- `npm run lint`: exit0, no lint warnings (`lint-final.log`). Direct `npx tsc --noEmit`: exit0 (`typecheck-final.log`), app only, tests/Edge excluded. `git diff --check`: exit0; no guard bypass.
- Historical independent scratch probes were not rerun/changed; retain prior evidence's original/adapted matrix distinction. These new local results are not independent reviewer approval.

## Graph / caller review
Pre-edit upstream impacts: useWorkoutSession LOW/1 HomeScreen caller; ensureFreshSession LOW/2 native foreground/interval callbacks; getWorkoutDraft LOW/1 HomeScreen caller; onResetForNewDay LOW/no indexed caller and HomeScreen LOW/no indexed upstream. clearWorkoutDraft **HIGH/6 symbols/3 flow groups**, warned before production editing: direct reset/End/home onPress plus End/send callers. New isDraftLogRow UNKNOWN/not indexed, not all-clear. Graph context exposes stale line ranges for old draft helper.

Source fallback reviewed full draft helper, actual HomeScreen restore/autosave/background/generation/reset wiring, Start/confirm/template/import gates and actual End/review/empty-session clear paths, actual session hook, LogRow type, WorkoutCard target/cardio rendering, and AuthProvider callback-style cache cleanup. No changes to clear helper, explicit End/auth or serializer ownership logic. Native callback/default option behavior remains backward compatible; sole production persistence-owning hook caller supplies actual draftChecked.

Two aggregate `node .gitnexus/run.cjs detect-changes --scope all --repo . --limit 200` runs report **CRITICAL/12 tracked files/55 range-attributed symbols/27 flows** including all preceding preserved work (`graph.log`, `graph-rerun.log`). Both presentations still truncate at15 symbols/10 flows; new untracked code/tests/docs are incompletely indexed. No clean graph verdict/reindex/commit claim.

## Changed files and exact review contract
Production: `hooks/useWorkoutSession.ts`, `app/(tabs)/index.tsx`, `lib/workoutDraft.ts`. Tests: `lib/__tests__/workoutDraftLifecycle.test.ts`. Documentation: `doc.md`, `02_SESSION_PERSISTENCE.md`, this evidence file. No WorkoutCard/type/API/DB change required.

Parent: independent **spec regression first, quality second**. Re-run real deferred valid/failed/malformed reads crossing midnight through interval AND foreground; prove raw storage, original identity/date/title and locked Start, then resolved-empty/new-session control. Recheck direct route reset fence/dependencies. Re-run each known optional metadata field, nested null/object/array/scalar variants, unknown enums and finite numeric rules through real helper and actual restore; verify no write/delete/normalization, sanitized notices and Start locked. Inspect real React child reproduction and valid legacy/zero/cardio/target/unknown-additional-field controls. Re-run full/retained I2/input/lint/typecheck/diff. Native process death/AsyncStorage durability/UI gestures, live provider/DB/Edge, P2 save/late-response ownership, account namespace redesign and release remain unverified/deferred.
