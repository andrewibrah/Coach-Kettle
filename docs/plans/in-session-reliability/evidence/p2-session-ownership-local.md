# P2 End/save and response ownership — implementation pending independent review

## Interrupted-run recovery receipt

Recovery at 2026-10-09 01:55 EDT inspected the actual dirty checkout and bounded interrupted transcript. All implementation/evidence writes above the model-wait interruption were already present; no unfinished source syntax or failing existing P2 tests reproduced. No production code or existing assertion changed during recovery. Fresh commands from repo root reproduced **77 P2, 144 P1+schedule, 119 retained I2, 2191 retained input, 3204 full**, all passing with zero failures/skips. `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: exit0. Raw logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-p2-recovery-{initial,full,p1,i2,input,lint,tsc,graph}.log`. Fresh HIGH save/clear impacts and CRITICAL stale/truncated aggregate confirm review risk remains unresolved; UNKNOWN new helpers were checked against actual source callers. Original failure-first receipts below remain prior-worker evidence, not recovery-generated RED/GREEN. P2 remains implementation_pending_review and all native/provider/server/global-history limits below remain applicable.

## Authority and bounded outcome
Local execution: 2026-10-09 EDT, repository `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`, branch `deps/audit-2026-09-25`, unchanged HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`. Parent reports latest bounded P1 independently SPEC PASS / QUALITY APPROVED (3127 full, 144 P1+schedule, 10 extra reviewer checks, lint/typecheck/diff exit0). That is a parent-reported offline gate, not native/storage-device/provider/DB approval. Earlier P1 receipts remain historical. All earlier input/I2/P1 tests, original CLAUDE changes and dirty files retained. No commit/reset/stash/install, secrets, live provider/DB, migration or deployment.

P2 F3/F4 is **implementation_pending_review**. Parent must arrange independent SPEC regression first, QUALITY second. This is not a whole persistence/release approval.

## Implemented integrity defaults (D06; not medical policy)
- A synchronous identity-based End latch reserves before confirmation or any await. The deep snapshot retains stable row IDs, owner/epoch and a serialized row revision. Pending cell edits commit through the synchronous row ref before reservation. Only shared performed selectors enter history/review; incomplete/ghost/planned input is not fabricated performance.
- Button End and typed done use the same confirmation/discard path, including an empty session. Confirmation cancellation releases only its own token. Duplicate same-render End cannot open another confirmation or finalize twice.
- Explicit idle/confirming/saving/failed/saved presentation: table/editor/mutation gateways and composer/BottomBar actions freeze during finalization. Review close, native request-close, swipe and Done cannot abandon the save while it is pending. Failed save exposes retry/close rather than presenting success; existing rows and original recovery identity/date remain available.
- Local-first storage writes performed history before awaiting optional review. Review gets a **5000 ms client deadline**, then resolves unavailable/null; late response cannot enrich a newer owner. A prompt valid review enriches local history and the remote payload. Review rejection/timeout/enrichment failure does not undo durable performance. Remote failure remains local pending-sync.
- The real API previously silently returned rating7 and invented completed-session strengths on transport/HTTP/JSON failure, and fabricated field defaults for malformed JSON objects. Removed those synthetic reviews; failures now reject with sanitized `Session review unavailable`. Required fields and the already-declared 1–10 rating contract are validated, not coerced/defaulted. Empty supplied text, empty strengths, fractional valid ratings and genuine valid responses remain accepted. No AI training/clinical recommendation policy added.
- Clear/delete/edit/reorder/import/Start/End invalidate response generations; interrupted parse input becomes editable incomplete planned evidence with exact pending input, not a logged set. Missing/deleted ghosts cannot reappear. Question and coach stream/final/history effects require current request identity; old finally cannot unlock a newer request. Owner changes and actual unmount invalidate token epochs and clear prior presentation. Stale rendered Send/coach/End dispatches are refused.
- Current-owner parse/coach answers, live log/PR/rest effects still work. Registered rest and PR backup callbacks have active ownership guards. Request/PR acknowledgement guards additionally observe P1 draft invalidation before auth rerender.
- End storage and draft clear are tied to P1 generation. Both empty and performed paths check the generation reserved for confirmation/save and the generation **after their own clear call**. A later auth cleanup cannot let an old completion reset replacement rows. Failed cleanup retains original metadata and refreshes only the owning generation for retry edits; stale paths release only their own latch.

## Failure-first receipts
Commands from repo root: `node --test lib/__tests__/sessionOwnership.test.ts`, UI slices use `lib/__tests__/sessionFinalizationUi.test.ts`, real API slices use `lib/__tests__/sessionReviewFailure.test.ts`; combined runs are identified below. Raw logs are `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-p2-*.log` (ephemeral scratch; this summary is durable).

| Slice / receipt | RED pass/fail | Follow-up retained GREEN receipt |
|---|---:|---|
| End reservation/snapshot/local-first (`red1`) | 0/1 | final77/0 |
| Real local performance before review (`red2`) | 1/1 | final77/0 |
| Actual mutation gateway + same-render confirmation (`red3`) | 2/2 | final77/0 |
| Optional-review deadline (`red4`) | 5/1 | final77/0; save-failure control already green |
| Actual modal/BottomBar guards (`red5-ui`) | 0/3 | final77/0 |
| Late parse/answer (`red6`) | 6/2 | final77/0 |
| Old finally and deleted ghost (`red7`) | 8/3 | final77/0 |
| Coach stream, lifecycle, shared typed End (`red8-corrected`) | 11/5 | final77/0 |
| Actual freeze gateways (`red9`) | 17/9 | final77/0 |
| Actual mount/owner effects and synchronous row boundary (`red10`) | 26/3 | `green10`:29/0 |
| Local enrichment and remote acknowledgement (`red11b`) | 32/3 | ownership+UI `green11`:35/0 |
| Edit/import/reorder parse applicability (`red12`) | 31/5 | `green12`:36/0 |
| Delayed Clear, save draft generation, owner presentation (`red13`) | 36/4 | ownership+UI `green13`:44/0 |
| Stale latch release and real cleanup-failure retry (`red14`) | 39/2 | `green14`:41/0 |
| Template restart, stale rest/coach dispatch (`red16`) | 43/3 | `green16`:46/0 |
| Empty Clear + stale Send + PR backup (`red17`) | 46/5 | `green17`:51/0 |
| Typed empty done + real program-day restart (`red18-corrected`) | 51/2 | ownership+UI `green18`:57/0 |
| P1 auth generation before rerender (`red19`) | 53/1 | integrated retained `targeted19`:375/0 |
| Empty confirmation + stale rendered End (`red20`) | 54/2 | `green20`:56/0 |
| Post-clear auth generation and empty cleanup failure (`red21-assertion`) | 56/3 | `green21`:59/0 |
| Real API swallowed transport/HTTP/JSON failure (`red22`) | 1/4 | `green22`:5/0 |
| Real API synthetic malformed fields (`red23`) | 5/5 | `green23`:10/0 |

Extra canonical success/control cases add no production change after GREEN. New P2 files contain 59 ownership +4 UI +14 API/integration cases, **77 total**. These are case counts, not 77 unrelated product defects.

Fixture corrections retained separately: `red8` composer fixture initially did not distinguish direct finalization from onEnd dispatch; `red8-corrected` does. Template parse restart initially passed via the missing-ghost fence; changed to the question path (`red15-question`) to expose the unfenced restart, without weakening parse coverage. Scheduled program fixture initially used day_index0; real resolver is 1-indexed (`red18-corrected` captures the genuine prior-question-history failure). `red21` originally reported TypeError after replacement rows were genuinely deleted; optional assertion access in `red21-assertion` makes the expected replacement-vs-undefined failure explicit. No erroneous fixture result is counted as a GREEN.

Original retained route fixtures run unchanged in assertions first: `retained-initial` **127 pass/190 fail** due absent new ownership/ref dependencies, not relabeled green. Shared harnesses now supply real ownership plus explicit single-owner baseline generation/no-concurrency defaults; concurrency fixtures supply actual route invalidation closures, controlled generations and real storage modules. Assertion-preserving adaptation: `retained-adapted` **317/0**. No original assertion was removed/replaced.

## Final executed checks after last production edit
- `node --test lib/__tests__/sessionOwnership.test.ts lib/__tests__/sessionFinalizationUi.test.ts lib/__tests__/sessionReviewFailure.test.ts`: **77 pass/0 fail/0 skipped**, exit0 (`targeted-final.log`).
- `node --test lib/__tests__/workoutDraftLifecycle.test.ts lib/__tests__/programSchedule.test.ts`: **144/0/0**, exit0 (`p1-schedule-final.log`).
- Retained I2 command from P1 evidence (i2QualityRepairs, i2SpecRepairs, performedSets, programTemplates, programFormat): **119/0/0**, exit0 (`i2-final.log`).
- Retained input command from P1 evidence (attachedUnitDelimiters, bodyweightAmbiguity, grammarBoundaries, inSessionHarness, structuredGateIntegrity, structuredRouting): **2191/0/0**, exit0 (`input-final.log`).
- `node --test lib/__tests__/*.test.ts`: **3204 pass/0 fail/0 skipped**, exit0 (`full-final.log`). Module-type/react-test-renderer warnings and deliberate offline-error diagnostics remain; not a warning-free full run.
- `npm run lint`: exit0, no lint warnings (`lint-final.log`). Direct `npx tsc --noEmit`: exit0 (`tsc-final.log`), app only; tests/Edge excluded by existing tsconfig. `git diff --check`: exit0. No guard bypass.

Tests execute real helpers, AST-extracted actual route/effect closures and actual modal/BottomBar JSX guards with controlled deferred promises/clock/AsyncStorage/native adapters. API failure integration exercises actual API -> actual End -> real local-first storage and reads JSON back, proving durable original-ID/date performance and absent synthetic review. This is not mounted HomeScreen/native gesture/process-death proof.

## Graph and limits
Pre-edit graph impacts were run for affected End/chat/coach/Start/mutation/modal/BottomBar/storage symbols and callers inspected. `saveWorkout`/`clearWorkoutDraft` are HIGH; retained resequenceSets is CRITICAL (not edited for P2). Reviewed actual Home/history save/sync callers, P1 draft helper/auth cleanup, actual mutation/UI entry points and API review callers. New `createSessionOwnership`, `setRows`, `invalidateResponses` are UNKNOWN/not indexed, not unused: source fallback covers their actual HomeScreen and harness callers. Initial graph names/line ranges are stale; the graph cannot prove these new call boundaries.

Two final `node .gitnexus/run.cjs detect-changes --scope all --repo . --limit 200` runs report **CRITICAL/14 tracked files/73 range-attributed symbols/37 flows**, including original CLAUDE and all prior repairs. Both still display only15 symbols/10 flows; untracked helper/tests/docs are incompletely represented. This is not an all-clear, and no reindex/commit is claimed (`graph-final.log`, `graph-rerun.log`).

Already-dispatched provider/remote log/history/meta writes cannot be recalled. A Q&A history write invoked while its token was valid may already be in AsyncStorage before later invalidation; invalidation prevents *subsequent invocation*, not transactional rollback. Global coach-history keys/retention/long-term pain context and media/reflection operations remain C1/C3 follow-ups. PR realtime payloads carry no verified session origin: the active subscriber is guarded, but a previously dispatched backend insertion delivered to a newly subscribed same-user session requires P4 server barriers, not a client guarantee. History upserts check ownership before/after read and before dispatch; already-dispatched native writes/global whole-key concurrency are P5, not solved by the predicate. P3 cardio final-save loss is deliberately unchanged. P4 daily-live collisions/idempotency/finalization barriers, server metadata/RLS, native durability/UI and provider safety remain unverified/deferred.

## Exact P2 changed paths and next review contract
Production: `app/(tabs)/index.tsx`, `lib/sessionOwnership.ts` (new), `lib/workoutStorage.ts`, `lib/api.ts`, `components/modals/SessionReviewModal.tsx`, `components/workout/WorkoutBottomBar.tsx`.
Tests: new `lib/__tests__/sessionOwnership.test.ts`, `lib/__tests__/sessionFinalizationUi.test.ts`, `lib/__tests__/sessionReviewFailure.test.ts`; assertion-preserving dependency adaptation in `lib/__tests__/workoutIdentityHarness.ts`, `lib/__tests__/inSessionHarness.ts`.
Docs: `doc.md`, `00_INDEX.md`, `02_SESSION_PERSISTENCE.md`, `DECISIONS.md`, `tasks.json`, this evidence file (plan paths relative to this directory's parent).

Independent SPEC first: reproduce double End; actual staged-edit snapshot and stable IDs; close/edit/clear/reorder during confirming/saving; typed and button empty/performed confirmation; local save failure and real draft cleanup failure retry retaining original date/ID; valid/unavailable/timeout review with immediate local write and no synthetic completion; late parse after clear/delete/End/restart/unmount; late question/coach chunks/final/history; old finally vs newer request; auth generation before rerender, during save and after owned clear; owner/unmount callbacks and native close/disabled controls. Re-run P1, I2/input, full/lint/typecheck/diff. Then independent QUALITY: inspect source integration, snapshot and generation semantics, all mutation gateways, storage predicate boundaries, real API default removal, lifecycle hooks/dependencies and the remaining irreversible/global/P3/P4/P5 limits. Do not advance to P3 or claim native/provider/DB/release approval merely because local tests pass.
