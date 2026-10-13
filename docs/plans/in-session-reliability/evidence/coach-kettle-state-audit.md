# Coach Kettle: in-session state lifecycle and regression audit

## Scope and checkout
Read-only audit of `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`, branch `deps/audit-2026-09-25`, HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`. Read root AGENTS.md; filesystem discovery found no nested AGENTS.md outside dependencies. Existing changes were `.claude/CLAUDE.md` and `CLAUDE.md`, unchanged at final git status. No repository files modified, installation, commit, deployment, real storage write, paid/provider call, or live backend request. Question interpretation and training arithmetic are outside this lane.

Graph-first: `node .gitnexus/run.cjs --help`, `query --help`, `context --help`, `status`, query `workout session log set answers restoration recommendation`, query `workout draft tests next set suggestion`, contexts `useWorkoutSession`, `logSet`, `saveWorkout`, `WorkoutCard`, `NextSetSuggestionPill` succeeded. Index identifies same branch/commit and says up-to-date (indexed 2026-09-26). Limit: object-method calls such as `api.logSet` have empty graph incoming sets despite source callers. Queries mostly return loosely related flows; graph is discovery, not complete dependency proof. Source inspection supplemented these limitations. No graph reindex performed.

## Actual verification
- `node --test lib/__tests__/submitGuard.test.ts lib/__tests__/workoutSource.test.ts lib/__tests__/restTimer.test.ts lib/__tests__/programSchedule.test.ts`: exit 0, 38 tests passed, 0 failed. Node warns MODULE_TYPELESS_PACKAGE_JSON; no failures.
- `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-state-probe.cjs`: final exit 0. Eight assertions/probes confirmed the outputs below. The probe extracts the real TypeScript handlers, pure parser/rules, and autosave effect and executes them with mocked React setters, storage, timers, and APIs. It is NOT an app render/simulator/deployed-provider test. For the late-parse probe only, the gate is explicitly stubbed to the valid `ai/missing_reps` branch so interpretation is not being tested. Responses and storage fixtures are synthetic by design, not purported real provider results.
- `./node_modules/.bin/tsc --noEmit`: blocked before execution by runtime lifecycle guard: `_tsc.js` exceeds 1 MiB scan cap. No typecheck verdict obtained.
- Targeted `./node_modules/.bin/eslint 'app/(tabs)/index.tsx' hooks/useWorkoutSession.ts lib/workoutDraft.ts lib/workoutStorage.ts components/modals/EditSetModal.tsx components/workout/WorkoutTable.tsx components/workout/WorkoutBottomBar.tsx`: blocked before execution by runtime lifecycle guard, scan budget exhausted at remote reads depth 3. No lint verdict obtained. First combined check commands were also entirely blocked; standalone graph commands and Node tests/probes subsequently succeeded.
- Final `git status --short` still lists only the two original documentation modifications.

Final source-extracted probe output:
```
DOUBLE_FAST: UI rows=1, backend log calls=2 (same-render callback replay).
LATE_PARSE_AFTER_CLEAR: cleared table repopulated with Squat.
LATE_ANSWER_AFTER_END: ended session still receives previous-session answer bubble.
CARDIO_END: isCardio/duration/distance absent in actual save payload.
UNFILLED_SKELETON_END: blank-weight template row saved as performed committed set.
EDIT_DURING_REVIEW: second set discarded; save snapshot has 1 row and completion clears both.
CLEAR_DRAFT: rows=[] schedules no draft overwrite; old saved row remains.
MODAL_INVALID: blank exercise, NaN weight and negative reps accepted by actual onSave handler.
ALL 8 SOURCE-EXTRACTED LIFECYCLE PROBES CONFIRMED. No real storage, network, React native rendering, or deployed backend used.
```

## Lifecycle traced
- WorkoutTable -> WorkoutCard supplies controlled inline input and commits on blur/submit (WorkoutCard.tsx:207-230). EditSetModal is a separate uncontrolled-validation path. HomeScreen owns rows, editing and composer state; useWorkoutSession owns active/session ID/date metadata, not rows or persistence.
- `commitPendingAndGet` returns the edited snapshot for submit/end; `withPendingRows` applies pending edits against functional previous rows before delete/duplicate/modal save. Inline edits associate by row ID; delete and duplicate resequence per normalized exercise. Reorder uses array indices and does not first commit pending edits (index.tsx:655-833).
- Local parser fills skeleton rows by index or adds committed rows. Newly added fast rows synchronously update UI and fire-and-forget `api.logSet`; AI parsing awaits `api.chat`, removes ghost by ID and appends returned rows. Chat/coach wire rows are snapshots without session/row IDs (index.tsx:82-89; lib/api.ts:153-187).
- `api.logSet` -> authenticated `/log-set` -> INSERT into workout_log with shared daily ID `live-${today}`. End -> generateSessionReview -> saveWorkout local-first -> AsyncStorage history -> authenticated `/history` upsert -> delete daily live/previous-workout rows -> insert final rows -> reconcile PRs. Final reconciliation is important: it prevents treating all in-session edits as *permanent* backend divergence (history/index.ts:134-201). Empty/abandoned sessions do not run this reconciliation.
- Autosave/background save -> global `workout_draft_v1` -> same-day mount restoration. AuthProvider clears workout history/draft on explicit cache cleanup/sign-out (AuthProvider.tsx:61-63,99-109). No workout pause/undo API found; app background is implicit continuation, rest timer pause is a separate state machine. Starting/restarting allocates new ID; ordinary start waits for draft restoration, routine-import does not have that guard.

## Ranked reproducible findings
Priorities describe user impact, not deployed incidence. **Executed** means the isolated source handler/branch was exercised; **source-verified** means deterministic source behavior with a reproduction recipe, not device execution.

### F1 — P1: Final save destroys structured cardio data (executed)
Evidence: index.tsx:1139-1146 retains cardio fields during fast parsing and 1169-1175 sends them live; 910-916 maps final stored rows to only exercise/weight/reps/notes/timestamp. History backend 134-184 replaces previously correct live rows and derives `is_cardio` from the now-absent field, defaulting false; duration/distance/etc become null. Storage WorkoutRow explicitly supports cardio fields (lib/workoutStorage.ts:12-19).
Reproduce: log a cardio row with duration and distance; end/save workout. Actual captured save payload loses isCardio, durationMins, distance, distanceUnit, heartRate, calories and level. Local history loses fields; backend reconciliation is coded to overwrite the live cardio record with non-cardio fields. No deployed database run claimed.
Coverage needed: actual composer -> end payload -> local history -> history-handler reconciliation cardio roundtrip.

### F2 — P1: Clearing/deleting the last row leaves the old draft, so restart resurrects deleted sets (executed autosave branch)
Evidence: index.tsx:271-284 returns without saving when rows.length===0; background branch at 289 has the same gate. Clear at 611-615 only resets UI. Delete at 768-772 similarly never clears/overwrites the draft. Mount restore blindly accepts saved rows (245-255).
Reproduce: log a row, wait >500ms for autosave, clear all or delete final row, background/terminate/reopen same day. Old row restores. Probe proves zero rows schedules no persistence operation and keeps old stored fixture. Expected invalidation is not performed.
Coverage needed: delete-last/clear-all after settled save, then fresh mount; empty-start persistence and debounced-write ordering.

### F3 — P1: End/review takes a snapshot but leaves session mutable; later completion silently discards new edits/sets (executed)
Evidence: index.tsx:891-929 captures committed rows before awaiting review; no end-in-flight guard or setLoading(true). Review modal can be closed while loading: SessionReviewModal.tsx:182-186 invokes handleDone without a loading guard. After review and save, index.tsx:948-954 clears current UI unconditionally. BottomBar End has no loading disable at 118-133. Review state is not an ownership/revision fence.
Reproduce: end a session while review is deferred, close review via header X, log/edit another set, release review. Save contains original snapshot and all current rows clear. Probe: second row added during deferred review is not saved and disappears. Same vulnerability applies to multiple End confirmations and review completion after another transition; those schedules were not individually device-tested.
Coverage needed: controlled deferred review/save, close-and-edit, repeated End, local failure, newer session ownership.

### F4 — P2: Late AI parsing/answers are not fenced to session or row revision (executed)
Evidence: index.tsx:1235-1284 accepts response solely based on answer/rows. No request generation, workout ID, presence-of-ghost check, cancellation on clear/end, or exercise revision check. Ghost removal followed by `.concat(newRows)` still appends if ghost already disappeared. Answer uses a global bubble (1241), which isn't cleared by start/end/reset paths. Coach streaming also writes shared coachAnswer without session/request-generation checks (427-473).
Reproduce parse: defer a valid AI-parse branch, clear table while request is pending, resolve rows; cleared table repopulates. Reproduce question: ask about Bench, end or change exercise/session while response is pending, resolve answer; previous-session answer is displayed globally. Both handler behaviors confirmed. Requests retain the submission snapshot, so this is stale presentation/association, not evidence the provider received a different exercise than submitted.
Coverage needed: deferred requests across clear/delete/change-exercise/end/restart; request identity and old streaming chunks; ensure old `finally` cannot unlock newer requests.

### F5 — P2: Same-render double submit logs twice remotely even when UI shows one row (executed callback replay)
Evidence: sendMessage guards React `loading` at 999-1005, but fast path never sets a synchronous latch and sets loading false at 1155. It computes from closure currentRows and `setRows(next)` at 1153; each callback invocation independently invokes logSet at 1161-1180. BottomBar return-key and Send button both invoke handleSend (112,137), guarded only by render-derived disabledSend (48-57). log-set inserts with no row/session idempotency key (165-185).
Reproduce: invoke the same rendered send callback twice before rerender/commit for `Bench 100 5`. Probe: one visible final row and two backend log calls. AI path likewise uses render-state loading, not synchronous acquisition; actual dual AI requests not separately probed. This is not a claim every physical double-tap reproduces it: React may flush between discrete events. Keyboard/button replay/batched callbacks are the verified schedule.
Coverage needed: actual UI event batching and dual entry points, same-render fast/skeleton/AI/End replay. `submitGuard.test.ts` tests a standalone utility, not these handlers, which do not use it.

### F6 — P2: Edit Set bypasses inline validation and commits blank/invalid values (executed)
Evidence: EditSetModal.tsx:36-45 merely trims exercise/weight/reps and calls onSave; overlay tap saves too (59). handleSaveSet replaces the row and resequences without validation (index.tsx:809-832). Contrast inline reps/set guards at 672-697; inline weight itself accepts any string at 679-683. Final save doesn't validate rows either; history POST checks session identity fields, not numeric contents (history/index.ts:369-373).
Reproduce: Edit Set -> blank exercise, pasted `NaN` weight, `-1` reps -> Done. Actual handler accepts all three; zero and other negative/non-numeric strings use same path. Numeric keyboard doesn't constrain pasted/programmatic text. No conclusion on safe bodyweight zero weight; the bug is path inconsistency and acceptance of blank exercise/invalid/negative reps without feedback.
Coverage needed: same validation matrix across modal/inline/parser/API, including NaN-string, Infinity-string, zero, negative, decimal and partially numeric strings. No arithmetic correctness judgment in this audit.

### F7 — P2: Unperformed template skeletons are saved as completed sets (executed)
Evidence: expandTemplateToRows creates blank-weight rows already status committed (workoutRules.ts:94-111); final filter only checks committed and !isRest (index.tsx:892), no performed/filled status. `onEndWorkout` counts all non-rest rows first (842).
Reproduce: start a multi-set template, fill only one or none, End/Save. Probe saves a blank-weight, prefilled-reps skeleton as a performed row. Review receives all remaining skeletons and backend stores zero-weight defaults. This is a lifecycle completion-status issue, distinct from whether zero is a valid entered load.
Coverage needed: template with no filled sets, partially completed templates, bodyweight completion and restoration of filled/unfilled status.

### F8 — P2: Cross-midnight active workout survives in memory but is deleted on process restoration (source-verified)
Evidence: useWorkoutSession.ts:42-49 explicitly preserves active workouts across midnight. Draft mount restore instead requires `draft.dateISO===todayISO()` (index.tsx:247), otherwise silently clears (261-263).
Reproduce: start before midnight, continue after midnight, background/kill and reopen. Persisted original-date draft is discarded despite being the protected active session. This is a deterministic restore policy conflict; midnight/device lifecycle not run.
Coverage needed: active overnight session vs stale abandoned draft; preserve original workout/date ID and accurate title across restoration.

### F9 — P2: Restored in-flight ghost rows remain permanently 'Parsing...' (source-verified)
Evidence: AI ghost has status syncing with `...` values (index.tsx:1221-1233). Draft persistence stores all rows without filtering (274-281,291-298), restoration reinstates them verbatim (249). No pending-request recovery/removal after restoration exists. Card/Table disable syncing row gestures and swipe actions (WorkoutCard.tsx:57,114,147; WorkoutTable.tsx:163-193).
Reproduce: submit AI parse, let autosave/background persist ghost, terminate before response, reopen same day. No original promise survives process death, so ghost never resolves; gestures to remove/edit that row are disabled (clear-all can remove it, subject to F2). Source behavior, not executed on device.
Coverage needed: restore draft containing syncing/failed/malformed rows; discard/retry exact pending input without duplicates.

## Other observations, coverage gaps, and unverified risks
- No undo state/history/action exists in inspected session UI; delete is immediate. Functional updates and stable row IDs do protect ordinary committed edit -> delete/duplicate operations. Reorder uses positional indices rather than row ID and accepts an unchecked fromIndex (index.tsx:793-802). Native gesture timing with concurrent row mutations could move the wrong row/out-of-range item, but not reproduced; keep as risk, not confirmed bug.
- Exercise change preserves row ID; inline rename intentionally relocates to matching group, modal rename only resequences in place (index.tsx:724-727 vs809-832). Different ordering policies are source-observed; without an explicit grouping requirement, not ranked as a bug.
- NextSetSuggestionPill has cleanup cancellation for a genuinely different exercise (NextSetSuggestion.tsx:48-54), but is **not wired into session UI**: graph incoming is empty and `.tsx` literal search found only its definition. Do not attribute its behavior to active workout inputs. Component-only latent risk: changing raw exercise casing while request pending cleans up old request, then lowercase dedupe returns without new request/reset, potentially leaving loading forever (39-55); not runtime-probed.
- Live corrections/deletions do not mutate workout_log until final history reconciliation. Empty/cleared-ended/abandoned sessions never reconcile. In-flight log-set commits after final reconciliation could reintroduce daily live rows; this requires a controlled actual-handler/SQL barrier, not only response delay, to prove. Shared daily live ID also cannot distinguish simultaneous sessions. These backend concurrency issues are source-supported risks, not deployed verified corruption.
- Local history upsert is unguarded read-modify-write (workoutStorage.ts:78-81), including pending sync clearing with old session snapshots (105-114). Concurrent saves/delete/retries can overwrite each other. No storage commit barrier probe run; risk only.
- Draft writes/clear are fire-and-forget and unsequenced; after-save clear doesn't wait. Real AsyncStorage invocation/commit ordering not measured, so no confirmed write-after-clear race claim.
- Chat payload and persistence have no workout ID, row ID or exercise ID: toApiRows drops row IDs; ChatMessage carries only role/content/source/date (chatStorage.ts:8-15,185-207). A Q/A text pair is stored together, but durable association to exact set/exercise is impossible from schema alone. This is an association/coverage limitation, not proof of text Q/A pairing failure.
- Standard Start checks draftChecked (index.tsx:476-479); routine import can start before draft read resolves (578-587). Competing restore/import schedule not run; source-supported restore-overwrite risk.
- Inspected test discovery found no workoutDraft/useWorkoutSession/structuredGate lifecycle test file. WorkoutSource tests perform JSON roundtrips and explicitly defer full draft -> local -> backend pipeline (workoutSource.test.ts:8-15), not real persistence. ProgramSchedule tests verify pure start decisions; RestTimer tests verify pure timer gating/completion; SubmitGuard tests verify a utility unused in workout send/end. HistoryReflection covers a separate post-session detail screen. Chat/coach handler tests exist for backend logic, but don't execute these React in-session transitions. Regression coverage for all ranked findings remains absent in inspected tests.

## Artifacts
- Report: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-state-audit.md`
- Re-runnable source-extracted probe: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-state-probe.cjs`
No implementation supplied or repository changes made.
