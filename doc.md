# Development log

## P4 approved: SPEC then QUALITY passed after repairs (local only)

An independent SPEC review failed with 1 HIGH, 3 MEDIUM and 3 LOW findings, plus 1 decision. All were repaired RED-first in 72191e4, and a fresh re-SPEC passed. A separate QUALITY review then required changes (1 HIGH, 1 MEDIUM, 4 LOW, 1 NIT). Those were repaired in 5963350 and 5f675c6, and the QUALITY re-review **APPROVED**.

Key fixes:
- Account deletion now purges the P4 tables (cascading from `auth.users`) and the device operation queue.
- Pending-history sync is owner-bound, so it can't upload under the next account.
- Deterministic rejections return 409/403 with stable codes and are not retried.
- Pre-P4 pending sessions get a durable identity. Legacy workouts stay server read-only with a clear History message (user decisions).
- Rollout runbook: `P4_ROLLOUT_RUNBOOK.md`.

Gates, per commit in an isolated worktree: lib 3428/0, Edge `_shared` 85/0; tsc, lint with zero warnings and diff-check all exit 0; P4 PG15 suite exit 0. The local Supabase stack (colima) applies 64/65 migrations from scratch. The pre-existing `remote_schema` "chats already exists" failure needs a decision. Curl receipts on all 5 changed functions are as expected. The simulator is BLOCKED (no Xcode). Open: F6 LOW, two non-blocking QUALITY residuals, D08 choices and the production rollout. No push, deploy or remote command. [Evidence](docs/plans/in-session-reliability/evidence/p4-final-review-local.md).

## A1 structured answers: built and integrated, inert until D09 (Q8/Q11/Q12/Q15)

Built behind `structuredQuestions: false` with `questionnaire: null`, so nothing renders, saves or changes behaviour:
- Typed answer log: answered, skipped or unknown, with session, exercise and row scope.
- Validation and applicability checks.
- `currentAnswer`, which surfaces conflicts and keeps excluded evidence, so pain is never silently outvoted. A skip never counts as no-pain.
- A durable append-only draft log with P1 R2 restore parity.
- A per-session route log and one inert mount.
- Dated excluded history (placeholder copy).

Reviews:
- Lane A SPEC FAILED: a clock-dependent filter could erase pain. Repaired RED-first, then SPEC PASS.
- Lane B SPEC PASS: 11/12 mutants killed, and flag-off draft bytes are identical to HEAD.
- QUALITY APPROVED, with LOW repairs applied.

Open: answers bind to session and exercise, not to a set (LogRow has no revision), and they are kept only until End. [Evidence](docs/plans/in-session-reliability/evidence/a1-structured-answers-local.md).

## C3 honest coach errors, review and rest: SPEC PASS after repair; rest/review policy flagged off (D03/D07)

Unflagged:
- Coach errors use readable, retryable copy and never show raw `HTTP …`. The question is restored, and the retry copy says so only when that is true.
- A partial streamed answer is never archived and never reappears after reopening.
- An empty answer is a visible error, not archived coaching.
- A 20 s idle deadline ends a stalled stream: no more infinite Loading. This is a client responsiveness deadline, not policy.
- Invalid coach requests no longer consume the free daily AI quota. Real local `ai_usage`: RED 0→4, GREEN 0→0.
- An empty "For Next Session" card is hidden.
- Rest-prompt clearing has test coverage, and Leg press and Lat pulldown classification is pinned for D07.

Flagged off, built to recommendations Q2a, Q3a and Q4a: `reviewSetPolicy`, `restWorkSetsOnly`, and `suppressReviewLoadAdvice` (which includes an output filter). With the flags off, the review request bodies are sha256-identical to HEAD.

The first SPEC review FAILED: a partial answer reappeared after reopening, and a stalled stream left Loading on screen. Both were repaired RED-first, then SPEC PASS. [Evidence](docs/plans/in-session-reliability/evidence/c3-feedback-local.md).

## C1 scoped coaching context: SPEC PASS after repair; disclosure carriage flagged off (D09)

Unflagged, from now on:
- The coach sends only the current session's Q&A, never the all-time archive.
- The coach Edge function validates and bounds client history (10 entries × 5000 chars, numbers already in the code).

Behind `COACHING_POLICY.contextualDisclosures` (default false):
- Literal pain and effort disclosures from rows, coach questions and composer messages.
- Disclosures are append-only per session and survive later edits or deletes.
- The preceding composer clarification exchange is included.
- All of it is sent as labelled context blocks, never as chat turns, and parse mode never re-emits rows.
- Historical notes carry a date and the label "historical, not current".
- Truncation is explicit through `omittedCount`.

The first SPEC review FAILED: the composer route was still broken with the flag on, disclosures were recomputed rather than retained, scope fields were missing, and the client didn't mirror the caps. All four were repaired with RED-first tests, then SPEC PASS.

Receipts: lib 3464/0, edge 121/0, tsc 0. ck-p5 smoke 6/6: with the flag off, hostile history is handled exactly like a clean request and provider failures are sanitized. No precedence, TTL or retention invented. [Evidence](docs/plans/in-session-reliability/evidence/c1-coaching-context-local.md).

## H1 history baseline: SPEC PASS / QUALITY APPROVED; progression stays disabled (D07)

Repaired:
- One canonical identity at log and query time, using only the existing alias table.
- A new RLS-scoped `exercise_history_baseline` RPC (migration `20261008000400`). It returns the single newest *completed* workout, never MAX(date) and never a merged day, excludes the current, open and deleted sessions, and drops warmup, cardio, planned and invalid sets.
- next-set returns that baseline while `suggestion` stays null (`policy_unapproved`).
- The app shows explicit "No previous session", "Last session … / Suggestions off" and "Suggestions unavailable" states.
- The hardcoded `+2.5 lb` label is replaced with a computed delta.
- The casing-only edit that left the pill on "Loading…" forever is fixed.

Receipts:
- RED→GREEN: liftMatching 4/4, baseline 10/10, nextSetBaseline 12/12. SQL fixture 24/24, including the reviewer-found NULL-`createdAt` tie-break. Real-HTTP local smoke 7/7.
- QUALITY: name-first filtering cut a 50k-row lookup from 859 ms to 236 ms.

Residual:
- Unlabeled legacy warmups still count (D03).
- The in-session pill mount and session wiring are A3.

[Evidence](docs/plans/in-session-reliability/evidence/h1-history-baseline-local.md).

## P5 local history concurrency: repaired, SPEC PASS / QUALITY re-reviewed

All 9 barrier schedules in the plan reproduced over the real `lib/workoutStorage.ts`:
- concurrent saves of different workouts, and save ∥ delete;
- a stale retry ack, or a slow older ack, overwriting a newer pending revision;
- an ack or review re-inserting a deleted workout;
- duplicate identity-less revisions;
- the history refresh dropping concurrent saves and pending local edits;
- sign-out clear being undone by queued writes (found by the SPEC reviewer).

Repair: one in-process queue for every history read-modify-write, a clear-generation fence, revision-matched acks via `patchRevision` (which never re-inserts), and `mergeServerHistory` (pending local wins), wired into `history.tsx`.

RED 1/9 → GREEN 13/0. lib 3404/0, Edge `_shared` 80/0. Lint, direct eslint, tsc and diff check exit 0. Local ck-p5 stack: 63/63 migrations, with `remote_schema` excluded because of a pre-existing chain defect. `functions serve` smoke: 8/8.

No cross-process atomicity claim. Terminal-rejection 500s and legacy identity-less pending sessions are handed to the P4 owner. [Evidence](docs/plans/in-session-reliability/evidence/p5-history-concurrency-local.md).

## Account deletion clears the deleted user's saved workout (closes P4 auth MEDIUM privacy item)

Once the server confirms the deletion, `runAccountDeletion` runs a new best-effort `clearLocalDraft` step, the first local step and ahead of `signOut` (which fences the draft). The screen wires it to `clearWorkoutDraft(session.user.id)`. The owner check keeps any other account's draft and any legacy draft unchanged, and sign-out still completes. On cancelled or failed re-auth, wrong account, or server failure, nothing is cleared. `clearWorkoutDraft` impact is HIGH, so it is called but unchanged.

Strict RED **5 fail** against the pre-change sources, then GREEN. The screen tests drive the real draft module over an in-memory store. Full lib **3385/0** (+4), lint exits 0 with no warnings, and tsc and diff-check both exit 0. Independent reviewer: PASS (read-only subagent: requirements 1-8 OK and mutation-checked; no reachable autosave race. 3 LOW: #1 RED on SyntaxError not an assertion, fixed with assert.ok and re-verified; #2 legacy/corrupt drafts stay by design; #3 refusal reason not asserted, covered by the (d)/(e) pair). No commit or remote. [Evidence](docs/plans/in-session-reliability/evidence/p4-auth-provenance-local.md).

## P4 Edge `_shared` identity drift repaired: SPEC PASS / QUALITY APPROVED, local commit 958b0c0

`node --test "supabase/functions/_shared/*.test.ts"` went from **66/13 to 80/0**. All 13 failures were proven per test to be stale I3 fixtures, not a log-set regression:

- Every one hit the P4 identity 400 first.
- With identity supplied, every one returns 200. The remaining failures were the old `workout_log` column assertions and the Edge-computed PR, which P4 moved to the SQL `apply_workout_operation` receipt.

The repair is test-only:
- an identity helper using the app's fields;
- a guard so no identity-supplied request can pass vacuously on the identity guard;
- an offline SQL-eligibility receipt model over the forwarded row;
- 1:1 retargeted assertions;
- a new identity-less 400 / 0-RPC negative.

Real SQL parity: actual Edge handlers → real `apply_workout_operation` on disposable PG15, **15/15**. Mutation checks confirm the model and the Edge source are both discriminated.

Gates: lib **3381/0**, lint without warnings, tsc, and diff-check all exit 0. Graph: staged scope LOW; the aggregate stays inherited CRITICAL. An independent reviewer gave SPEC PASS / QUALITY APPROVED, then re-approved after the nit fixes.

`supabase start` is **BLOCKED** because Docker isn't installed. No remote Supabase, push, deploy or migration was run. The commit contains only the test file and depends on the uncommitted P4 sources. The docs are updated in the working tree and not staged. [Receipts, table and limits](docs/plans/in-session-reliability/evidence/p4-edge-fixture-identity-local.md).

## P4 auth / session-provenance repair recovered — pending independent SPEC then QUALITY

Recovered two interrupted workers from their actual edits. Sign-out now fences the workout draft instead of deleting it. Drafts are owner-scoped: foreign or legacy recovery is kept byte-for-byte but blocked. Route callbacks are fenced by persisted session provenance before React rerenders, and AuthProvider ignores a stale initial session. Advisor review found that the owner's own End cleanup advanced the generation and locked out Start/edit/retry. Strict RED 4/4, then `restampOwner` GREEN 21/0. `canStartSession` memoized; lint now has no warnings.

Independent SPEC round 1 FAILED on review-close and Clear-Cache lockouts plus two unfenced handlers. All four were repaired with RED-first tests. Final **3381/0 full lib** (+24), lint exit0 without warnings, app tsc exit0, diff check exit0. Edge `_shared` glob **66/13 pre-existing** I3-vs-P4 identity drift, out of slice and not cleared. Rollover no longer clears the draft: one P1 assertion superseded with its rationale recorded. Fixture-only updates are listed separately. Aggregate graph CRITICAL is inherited, not an all-clear. No migration/deploy/commit. [Receipts, superseded assertion and fixture table](docs/plans/in-session-reliability/evidence/p4-auth-provenance-local.md).

## P4 interrupted live-edit / Clear / abandon delivery recovered — pending SPEC then QUALITY

Preserved the actual dirty implementation and prior approved checkpoints; reran outbox/protocol20/0 before editing. Actual durable delivery→Edge→SQL then exposed the unfinished `revise` protocol (Edge accepted, SQL rejected); strict RED repaired reversible correction without terminal row deletion. Failure-first tests also repaired repeat local tombstone identity, inline incomplete retraction, focus/pending composer commits, reorder and deletion ordinal reconciliation. Clear retains empty original active recovery, fences captured old rows and preserves legitimate later IDs; explicit confirmed empty End durably abandons the old session before recovery cleanup, without touching new sessions. Owner-bound transport, stale-ack matching, P2 End freeze, P1 gates and P3/I3 raw validation retained.

Final **352 focused /3357 full library**, no failures/skips; actual API and durable-delivery modules→actual Edge→disposable SQL **728 RPC calls**, retained660 Unicode/IEEE parity checks, **3 new observed lock barriers**,31 invalid-revise no-effect comparisons plus prior rollback/owner/tombstone controls. Fresh UTF8 Unix-only/TCP-disabled PG shutdown/PID/status verified. Memoized gateway rerun: lint exit0 **without warnings**, actual permitted app tsc exit0, no guard bypass; diff check after docs. Migration remains **UNAPPLIED**, no install/commit/deploy/provider/live DB. Graph pending-edit gateway CRITICAL5 callers, aggregate CRITICAL24 files/94 symbols/84 processes remains stale/abbreviated despite limit300 rerun and actual caller fallback. Parent reports prior transactional checkpoint approved; this bounded slice needs **independent SPEC then QUALITY**, not whole-P4/native/Deno/full-schema/RLS/rollout approval. P5 untouched. [Exact recovery receipts and review contract](docs/plans/in-session-reliability/evidence/p4-live-delivery-recovery.md).

## P4 QUALITY raw-strength SQL parity repair — pending independent re-SPEC then QUALITY

Complete ECMAScript edge trimming now reaches SQL numeric validation and private strength/set storage; raw snapshots and exact anti-fabrication projection checks stay unchanged. IEEE-754 finite acceptance uses actual double conversion instead of comparing exact raw decimals to printed MAX_VALUE; overflow rejects, valid fractional underflow to zero remains compatible. No safe-integer/clinical/PR-policy relaxation or legacy rewrite.

Strict actual shared-validator/direct authenticated SQL/API→Edge→SQL RED: **0/4 reviewer-case readbacks**, trim fix **2 green/2 finite failures**, finite fix **4/0**; expanded Unicode whole-set insertion exposed **57 failures** before sharing the same trim helper. Final **220 generated rows/660 cross-boundary checks**, **403 accepted persistence readbacks/257 invalid no-effect comparisons**, zero failures; **717 RPC calls**, retained prior116 and all62 invalid-row/18 invalid-snapshot, race/rollback/tombstone/delete-ack controls. Four extra fresh/existing-session controls reject numerically equivalent raw-string tampering. **214 focused/3338 full pass**, no failures/skips; lint/diff exit0. App tsc lifecycle scan-cap BLOCKED/no verdict/no bypass. Runner now explicitly creates/asserts UTF8 after documented SQL_ASCII infrastructure failure; TCP disabled, rollback and shutdown/PID/status verified. SQL graph UNKNOWN and inherited aggregate CRITICAL remain unresolved despite expanded graph rerun. Migration UNAPPLIED, no install/commit/deploy/live provider/DB. Whole P4 incomplete; live-edit/Clear/P5 untouched. [Exact matrix, receipts and limits](docs/plans/in-session-reliability/evidence/p4-session-operations-local.md).

## P4 raw snapshot / Edge projection repair — pending re-SPEC then QUALITY

Strict actual API→history Edge→authenticated disposable SQL RED reproduced all four valid failures: numeric strength100/8, cardio explicit null, cardio omitted load/reps, padded strength strings. One shared fix preserves raw Edge projection quantities until SQL insertion; private SQL insertion trims validated strength text only. Exact anti-fabrication JSON coherence remains unchanged, including classification/targets/unknown metadata, and raw snapshots retain types/null/omission/padding. Unknown cardio never becomes zero.

Final real SQL bridge **116 calls**, retaining78 original/50 shared-contract parity/16 capacity readbacks; **4 repaired snapshot/log readbacks**, **20 fresh/existing-session no-effect tamper controls**, **4 numeric-meaning extremes**. Retained Python **62 invalid-row /18 invalid-snapshot** controls and delete retry/barrier/rollback tests pass. Fresh **214 focused /3338 full**, no failures/skips; lint/diff exit0. App tsc blocked by lifecycle scan cap before execution, no verdict/bypass. TCP disabled disposable PG shutdown/PID/status verified; migration remains UNAPPLIED, no live provider/database/deploy/install/commit. Graph SQL UNKNOWN/stale and aggregate CRITICAL/truncated are unresolved; full-schema/RLS/native/Deno gates remain. Whole P4 incomplete; live-edit/Clear/P5 untouched. [Shared-cause matrix, receipts and limits](docs/plans/in-session-reliability/evidence/p4-session-operations-local.md).

## P4 session-operation checkpoint — pending SPEC then QUALITY, no rollout

Actual composer/API/Edge now transports session/row/revision/key; performed row deletion and history DELETE use managed tombstones. Local-first final identity is persisted before remote IO and reused on pending retry. New UNAPPLIED chronological `20261008000300_session_operation_integrity.sql` adds JWT-owned session locks, row revisions/tombstones, exact operation receipts, transactional authoritative snapshot/log/PR reconciliation and committed PR acknowledgement. No daily-live cleanup or destructive legacy conversion; ambiguous legacy writes reject. Approved first checkpoint guard/local-pending behavior preserved.

Verified **214 focused /3338 full lib tests**, zero failures/skips; lint/diff exit0. Fresh Unix-only/TCP-disabled disposable PG tests actual API/Edge/RPC + **16 numeric-capacity readbacks**, real session-lock barriers in both commit orders, retry/key conflicts, two same-day sessions, foreign owner/RLS/bypass rejection, drop-before-put, final exclusions and session tombstones. Real insert/delete/reconcile failures roll back snapshot/log/state/receipt/PR trigger changes; explicit transaction rollback and shutdown/PID absence verified. App tsc **BLOCKED/no verdict** by lifecycle scan cap, no bypass; Deno unavailable. Aggregate graph remains CRITICAL/stale/truncated. Broader live-edit/Clear/abandon pending delivery, P5 concurrency, full-schema/RLS/native/rollout and D08 product choices remain open; **whole P4 is not complete/approved**. Parent reports first bounded checkpoint SPEC/QUALITY approved; new checkpoint requires independent SPEC then QUALITY. [Receipts and limits](docs/plans/in-session-reliability/evidence/p4-session-operations-local.md).

## P4 first bounded checkpoint — implementation pending review, full P4 incomplete

Actual composer fast/skeleton/AI callbacks now reserve synchronously per rendered operation; replay during/after settlement produces one row/log, while identical legitimate subsequent sets have distinct IDs. Actual history delete/insert/PR failures return sanitized500; real API/local storage fixtures retain exact pending rows across failed retries and clear pending only after success. Strict behavioral RED/GREEN and retained assertions preserved: **206 focused /3330 full**, zero failures/skips; lint/direct app tsc/diff exit0. Initial full3327/1 was a new fixture guard erroneously shared between simulated renders, corrected without changing P2 assertions. Parent SPEC then QUALITY required.

**Not complete:** authenticated session/row/revision/opkey protocol, session-owned final RPC/transaction/tombstones/old-client safety and disposable SQL race tests are NOT implemented/verified. Existing daily-live deletion is still unsafe; honest500 is not rollback. No SQL proposal/DB started/deploy/native/Deno/rollout claim. Preserve all original dirty/CLAUDE work. Parent reports bounded P2/P3/I3/C2 SPEC/QUALITY approved; ledger now records latest gates separately from partial whole tasks. I3 reviewer last app tsc guard block remains a missing verdict; this worker's permitted tsc exit0 is separate. [Exact receipts, risks and remaining acceptance contract](docs/plans/in-session-reliability/evidence/p4-first-checkpoint-local.md).

## I3 single QUALITY blocker: cardio SQL capacity — pending SPEC then QUALITY

Added separate **UNAPPLIED** chronological `20261008000200_cardio_metric_capacity.sql`: only heart_rate/calories/level INTEGER -> unconstrained NUMERIC, explicit legacy-preserving casts and NOT VALID finite-capacity guards; no rounding, clinical range, backfill or applied-migration rewrite. Prior approved dirty app/Edge sources untouched. Strict decimal RED actual JSON-record projection rejected120.5 before proposal; GREEN **16 actual log-set/history SQL insert/readbacks**, fractions/zero/omission/int32 overflow/MAX_VALUE/MIN_VALUE and legacy raw controls retained. HTTP200 is not evidence: legacy-schema history negative control still returns200 after actual insert failure and correctly fails readback.

Retained **65 strength SQL parity cases/0 mismatches**, **183 focused /3322 full tests**, zero failures/skips; lint/direct app tsc/diff exit0. Scratch-only PG15, TCP disabled, all transactions rolled back, final schema absence and stopped/status verified. Fixture-generator dollar-quote failure retained honestly in receipts. I3 remains implementation_pending_review, independent SPEC first then QUALITY; graph UNKNOWN/aggregate CRITICAL/stale/truncated and full-schema/RLS/native/Deno/rollout approval remain open. [Bounded receipts, commands and limitations](docs/plans/in-session-reliability/evidence/i3-cardio-storage-local.md).

## I3 string-zero final SPEC repair — pending independent SPEC then QUALITY

Shared evidence eligibility now normalizes the already-validated whole set number: numeric0/string`0`/string`00` exclude strength/PR evidence consistently with SQL set_number0. Positive/omitted compatibility and malformed-token rejection remain unchanged. Only `lib/workoutValidation.ts` production code changed; C2 and all other approved work are untouched.

Failure-first client/Edge + actual-handler tests: **126 pass/4 fail**, with erroneous string-zero PR126.7; real SQL parity: **65 cases/2 mismatches** before the fix. Final **183 focused /3322 full lib pass**, no failures/skips; **65 SQL parity cases/0 mismatches**, matching trigger/reconcile/readback and ROLLBACK. Lint/direct app tsc exit0; final diff check recorded in evidence. Safe documented scratch PG only, TCP disabled, rollback and stopped/status verified. UNKNOWN impact required manual caller fallback; inherited aggregate graph remains CRITICAL/truncated, not all-clear. I3 remains implementation_pending_review; no deployed/native/Deno/RLS/full-schema claim or migration/deploy approval. [Exact receipts and scope](docs/plans/in-session-reliability/evidence/i3-string-zero-local.md).

## I3 SPEC follow-up — pending independent SPEC then QUALITY

Repaired cardio full-token scanning, actual chat model metadata loss and untrusted classification/envelope failures, retaining all prior approved work. Actual parser/composer rejects malformed quantities without effects and retains input; model mapper preserves validated0/false/optional metadata and planned/warmup/cardio provenance. HTTP malformed envelopes are sanitized400 before usage/provider; invalid model shapes are502. Additive unapplied SQL now quarantines unknown classifications and aligns guarded PR calculations with Edge floating-point overflow/rounding, preserving raw legacy strings.

Verified **155 focused /3308 full lib tests**, zero failures/skips; lint/direct app tsc/diff exit0. Safe reused scratch PG15.14 fixture and real trigger/reconcile parity: **59 cases/0 mismatches**, ROLLBACK, TCP disabled, cluster stopped/status verified. Tests are offline actual-handler/route fixtures, not native or deployed. Deno unavailable/typecheck BLOCKED; full RLS/schema/native/release gates remain open. SQL proposal needs separately approved coordinated schema/Edge rollout. I3 remains implementation_pending_review; deadline does not waive SPEC/QUALITY.

Parent handoff now reports bounded **C2 SPEC/QUALITY APPROVED,22 tests**; older pending C2 statements below are historical. Coach streaming sources untouched. [Exact RED/GREEN receipts, fixture correction, safety and limits](docs/plans/in-session-reliability/evidence/i3-spec-repairs-local.md).

## I3 local checkpoint — implementation pending SPEC then QUALITY

Shared strict numeric integrity now reaches actual app edits/parser/AI ingestion and Edge log/chat/history. Invalid edits retain text with visible feedback; unknown is not zero, explicit0 remains, whole safe reps are not prefix-truncated. Existing performed selector/P2/P3 work preserved; zero reps do not trigger live performance effects. Adaptive next-set is unavailable pending D07, not newly approved policy. New additive SQL proposal retains raw evidence and guards PR/reconcile casts; no production migration or deploy.

Verified **69 targeted /3255 full lib tests**, zero failures/skips; latest lint/direct `npx tsc --noEmit`/diff checks exit0. App typecheck does not cover tests/Edge; Deno unavailable/typecheck BLOCKED. Fresh disposable local PG15.14 reproduced reconcile integer-overflow RED exit3, then proposal fixture GREEN exit0/ROLLBACK; cluster stopped. Not production RLS/JWT/schema/deployed correctness. Initial full failures and fixture corrections are recorded, not relabeled passes.

**Remaining:** independent SPEC then QUALITY; exhaustive cardio-token/model-response metadata/extreme SQL parity; real RLS/native/Deno/deployed checks. Edge classification columns require separately approved coordinated migration before deployment. Deadline checkpoint is not whole I3 completion. [Exact receipts and limitations](docs/plans/in-session-reliability/evidence/i3-numeric-integrity-local.md).

**Latest handoff correction:** parent reports bounded P2 SPEC/QUALITY APPROVED and latest P3 QUALITY APPROVED (3216 full; historical scan-cap typecheck block). Current direct app typecheck receipt above is separate. C2 implementation remains pending re-review with22 tests per parent; coach files untouched. Older pending statements below are historical receipts, not current bounded-gate status.

## P3 actual cardio ingestion / strength-review SPEC repairs — pending independent review

Real AI row builder now retains typed cardio fields, classification/targets and canonical identity/time including zero/false, without promoting planned cardio or target reps into performance. End persists every performed row but reviews only strength; cardio-only End does not request a strength review or fabricate a rating. Direct review API filters mixed rows and rejects no-strength input before provider IO. Existing P2 fences and prior I2/P1 work preserved; C2 coach streaming files untouched.

Strict RED/GREEN: ingestion0/1->1/0; cardio-only End1/1->2/0; direct API no-data/mixed14/6->combined24/0. Integrated actual AI send/builder -> End -> hook -> real offline storage/API/history handler/GET covers mixed/legacy/zero/false/missing optionals/planned exclusions, local failure+retry and pending-sync retry. Final **31 P3 /202 retained P2+I2 /3216 full**, all pass/no skips; lint/diff exit0. Initial full3207/9 exposed VM nested-target cloning in review projection; repaired production projection retaining original target reference, no old assertions altered. **App typecheck BLOCKED/no verdict** by lifecycle guard1MiB scan cap; no bypass/alternate runner. Parent must obtain authorized app tsc and independent SPEC then QUALITY.

[Exact commands, graph risks, fixture corrections and honest offline limits](docs/plans/in-session-reliability/evidence/p3-cardio-spec-repairs-local.md). Aggregate remains CRITICAL/15 tracked files/77 symbols/37 flows, stale/truncated; storage HIGH/7 caller risk unchanged. No native/provider/live DB/SQL/deployed/PR reconciliation correctness claims, installs/commits/reset/stash/secrets/deploy or C2 edits. P3 remains implementation_pending_review, P4/P5 remain open.

## P2 interrupted-run recovery — fresh verification, pending independent review

Recovered actual dirty checkout at `deps/audit-2026-09-25` / `e9f96fe6190187472c4ada2f584e8526fec13e41` on 2026-10-09 01:55 EDT. The interrupted worker had **already completed local implementation, tests and evidence updates before waiting for a model response**; its bounded transcript ends after those writes, not during a source edit. No unfinished syntax or failing existing P2 test was reproduced. Existing End ownership/snapshot/freeze/retry, optional-review failure handling and late-response fences were retained rather than reimplemented. Recovery made documentation-only changes; all prior input/I2/P1/P2 source and assertions preserved.

Fresh execution: initial P2 command **77 pass/0 fail/0 skipped**; full suite **3204/0/0**; separate P1+schedule **144/0/0**, retained I2 **119/0/0**, input **2191/0/0**. `npm run lint`, direct `npx tsc --noEmit` and `git diff --check` each exit0. Raw fresh receipts: active-profile scratch `ck-p2-recovery-{initial,full,p1,i2,input,lint,tsc,graph}.log`. Existing module/react-test-renderer warnings and intentional offline diagnostics remain. App tsc excludes tests/Edge. These are recovery verification receipts, not a new RED/GREEN cycle or independent SPEC/QUALITY approval.

Fresh graph impacts: `saveWorkout` HIGH/7 impacted symbols; `clearWorkoutDraft` HIGH/6. Reviewed actual Home End/clear/reset paths, storage sync/upsert, history load/retry and auth cleanup source boundaries. New ownership/invalidation symbols remain UNKNOWN in the stale index; actual route callers and fixtures establish use, not graph clearance. Aggregate still CRITICAL/14 tracked files/73 symbols/37 flows and truncated, missing untracked helpers/tests. P2 stays `implementation_pending_review`; parent must independently review SPEC then QUALITY. No native/provider/DB verification, P3 cardio repair, P4 server idempotency/barriers, P5 global-history concurrency or C1 long-term-context completion claimed. No commit/reset/stash/install/secrets/deployment.

## P2 End/save and late-response ownership — implementation pending review

Parent reports latest bounded P1 independently SPEC PASS / QUALITY APPROVED (3127 full /144 P1+schedule /10 additional reviewer checks; lint/typecheck/diff exit0), not native/provider/DB completion. Earlier receipts below remain historical. P2 F3/F4 now implemented locally with synchronous End reservation, stable-ID/revision/owner snapshot, explicit save phase and finalization freeze/dismiss guards. Typed done and button End share confirmation, including explicit empty-session discard. Performance becomes durable locally before optional review; review has a 5000 ms deadline and failures produce unavailable/null, never synthetic success. Real API review fallback also removed failure-first. Local save/cleanup failure preserves current rows and original recovery identity/date with honest retry.

Request/owner/lifecycle and P1 draft-generation fences cover parse ghosts, questions, coach streaming/final/history, stale finally, rest/PR callbacks and old save/confirmation/clear completions. Both empty/performed cleanup paths check their own post-clear generation and release only their exact latch. P3 cardio fields and P4 irreversible live-write/idempotency/server-barrier scope deliberately unchanged; global history and in-flight native writes remain C1/P5 limitations.

Executed final: **77 P2 /144 P1+schedule /119 retained I2 /2191 retained input /3204 full**, all pass with zero skips. `npm run lint` (no warnings), direct `npx tsc --noEmit`, `git diff --check`: exit0. App tsc excludes tests/Edge; full tests retain module/react-test-renderer warnings and intentional offline diagnostics. Original retained fixture assertions first failed127/190 for new missing dependencies, then assertion-preserving shared harness adaptation passed317/0; not relabeled original green. All prior source/tests/plans/original CLAUDE edits preserved.

[Strict RED/GREEN commands, exact paths, fixture corrections, irreversible boundaries and independent review contract](docs/plans/in-session-reliability/evidence/p2-session-ownership-local.md). Final aggregate graph twice **CRITICAL/14 tracked files/73 range-attributed symbols/37 flows**, still truncated and missing untracked code: no all-clear. Parent must independently run **SPEC regression then QUALITY review**. No commit/reset/stash/install/secrets/live provider/DB/migration/deploy or native approval.

## First in-session reliability repair slice (partial D1 / partial I1)

Baseline: `deps/audit-2026-09-25`, HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`. Existing modified `CLAUDE.md` and `.claude/CLAUDE.md` and untracked plan documents preserved. No commit/reset/stash, dependency install, credentials, paid/live AI, production database, migration or deployment.

Implemented:
- `lib/structuredGate.ts`: anchored sequential weight/reps token consumption, no numeral splitting/sign skipping, explicit validation with original input/clarification for malformed pairs, literal single-set trailing notes. Valid `Bench 100kg 5` remains 220.5 lb × 5; plates/conventional/bodyweight/bare-number and embedded legacy cases remain covered.
- `app/(tabs)/index.tsx`: pass unnormalized composer text to the real parser, show clarification and return on validation before AI/write/rest effects. New note-bearing completed sets cannot be consumed as notes-only updates to a previous completed set. Filling an incomplete row preserves existing notes plus the new literal disclosure; no performed-state overhaul.
- Tests use the real parser. The offline harness AST-extracts the unique actual HomeScreen `sendMessage` closure; explicit state/effect doubles capture rows and API payloads. AI fixture throws if reached; no native mount/device test is claimed.
- Plan progress and compatibility defaults recorded; neither D1 nor I1 is marked complete.

Actual failure-first commands/results (all from repository root):
1. `node --experimental-strip-types --test lib/__tests__/structuredGateIntegrity.test.ts`: initial RED **5 pass / 6 fail** (four exact corruptions plus fractional/junk reps, actual `fast` instead of `validation`); after narrow numeric fix GREEN **11 pass / 0 fail**.
2. `node --experimental-strip-types --test lib/__tests__/inSessionHarness.test.ts`: route RED **1 pass / 8 fail** (validation silently ignored, missing clarification); after route guard combined parser/route GREEN **20 pass / 0 fail**.
3. `node --experimental-strip-types --test lib/__tests__/inSessionHarness.test.ts lib/__tests__/structuredGateIntegrity.test.ts`: literal-tail RED **20 pass / 12 fail** (empty notes in real parser/route); after literal notes/new-set routing GREEN **32 pass / 0 fail**.
4. Parser edge RED **17 pass / 5 fail** (unknown x-prefixed prose, separated minus, numeric overflow/unsafe reps, surrounding-space bare shorthand); after narrow corrections combined GREEN **37 pass / 0 fail**.
5. Route existing-note fill RED **15 pass / 1 fail** (new pain disclosure dropped); after note-preserving fill combined GREEN **38 pass / 0 fail**.
6. Final same targeted command with legacy embedded parser regression added: **39 pass / 0 fail**, no skips.
7. `node --test "lib/__tests__/*.test.ts"`: final **754 pass / 0 fail**, no skips, exit 0. Full generated log: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-slice-lib-tests.log`. Existing module-type/react-test-renderer warnings and intentional error-fixture diagnostics remain; not a warning-free run.
8. `npm run lint`: exit 0. `npx tsc --noEmit`: exit 0. App tsconfig excludes tests and Edge functions; these commands do not typecheck those domains. Tests execute separately using native TS stripping/installed TypeScript transpilation.
9. `git diff --check`: exit 0.

Graph evidence: before production edits, `node .gitnexus/run.cjs impact decideAndParse --file lib/structuredGate.ts --direction upstream --repo .` resolved LOW, 4 affected symbols (direct callers `sendMessage`, `runDevStructuredGateTests`). `parsePairsFromTail` was initially UNKNOWN/ambiguous, resolved using `--uid Function:lib/structuredGate.ts:parsePairsFromTail`: LOW, 4 symbols, direct caller `decideAndParse`. `HomeScreen`/`sendMessage` were LOW with no upstream graph callers; source inspection and actual-route fixtures establish the runtime path. `addOrFillRow` was LOW, direct caller `sendMessage`. Callers were read before editing. Aggregate `node .gitnexus/run.cjs detect-changes --scope all --repo .` reports **HIGH**, 4 tracked files / 9 symbols / 8 flows, including preexisting CLAUDE changes; warned before further work. It also attributes adjacent `extractExercises` via diff ranges although that function is not edited. Untracked tests/docs are not fully represented by that tracked-file graph scan; no all-clear/commit claim.

## Independent spec-review repairs (still partial D1 / partial I1)

The first independent spec review failed explicit bodyweight disclosures and question-mark disclosure routing. This repair changes only `lib/structuredGate.ts` production logic; the existing HomeScreen/new-set fix is retained unchanged. Explicit `Pullups 15 no pain` / `Pullups 15 exhausted` produce 0 lb × 15 with literal notes and append after a completed 0 lb set. `Bench 185 8 shoulder pain?` logs a new set with the literal question mark rather than going to AI. The question exception requires an explicit exercise and a set-shaped numeric prefix with trailing prose; strong question-word prefixes, `Bench 185 for 8?`, bare `185 8?`, and standalone numerical coaching questions remain conversational. Malformed signed/unsupported-unit/fractional entries with trailing question-mark disclosures reach validation and do not write or call AI. Bare-number inference, comma grammar, structured effort policy, and whole I2 remain unchanged.

Strict vertical failure-first results, real parser plus AST-extracted route, command `node --test lib/__tests__/inSessionHarness.test.ts lib/__tests__/structuredGateIntegrity.test.ts`:
- Bodyweight disclosure RED **39 pass / 3 fail** (prior row unchanged but no new row, expected 2 rows / actual 1); narrow bodyweight notes fix GREEN **42 pass / 0 fail**.
- Question disclosure/validation RED **48 pass / 7 fail** (AI instead of logging/validation); narrow question exception GREEN **55 pass / 0 fail**. Six genuine-question parser compatibility fixtures passed both before and after.
- Additional bodyweight compatibility RED **55 pass / 2 fail** (literal RPE/RIR notes and numeric-only trailing spaces); narrow literal scale-tail / whitespace retention GREEN **57 pass / 0 fail**. Effort text remains unstructured notes, not interpreted scale data.
- Broader literal bodyweight suffix RED **68 pass / 2 fail** (unknown numeric prose and `RPE 9?`); retaining the entire prose suffix without interpreting its numbers GREEN **70 pass / 0 fail**.
- Final parser/route compatibility including actual-route genuine questions and malformed question disclosures: **70 pass / 0 fail**, no skips, exit 0.
- Full `node --test "lib/__tests__/*.test.ts"`: **785 pass / 0 fail**, no skips, exit 0. Existing module-type/react-test-renderer warnings and intentional error-fixture diagnostics remain.
- `npm run lint`: exit 0. `git diff --check`: exit 0.
- App typecheck rerun **BLOCKED / no verdict**: lifecycle guard refused `./node_modules/.bin/tsc --noEmit` because `node_modules/typescript/lib/_tsc.js` exceeds its 1 MiB scan cap. No approval bypass/workaround attempted. The earlier first-slice typecheck pass is historical, not a pass for this repair. Authorized interactive typecheck remains necessary.

Graph: pre-edit ambiguous `decideAndParse`/`parsePairsFromTail` impacts were UNKNOWN, then explicitly resolved by file / UID to LOW with 4 impacted symbols each; callers include `sendMessage` and dev parser tests. Final `node .gitnexus/run.cjs detect-changes --scope all --repo .`: **HIGH**, 4 tracked files / 10 symbols / 8 flows, including preserved first-slice and CLAUDE edits; range-based adjacency includes unchanged extraction/dev-test symbols. This is not an all-clear; untracked regression/docs coverage remains outside the tracked graph scan.

All logs now reside in `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-review-*.log`; runtime shell TMPDIR unexpectedly pointed to the macOS system temp directory, so this task's logs were moved to the required scratch directory. No logs remain intentionally under system temp. No new repo files, commits, installs, live providers/DB calls, deployments or policy approvals. Native/DB/storage/Edge verification remains unclaimed. Next gates remain independent spec re-review, then quality review; D1/I1 are not complete.

## Set-intent/punctuation spec re-review repair (still partial D1 / partial I1)

Replaced the partial question-pattern exemption with the wired `hasExplicitSetIntent` classifier: conversational question prefixes/personal narrative and relational proposed-set syntax remain conversational; an explicit exercise label followed by a numeric attempt reaches the normal parser regardless of terminal punctuation, missing reps, unsupported units or signs. Intent recognition is independent of numeric validity, not a list of the five failed examples. The single-set/bodyweight grammar accepts literal annotation delimiters (parentheses, colon, semicolon, question/exclamation marks, em dash), preserving the delimiter and entire suffix after separator whitespace. No compact `Bench100kg5` grammar expansion; ordinary `Bench 100kg 5` remains covered. No route production changes in this repair; tests execute the existing actual extracted `sendMessage` with the real parser.

Vertical TDD command: `node --test lib/__tests__/inSessionHarness.test.ts lib/__tests__/structuredGateIntegrity.test.ts`:
- Missing-reps/signed/fractional/unsupported-unit punctuation + disclosure family RED **80 pass / 54 fail** (parser AI vs validation, route cleared composer); classifier GREEN **134 pass / 0 fail**.
- Weighted/bodyweight literal delimiter family RED **150 pass / 26 fail** (validation instead of new logged row); annotation grammar GREEN **176 pass / 0 fail**.
- Standalone question compatibility family RED **200 pass / 4 fail** (`Could I ...` and `Are ...` without terminal question marks treated as set labels); unified auxiliary-question prefix GREEN **204 pass / 0 fail**.
- All validation route cases assert composer unchanged, prior rows unchanged, exactly one clarification, and no AI/log/skeleton/rest/PR/end calls. Valid annotation route cases assert a distinct appended row and exact captured weight/reps/notes payload. Genuine-question route cases assert AI only, no set effects.
- Sentence-period delimiter family RED **204 pass / 12 fail**; narrow period boundary excluding decimal digits GREEN **216 pass / 0 fail**. Fractional rep validation remains covered.
- Full final `node --test "lib/__tests__/*.test.ts"`: **931 pass / 0 fail**, no skips, exit 0. Existing module-type/react-test-renderer warnings and intentional fixture diagnostics remain.
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: exit 0 for this repair. The original direct typecheck command was permitted on this rerun; no bypass or indirect typecheck runner was used. App tsconfig excludes tests and Edge functions, which are not claimed typechecked.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-classifier-{red1,green1,red2,green2,red3,green3,red4,green4,full,full-final}.log`.

Pre-edit graph impacts resolved by file/UID: `decideAndParse` LOW, 4 affected symbols, direct callers `sendMessage`/dev tests; `parsePairsFromTail` LOW, 4 symbols, caller `decideAndParse`. Existing aggregate HIGH warning remains unresolved. Final tracked graph analysis reports **HIGH**, 4 files / 18 range-attributed symbols / 8 flows including preserved earlier route/CLAUDE edits; range attribution includes unchanged adjacent functions, and the new classifier/untracked tests/docs are not fully represented by the stale index. No low-risk/all-clear claim. All prior edits preserved; no installs, commits, DB/provider/network/deploy activity. Independent spec then quality review are pending, not passed; D1/I1 remain partial and broader policy/native/persistence limitations below still apply.

## Narrative/mode-boundary structural repair (still partial D1 / partial I1)

The next independent review failed despite the previous 216/931 passes. Fixed the control-flow causes rather than exempting individual inputs:
- Conversational prefix classification now runs unconditionally before exercise recognition, independent of terminal `?`. It examines only the text before the first number: question auxiliaries, personal subjects/possessives, temporal introductions, sentence predicates (`hurt`/`hurts`, `felt`/`feels`, `was`/`were`, `did`, `suggested`), and a relational introduction ending `after`/`before`/`since`/`at`/`during` denote conversation, not an exercise. The same words after a completed numeric prefix remain literal notes. This is a deterministic grammar, not a universal natural-language classifier or clinical diagnosis.
- Parse the anchored numeric prefix before considering terminal control grammar. Cardio is now an initial `cardio` command or a recognized initial activity whose first number has a time/distance unit, not an arbitrary `cardio` mention in notes. Superset commands require a marker in the exercise prefix, or multiple exercise labels plus multiple validated pairs and an exact terminal `ss`/`superset` marker. Dropsets require a prefix command, or multiple validated pairs plus an exact terminal `dropset`/`drop set` marker. Single-set tails containing these words are retained literally.
- Preserve legacy explicit warmup grammar: a marker in the exercise prefix or the complete terminal suffix `warmup`/`warm-up`/`warm up` selects warmup; prose such as `no pain after warmup` does not relabel work. Product-level warmup identity/resequencing remains I2, not solved here. Literal delimiter/spelling/internal/trailing whitespace notes are retained; only separator whitespace after the numeric prefix is removed.
- Bodyweight whole reps now receive the same safe-integer check as weighted reps. Spaced `Bench 100kg 5` remains 220.5 lb × 5; no compact syntax expansion.
- Actual HomeScreen additionally refuses AI-returned rows for a `conversational_question` decision. Conversation is answer-only even if an offline model-response fixture returns fabricated sets. The harness adds an explicit captured mapper seam for this branch; default AI access still throws, and no provider is called.

Vertical strict TDD receipts (`node --test --test-reporter=tap` with the parser/route test files; new matrix file included from cycle 2):
| Slice | RED pass/fail | GREEN pass/fail |
| --- | --- | --- |
| Personal narratives without question gate | 223 / 14 | 237 / 0 |
| Weighted/kg/bodyweight × mode keywords × literal delimiters (new matrix alone RED) | 0 / 144 | 381 / 0 combined |
| Broader personal/temporal/predicate narrative syntax | 384 / 18 | 402 / 0 |
| Malformed prefix × mode keywords × punctuation; unsafe bodyweight reps uncovered | 666 / 24 | 690 / 0 |
| AI-returned rows cannot override conversation intent | 690 / 3 | 693 / 0 |
| Genuine terminal multi-exercise superset compatibility | 703 / 2 | 705 / 0 |
| Relational symptom narratives without personal pronoun | 705 / 9 | 714 / 0 |

All existing tests were retained; no old expectation was changed. Matrix assertions execute the real parser and extracted actual route, checking exact literal notes and captured appended-row payloads, distinct new identity/unchanged prior row, and preserved composer/one clarification/no AI or set effects for malformed attempts. Intentional cardio/superset/dropset/warmup compatibility runs through the actual route too. Tests cover 12 malformed prefix alternatives × 8 keywords × 3 punctuation alternatives; valid weighted/kg/bodyweight × 8 keywords × 6 disclosure delimiters; narratives with and without question marks.

Final receipts:
- Targeted parser/actual-route tests: **714 pass / 0 fail**, no skips, exit 0 (`coach-kettle-structural-green7.log`).
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **1429 pass / 0 fail**, no skips, exit 0 (`coach-kettle-structural-full-final.log`). Existing module-type/react-test-renderer warnings and intentional fixture diagnostics remain.
- Additional independent-style scratch probe, beyond added fixtures: **345 checks / 0 failures**, actual parser/route, offline. Challenges other exercise names (including `Bike` and `Pain free press`), uppercase keywords, `lb × reps`/kg/compact numeric pair forms, unknown numeric prose, punctuation, malformed units/signs/fractions, bodyweight names and personal narrative responses containing fabricated rows. File: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-structural-independent.ts`. This is self-verification, not independent approval.
- `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: each exit **0**. No guard bypass used; app tsconfig still excludes tests/Edge functions.
- Logs reside only in `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-structural-*.log`.

Graph: pre-edit `decideAndParse` LOW / 4 symbols (direct `sendMessage`/dev tests); `hasCardioSignals` initially ambiguous UNKNOWN, resolved by function UID to LOW / 4 (direct `decideAndParse`). The newly added classifier is absent from the stale graph; source fallback confirms its callers are `decideAndParse` and `hasExplicitSetIntent`. `sendMessage` LOW / no indexed upstream callers; read its full affected closure and exercised its route. Harness UNKNOWN / not indexed; source search confirmed only the two actual-route test files call it. Aggregate HIGH warned before the additional route guard. Final `detect-changes --scope all --repo .` reports HIGH, 4 tracked files / 22 range-attributed symbols / 8 flows including earlier preserved route/CLAUDE changes. CLI still displays only 15 symbols (`... and 7 more`) even when rerun with `--limit 200`; this remains a partial graph presentation, not a clean/all-clear verdict. Untracked tests/docs and new classifier are not fully represented. No commit is attempted or authorized.

Partial progress only: spec re-review and quality review must still be performed by the parent/reviewers. Broader I1 policies, comma handling, and I2 remain deferred. No installs, resets, commits, secrets, live model/DB calls, migrations, deploys or native verification. All preexisting changes preserved.

## Unsupported-unit/bodyweight-fallback structural repair (still partial D1 / partial I1)

Independent scratch spec review reproduced **40 pass / 24 fail** in 64 scenarios before this repair: unsupported weight-unit-reps input such as `Bench 100 g 8 shoulder pain` returned an invented 0 lb × 100 row with `g 8 shoulder pain` notes. The bodyweight branch returned before the weighted parser's invalid result could reach validation.

Semantic rule chosen: before the single-number/bodyweight fallback returns, inspect the beginning of its literal suffix. An alphabetic-starting non-whitespace token followed by whitespace, optional `x`/`×`, optional sign, and another numeric start is an apparent unit/pair attempt. It cannot override failed weighted-pair parsing merely because it also contains prose or terminal punctuation. The positive annotation introducers `RPE`, `RIR`, `pain`, `unknown`, `after`, `before`, `during`, `since`, `at` (complete whitespace-delimited labels, case-insensitive) denote effort/observation/uncertainty/relational prose instead. Their numbers remain literal notes, never structured effort data. Multiword symptom prose, explicit note delimiters, compact literal effort labels, and number-free prose remain accepted. This is a conservative deterministic syntax distinction, not a universal NLP/unit recognizer; other isolated label-number ambiguities clarify rather than invent a set. The existing unsupported-unit denylist was **not expanded**. Supported lb/lbs/kg/kgs/plate/plates pairs still use the weighted parser first.

Only production edit in this follow-up: `lib/structuredGate.ts` adds the ambiguity predicate to bodyweight fallback eligibility. Existing HomeScreen validation guard, conversational response guard, notes handling, comma grammar, effort policy, bare inference, compact exercise syntax and I2 remain unchanged. Added durable `lib/__tests__/bodyweightAmbiguity.test.ts` uses the real parser and actual AST-extracted route: varied arbitrary unit tokens, punctuation inside tokens, terminal punctuation, empty/completed-row contexts, literal effort/numeric narrative compatibility, explicit note delimiters and supported unit pairs. Invalid inputs assert no rows, unchanged composer/prior rows, one clarification, and no chat/log/skeleton/rest/PR/end effects. Valid cases assert distinct appended identity and exact captured notes/weight/reps.

Strict vertical TDD receipts:
- `node --test --test-reporter=tap lib/__tests__/bodyweightAmbiguity.test.ts`: cycle 1 RED **0 pass / 2 fail**; parser returned fast and actual route appended invented 0 lb × 100. Added structural word-number ambiguity check; combined prior-targeted GREEN **716 pass / 0 fail**.
- Cycle 2 RED **2 pass / 3 fail** for punctuation-bearing unit tokens (`grams.`, `kilo_grams`, `stone(s)`); widened the structural token boundary, not a unit list. Combined GREEN **719 pass / 0 fail**.
- Added compatibility/adversarial matrices without changing old fixtures. Final targeted command (new file plus `inSessionHarness.test.ts`, `structuredGateIntegrity.test.ts`, `structuredRouting.test.ts`): **813 pass / 0 fail**, no skips, exit 0.
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **1528 pass / 0 fail**, no skips, exit 0. Existing module-type/react-test-renderer warnings and intentional fixture diagnostics remain; not warning-free.
- Unmodified independent failing recipe `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-independent-spec.mts`: **64 scenarios / 64 pass / 0 fail**, exit 0. Also reran the prior structural scratch probe: **345 checks / 0 failures**, real parser/route, offline. These reruns are execution evidence for reviewers, **not independent spec approval**.
- `npm run lint`: exit 0. Direct `npx tsc --noEmit`: exit 0, no guard bypass. `git diff --check`: exit 0; app tsconfig excludes tests/Edge functions.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-unit-{red1,green1,red2,green2,targeted,full,independent,prior-independent,graph}.log`.

Graph before production edits: `decideAndParse` file-qualified upstream impact **LOW / 4 symbols**, direct callers `sendMessage` and dev parser tests; one affected process group, two modules. Read current parser, route, harness, test compatibility, AGENTS and plan before changes. Existing aggregate HIGH was warned pre-edit. Final tracked `detect-changes --scope all --repo . --limit 200`: **HIGH / 4 files / 22 symbols / 8 flows**, including preserved earlier route/CLAUDE changes. Presentation still truncates at 15 symbols (`... and 7 more`); no clean/all-clear claim. Untracked tests/docs and new syntax predicates remain outside full stale-graph coverage; source inspection and actual-route extraction cover the touched execution path.

All previous edits preserved. No commits, installs, secrets, live model/DB calls, resets, migrations, deployment, guard bypass or native verification. D1/I1 remain partial; parent independent spec re-review and subsequent quality review remain pending.

## Final three-family grammar-boundary repair (still partial D1 / partial I1)

The latest 10-scenario adversarial probe was inspected rather than accepted blindly. Its multiword unsupported unit is a genuine number-label-number ambiguity, and fatigue is a clear literal observation annotation; both belong in this bounded slice. All ten expectations now pass with the original probe unmodified. No production route edit was needed: the existing clarification and answer-only guards are exercised through the real parser and AST-extracted HomeScreen route.

Changes:
- `lib/structuredGate.ts`: the apparent-unit grammar now consumes arbitrary label words/token punctuation, optional colon/equal delimiter, optional x/×, and a sign with independent whitespace before the second numeric start. It is not a unit denylist. Failed weight pairs cannot become bodyweight sets just because the sign is spaced or the unit label has multiple words. Positive effort/observation/relational annotation boundaries accept colon, equals and parentheses as well as whitespace; dash/em-dash forms remain literal. Clear symptom/relational prose before the suffix's first number is also annotation text. RPE/RIR/pain/fatigue values are not interpreted, clamped or range-guessed.
- Conversational grammar checks the first-number boundary for elapsed-time quantities outside intentional cardio commands, sentence predicates (copulas/auxiliaries, onset, persistence, duration, recurrence and change), and terminal symptom nouns. These sentences remain answer-only even when an offline model fixture returns rows. Custom movement names, body-part exercise labels, and explicit numeric sets remain supported without an exercise allowlist; controls include Pain free press, Shoulder press, Knee supported row, Andrew custom movement, Paused dragon flag, Standing calf raise and Reverse Nordic.
- New `lib/__tests__/grammarBoundaries.test.ts`: 613 durable real-parser/actual-route cases. Matrices cross arbitrary unit labels with signs attached/spaced, x/× and terminal punctuation; annotations with punctuation separators; six body-part/symptom subjects with eight temporal/predicate shapes and three punctuation endings; legitimate custom/movement controls. Invalid inputs keep the composer/prior rows unchanged, emit one clarification and never reach AI/log/skeleton/rest/PR/end. Valid annotations append distinct rows and preserve exact captured notes/weight/reps. Narratives cannot accept model-fabricated rows.

Strict vertical TDD receipts (new matrix alone for RED, all five integrity/route matrix test files for GREEN):
| Family | RED pass/fail | GREEN pass/fail |
| --- | --- | --- |
| Unit labels × separators × independently spaced signs | 144 / 180 | 1137 / 0 |
| Punctuated effort/observation annotations | 343 / 11 | 1167 / 0 |
| Predicate/elapsed-time narratives plus custom controls | 379 / 126 | 1318 / 0 |
| Arbitrary multiword units and separated colon/equal delimiters | 505 / 108 | 1426 / 0 |

Observed failures were behavioral (`fast` instead of `validation`, `validation` instead of literal `fast`, fabricated bodyweight rows instead of conversation), not harness errors. No prior fixture or expectation was removed or changed.

Final verification:
- Targeted five-file parser/actual-route suite: **1426 pass / 0 fail**, no skips.
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **2141 pass / 0 fail**, no skips, explicit exit 0. Existing module-type/react-test-renderer warnings and intentional fixture diagnostics remain; not a warning-free run.
- Unmodified scratch probes: `ck-final-adversarial.mts` **10 scenarios / 0 failures**; `ck-independent-spec.mts` **64 pass / 0 fail**; `coach-kettle-structural-independent.ts` **345 checks / 0 failures**. Offline execution evidence, not independent reviewer approval.
- `npm run lint`: exit 0. Direct `npx tsc --noEmit`: explicit exit 0; no guard bypass. `git diff --check`: exit 0. App tsconfig still excludes tests/Edge functions.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-boundary-{red1,green1,red2,green2,red3,green3,red4,green4,full,adversarial-final,independent,prior-independent,graph}.log`.

Graph: pre-edit file-qualified `decideAndParse` impact LOW / 4 affected symbols, direct callers `sendMessage` and dev tests, one process group / two modules. Existing aggregate HIGH risk was warned before edits. `hasConversationalPrefix` remains UNKNOWN/not indexed; source fallback confirms only `hasExplicitSetIntent` and `decideAndParse` call it. Final `detect-changes --scope all --repo . --limit 200` remains **HIGH / 4 tracked files / 18 range-attributed symbols / 8 flows**, including preserved route/CLAUDE changes. Presentation truncates after 15 symbols (`... and 3 more`) despite the limit; stale graph/new classifiers/untracked tests and docs are not fully covered. This is not an all-clear.

Boundaries: this is a conservative deterministic grammar, not a universal English/symptom classifier. Ambiguous unit-like labels clarify; arbitrary noun-like custom exercise labels remain permitted. A custom label containing a sentence predicate or ending in a symptom noun may be treated as conversation; no claim covers every invented label or natural-language sentence. Non-cardio elapsed-time instructions remain answer-only rather than invented reps; timed-strength semantics are not introduced. Explicit note delimiters still mark literal notes. Compact exercise syntax, structured effort scales/ranges, comma handling, bare-number policy, I2, storage/native/DB/Edge verification remain deferred. D1/I1 stay partial; independent spec re-review and subsequent quality review remain pending. No commits, installs, live model/DB calls, secrets, reset, migration, deployment or guard bypass; prior edits preserved.

## Quality-review R1 attached-delimiter repair and harness visibility (still partial D1 / partial I1)

Quality review reproduced four unsupported-unit attempts (`Bench 100 g:8 shoulder pain`, `Bench 100 grams=8 shoulder pain`, `Bench 100 widgets:-8 shoulder pain?`, `Bench 100 widgets=+8 no pain`) that still fabricated 0 lb × 100. The prior whitespace-required label grammar swallowed attached colon/equal boundaries. Fixed that lexical rule **before** bodyweight fallback eligibility: colon/equal ends an apparent unit label independently of whitespace, while optional x/× and independently spaced signs precede the second numeric attempt. Label tokens cannot consume colon/equal. This is conservative validation, not new accepted weight syntax, a unit denylist, or an NLP claim. Positive literal annotation labels (`RPE:9`, `RIR=2`, `unknown 2`, pain/fatigue), explicit note delimiters, custom/bodyweight movements, narrative and intentional mode compatibility remain covered.

`lib/__tests__/attachedUnitDelimiters.test.ts` adds real-parser/actual-route cross-products: four arbitrary single/multiword unit labels × six attached/spaced colon/equal boundaries × three separator alternatives × five unsigned/attached/spaced sign alternatives × two symptom/disclosure tails. The four exact reviewer failures additionally execute in empty/prior-row contexts and as route-first regressions. Rejection asserts unchanged composer/prior rows, no invented parser rows, exactly one clarification, and no chat/log/skeleton/rest/PR/end calls. Annotation controls assert exact captured notes and new identity/payload after a completed set.

Harness verification was tightened separately, failure-first: `lib/__tests__/inSessionHarness.ts` now supplies an explicit async `saveWorkoutChatQA` double with captured question/answer/timestamp. Unexpected caught route diagnostics are surfaced as a rejected harness invocation instead of silently discarded. Only the exact deliberate offline provider-error object is exempt by identity; arbitrary errors with the same message are not suppressed. The successful-answer fixture verifies one storage call, the exact bubble, no warning/error (thus no hidden catch), balanced loading, and no set effects. A caught-error fixture verifies the original unexpected error reaches the caller; the intentional provider fixture remains observable and does not break preexisting question tests. Compilation caching was optional and deliberately not added to keep this repair narrow and per-invocation state isolated. No production HomeScreen change in this follow-up.

Strict vertical TDD receipts (repository root):
- `node --test --test-reporter=tap --test-name-pattern='successful actual-route answer' lib/__tests__/inSessionHarness.test.ts`: RED **0 pass / 1 fail** (bubble existed but no storage call; swallowed ReferenceError), GREEN **1 pass / 0 fail** after storage double.
- `node --test --test-reporter=tap --test-name-pattern='unexpected errors|deliberate offline|successful actual-route answer' lib/__tests__/inSessionHarness.test.ts`: RED **2 pass / 1 fail** (missing expected rejection). After diagnostic visibility, unfiltered harness file GREEN **164 pass / 0 fail**; intentional provider fixtures retained.
- `node --test --test-reporter=tap lib/__tests__/attachedUnitDelimiters.test.ts`: parser/matrix RED **702 pass / 56 fail** (`fast` instead of validation).
- Added separate route-first exact reviewer cases before production fix; `--test-name-pattern='actual-route R1'` RED **0 pass / 4 fail**, actual appended 0 lb × 100 rows observed. No fixture was changed to hide a failure.
- After minimal lexical change, six-file targeted parser/actual-route command (`attachedUnitDelimiters`, `bodyweightAmbiguity`, `grammarBoundaries`, `inSessionHarness`, `structuredGateIntegrity`, `structuredRouting` `.test.ts` files): **2191 pass / 0 fail**, no skips, exit 0.
- Full retained `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **2906 pass / 0 fail**, no skips, exit 0. Existing module-type/react-test-renderer warnings and intentional error-fixture diagnostics remain; not warning-free.
- Standalone reviewer-input scratch repro `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-r1-reviewer-repro.mts`: **9 scenarios / 9 pass / 0 fail**, including all four exact inputs in both contexts and successful-answer storage/no-catch verification. Unmodified prior probes also pass: `ck-final-adversarial.mts` **10 / 0 failures**, `ck-independent-spec.mts` **64 pass / 0 fail**, `coach-kettle-structural-independent.ts` **345 checks / 0 failures**. These reruns are execution evidence, not independent approval.
- `npm run lint`: exit 0. Direct `npx tsc --noEmit`: exit 0, no guard bypass. `git diff --check`: exit 0. App tsconfig excludes tests/Edge functions; those are not claimed typechecked.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-r1-{harness-red1,harness-green1,harness-red2,harness-green2,delimiter-red,route-red,targeted,full,lint,reviewer-repro,graph}.log`.

Graph pre-edit: ambiguous parser query UNKNOWN was resolved by file-qualified impact to **LOW / 4 symbols**, direct callers `sendMessage`/dev parser tests, one process group/two modules. `runWorkoutRoute` is UNKNOWN/not indexed; source fallback identified its five regression-file callers (including this new matrix) and inspected the actual answer/catch closure. Existing aggregate **HIGH** was warned before edits. Final `detect-changes --scope all --repo . --limit 200`: **HIGH / 4 tracked files / 18 range-attributed symbols / 8 flows**, including preserved route/CLAUDE changes, still displays only 15 symbols (`... and 3 more`). New/untracked harness/tests/docs remain outside complete stale-graph coverage; no clean/all-clear claim.

D1/I1 remain partial. The prior spec PASS did not cover these quality failures; parent must rerun independent spec regression gate then quality re-review. I2 was not begun. No installs, commits, resets, secrets, live provider/DB calls, migrations, deployments, policy-guard workaround, native or actual storage persistence verification. Prior edits and fixtures preserved.

Remaining/limitations: D01–D10 are unresolved product policies. Structured effort scales, comma skeleton grammar/overflow, revised bare-number policy and broader D1 clock/storage/deferred-response harness remain deferred. I2 planned/performed reps mismatch, last-placeholder selection, warmup identity/resequencing and filled-row live sync are not repaired; only the note-only swallowing needed for literal disclosure preservation was narrowed. Multi-set/superset/dropset metadata is not claimed lossless. No simulator/device, actual local storage readback, PostgreSQL, Edge verification, deployment or clinical safety claims. Next gate: independent spec review, then quality review; next implementation scope must address remaining I1 policy/grammar and I2 explicitly, without assuming full I1 completion.

## I2 local implementation — pending independent spec then quality review

**Prior bounded slice:** parent handoff reports D1/I1 input-integrity repair independently **SPEC PASS / QUALITY APPROVED** (2906 lib tests, lint/typecheck/diff and 9 +15 extra probes green). That is bounded approval, not completion of D1/I1: whole tasks stay **partial**. I2 was subsequently authorized and is **implementation_pending_review**, not independently approved or release-ready.

### Integrated behavior
- Additive optional `performance`, `plannedTarget`, `setKind` separate performance from transport status. Generated templates have **empty actual reps/load**, targets separately. First eligible normalized-exercise placeholder keeps its ID; explicit reps/load replace both together, preserving targets and literal disclosures. Completed identities, syncing ghosts, rest/cardio rows are not placeholders.
- Load-only routine shorthand/batch input stages load; it never claims target reps as performed. Actual pair/subsequently entered actual reps completes the row. Known legacy blank templates migrate conservatively during fills/inline/modal edits; legacy nonblank logged rows remain compatible. Explicit zero is known load, not absence; card no longer says zero is not-set.
- Composer fills and appends share one changed-row effect function: each performed changed row logs once; existing last-non-cardio rest rule runs once per submit. Planned updates produce no live log/PR/rest/review/completed history. This is not cross-submit network idempotency.
- Explicit standalone/prefix/complete-terminal multi-pair warmup markers preserve classification; prefix marker is removed from exercise label. Standalone warmup creates its own row rather than consuming work. `after warmup` prose remains work notes. Classification survives resequencing, edits and row actions; no legacy set0/notes-based inference. Existing local warmup display0 retained, not approved broad numbering/PR/rest/backoff policy.
- Shared performed selector is wired to actual End button count, End/review, coaching snapshot, composer live sync and WorkoutCard label. Stored rows preserve ID/set/performance/kind/target. Actual storage JSON serialization/readback/retry is tested with in-memory AsyncStorage/API doubles, not native/real DB. Client review/log captures retain metadata; server recognition remains unverified.

### Strict TDD receipts
Command: `node --test --test-reporter=tap lib/__tests__/performedSets.test.ts` in repository root. Logs in `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-i2-*.log`.

| RED slice | Actual pass / fail | Evidence / subsequent check |
| --- | --- | --- |
| First eligible ID + actual reps/load | 0 /1 | First stayed blank; green1 1/0 |
| Template state + End exclusion | 1 /2 | End reviewed/saved blank templates; green2 3/0 |
| Standalone/prefix/multi warmup + ordinary prose kind | 3 /4 | Missing identity, exercise polluted; green3 7/0 |
| Shorthand effects + zero + End serialization | 7 /5 | Missing fill log/rest and saved ID; green4 12/0 |
| Inline/modal state + card wiring | 12 /3 | Incorrect state/missing planned label; green5 15/0 |
| Coaching/incomplete/drop classification | 17 /3 | Targets in snapshot, incomplete counted, drop relabeled work |
| Review metadata (red7) | 19 /1 | Review lost kind |
| Live metadata (red8) | 19 /1 | Log payload lost kind |
| Same from prescribed targets (red9) | 23 /1 | Target logged as actual; green9 24/0 |
| Truly separate targets / load-only staging (red10) | 24 /4 | Target10 still copied to actual10 |
| Legacy inline + card target/zero (red11) | 27 /3 | Load edit invented reps, target/zero hidden |
| Legacy modal load-only (red12) | 30 /1 | Untouched target reps counted |
| Ghost/performed first-eligible exclusions (red13) | 31 /2 | Explicit/shorthand filled ghost |

All behavior is green in final commands below. This task's initial new compatibility tests treated load-only input as target completion; later RED target-separation checks exposed the contradiction, and **this task's new fixtures** were corrected to staged semantics. No preexisting test/expectation was changed or removed. RED6 initially had an AsyncStorage default-module-shape fixture error; fixed before red6-final 17/3 behavioral failures. Drop array assertions initially hit VM realm prototype differences despite equal values; now outer-realm Array.from retains identical expected values. Those are reported fixture issues, not hidden passes.

### Final verification after last production edit
- New I2 file: **34 regression tests**, real parser/actual extracted send/End/inline/modal closures, rules, actual JSX WorkoutCard function with native/hook doubles, row-action hook with React state doubles, and real storage serializer with in-memory storage/API doubles. No mounted/native claims.
- `node --test --test-reporter=tap lib/__tests__/performedSets.test.ts lib/__tests__/programTemplates.test.ts lib/__tests__/programFormat.test.ts`: **51 pass /0 fail /0 skipped**, exit0 (`ck-i2-targeted-final.log`).
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **2940 pass /0 fail /0 skipped**, exit0 (`ck-i2-full-final.log`). Existing module/react-renderer warnings and deliberate offline diagnostics remain; not warning-free.
- Retained six-file first-slice integrity/route suite: **2191 pass /0 fail /0 skipped**, exit0 (`ck-i2-prior-slice.log`), all also in final full suite.
- `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: explicit exit0 (`ck-i2-{lint,typecheck,diffcheck}-final.log`). App tsc excludes tests/Edge functions; no claim they were typechecked, no bypass.

### Graph / scope
Pre-edit resequenceSets **CRITICAL /23 symbols /14 flows**, applyPendingEdit **CRITICAL /13 /11**, storage save **HIGH /7 /4**, template expansion **HIGH /3 /3**. Reviewed HomeScreen inline/modal/delete/duplicate/reorder, hook actions/cell edits and storage save/retry callers. Named send/End/Card impacts LOW; new selector/harness/API-row type UNKNOWN/not indexed, supplemented by source inspection, not all-clear. Skeleton helper deletion was covered by pre-edit sendMessage closure inspection; its separate symbol impact was obtained afterward (LOW/1 caller), a graph-ordering limitation. Final aggregate graph rerun remains **CRITICAL /9 tracked files /31 range-attributed symbols /27 flows**, including preserved preceding route/parser/CLAUDE changes. --limit200 still displays only15 symbols/10 flows; new untracked helper/tests/docs are not fully indexed. No clean graph verdict or commit.

Production changed: types/workout.ts; lib/performedSets.ts (new); lib/workoutRules.ts; lib/structuredGate.ts; app/(tabs)/index.tsx; components/workout/WorkoutCard.tsx; lib/workoutStorage.ts; lib/api.ts (additive type metadata only). Tests: lib/__tests__/performedSets.test.ts and workoutIdentityHarness.ts (new), inSessionHarness.ts (real selector dependencies). Docs: doc.md, plan index/input/decisions/tasks. Original CLAUDE changes and all preceding source/tests/docs retained.

### Remaining / exact next review contract
1. Parent independently reviews **I2 spec first, quality second** before advancing. Exercise first eligible ID/185x8 vs target10; empty/partial/staged load-only completion; conservative legacy migration; explicit zero; standalone/prefix/multi/prose warmup; edits/resequence/actions/serialization; exact once-per-submit actual log/rest and absent planned effects. Inspect actual wiring/payloads, rerun retained I1/full/targeted/lint/typecheck/diff. This implementation's self-verification is not reviewer approval.
2. Source workout_log schema/live/history insert mappings omit kind/target/performance and may remap set0. Workout JSON may retain extra fields, but no real DB/deployed roundtrip is verified. Client captures/local readback are not a server guarantee. **I3/H1** must align authenticated Edge/SQL/history/PR exclusions; warmup contamination remains. No live SQL/deploy here.
3. Composer effects unified; inline/modal state edits are included in End/local serialization, not newly live-synced. Live edit/delete reconciliation, rendered callback replay and idempotency remain **P4**. End/late-answer fences and cardio final serialization remain P2/P3. Cardio parser/live behavior preserved; cardio persistence defect not claimed fixed.
4. D01–D10 remain unresolved broader product policies. No clinical stop/effort/progression thresholds, backoff policy or new rest/PR eligibility invented. Explicit warmups remain performed rows; existing rest behavior retained. Dormant useCellEditing/useCoachLogic helpers remain unchanged; actual HomeScreen owns exercised paths. Native process death/gestures/device/storage, Edge/PostgreSQL/provider/release verification unclaimed. No installs/commits/reset/stash/secrets/live DB/provider/migrations/deployment/production/payment changes.

## I2 spec-review repair — pending independent spec then quality re-review

The independent I2 SPEC FAIL identified three genuine production-path gaps. This follow-up preserves all preceding source changes and test expectations; it does not change API/DB contracts, PR eligibility policy, resequencing rules, or deployment state.

- **Performed-only history sources:** `decideAndParse` uses the actual shared performed selector for repeat and dependent history shorthand. Syncing ghosts, planned/load-only and malformed numeric rows are excluded. Session rows are authoritative over a last-exercise hint that may name a ghost. The last eligible strength row is used; without one, repeat/history inference clarifies locally, retains the composer and causes no AI/log/rest/PR/End effects. Existing routine skeleton load-only staging remains intact. Shared strength eligibility now requires finite non-negative numeric load and whole safe-integer reps; valid legacy numeric rows and explicit zero remain eligible, with no newly invented bounds or server numeric contract.
- **Incomplete AI results:** the real `buildRowsFromApi` keeps missing reps empty and marks incomplete rows planned/pending rather than performed. AI rows now use the same performed-only composer effect function as fast/fill, with one log per complete changed row and at most one existing rest effect per submission. Ghost replacement, loading cleanup and editable UI rows remain intact; End/review excludes the same incomplete rows. No target reps are synthesized.
- **Repeat classification:** explicit source `setKind` survives parser duplication and both fill/append mappings. `Bench 95 10 warmup` then `same` stays two warmup rows with distinct IDs, source identity unchanged and existing display set0 retained through resequence/live/End/local JSON readback. Explicit work with `after warmup` notes remains work. Drop/superset/backoff source classification is preserved rather than relabeled; no new backoff behavior is introduced.

### Real-path regression evidence

Added `lib/__tests__/i2SpecRepairs.test.ts`: **39 new regressions**. The route harness now executes the actual API builder, actual `toApiRows`, and real ID/last-exercise/next-set helpers, instead of clean-row and row-count stubs. It captures intermediate row transitions to verify ghost/loading lifecycle. The closure extractor now handles actual function declarations as well as variable closures. The embedded parser test supplies its new real selector dependency; no existing expectation was changed. `tsconfig.json` enables `allowImportingTsExtensions` for the shared parser's explicit `.ts` import, allowing the same implementation to run under Node's native TS tests while remaining typechecked by app tsc; no error suppression, install or alternate typecheck runner was used.

Strict vertical TDD, from repository root with `node --test --test-reporter=tap lib/__tests__/i2SpecRepairs.test.ts`:

| Slice | RED pass/fail | GREEN evidence |
| --- | --- | --- |
| Ghost-only repeat | 0/1 | 1/0; RED appended committed performed `...` × `...` |
| Dependent shorthand and invalid history | 6/18 | 167/0 including retained performed/parser tests |
| Explicit repeat classification | 25/4 | 63/0 including retained performed tests |
| Actual AI builder + actual composer effects | 29/3 | 230/0 including retained performed/route tests |

Intermediate verification issues were fixture-only: adding a real parser dependency initially exposed the embedded VM's missing `require`; supplying the actual selector resolved it without changing expectations. Warmup source comparison encountered equal values with VM-realm prototypes; the expected source is now outer-realm `structuredClone`. Neither is counted as a successful behavioral RED. Subsequent controls cover incomplete AI rows first/last, empty-session/all-incomplete/mixed responses, custom fill+append sets1/2 with actual8/6 vs target10 and two logs/one rest, zero/legacy shorthand, End exclusion, pending completion with stable ID, explicit classification and actual local serializer readback with in-memory storage/API doubles.

Final receipts:
- `node --test --test-reporter=tap lib/__tests__/i2SpecRepairs.test.ts lib/__tests__/performedSets.test.ts lib/__tests__/programTemplates.test.ts lib/__tests__/programFormat.test.ts`: **90 pass /0 fail /0 skipped**, exit0.
- `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **2979 pass /0 fail /0 skipped**, exit0.
- Retained six-file first-slice route/integrity suite (`attachedUnitDelimiters`, `bodyweightAmbiguity`, `grammarBoundaries`, `inSessionHarness`, `structuredGateIntegrity`, `structuredRouting`): **2191 pass /0 fail /0 skipped**, exit0.
- `npm run lint`: exit0. Direct `npx tsc --noEmit`: executed and returned exit0 in this follow-up; the earlier guard denial was not bypassed. `git diff --check`: exit0. Tests/Edge files remain excluded from app tsc.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-i2-repair-{red1,green1,red2,green2-final,red3,green3-final,red4,green4,targeted-final,full-final,prior-slice,lint,graph,graph-rerun}.log`. Direct app tsc has an exit0 tool receipt, not a saved log. Existing module/react-renderer warnings and deliberate fixture diagnostics remain; not warning-free. The shell's actual TMPDIR unexpectedly differed from the stated runtime scratch path: initial raw receipts landed in macOS temporary storage. All 18 original repair logs were moved unchanged into the authorized scratch path (no existing destination overwritten), and TMPDIR was corrected for subsequent commands.

Graph: file-qualified parser impact LOW/4; builder LOW/1 caller (sendMessage); sendMessage LOW/no indexed upstream callers. Resequence remains **CRITICAL/23 symbols/14 flows** and was warned before production edits; its implementation was not changed in this follow-up. Selector/harness symbols are UNKNOWN/not indexed, not all-clear; source fallback inspected selector consumers (End, coaching, live, card), full affected composer/End/edit/action closures, storage serializer and row-action hook. A type-only selector parameter narrowing preceded its separate UNKNOWN query; behavioral numeric changes followed that query and caller inspection. Aggregate `node .gitnexus/run.cjs detect-changes --scope all --repo . --limit 200` and rerun both report **CRITICAL/10 tracked files/35 symbols/27 flows**, including all earlier preserved changes. Presentation still truncates at15 symbols/10 flows; untracked helpers/tests/docs are not fully indexed. Manual caller review supplements but does not make this a clean graph verdict.

I2 remains **implementation_pending_review**: parent must run independent spec re-review, then quality review. Native UI/storage, real provider/DB/Edge roundtrip, replay/idempotency and server warmup/PR/history exclusions remain unverified/deferred exactly as above. No commits, installs, secrets, resets, live provider/DB calls, migrations or deployment.

## I2 quality R1 repair — pending independent spec regression then quality re-review

The parent reports I2 SPEC PASS followed by QUALITY REQUEST R1. The real AI builder produces `performance: planned`, no target, blank load and **actual reps8**. Both edit paths previously treated pending-without-target as legacy evidence, cleared actual8 and fabricated target8. This follow-up changes only the inline/modal state transition and its shared helper/harness, preserving all prior tests and production work.

- `isLegacyPlannedTemplate` requires **absent performance metadata**, absent target and an eligible blank-load legacy shape. Explicit new pending metadata is not legacy evidence. Ambiguous metadata-free blank-load reps remain conservatively prescribed; no historical provenance can be recovered beyond that shape.
- `resolveEditedPerformance` is actually wired to inline load/reps edits and modal saves. New actual8 plus entered185 (or explicit0) retains ID/actual8, fabricates no target, and becomes performed. Legacy target10 remains staged after load-only edit until actual8 is supplied; target10 remains independent. State eligibility uses the existing numeric performed selector, not nonblank truthiness. Invalid load text remains editable/planned and cannot enter End; rejection/ranges/permissive reps parsing remain I3, not implemented here.
- `lib/__tests__/i2QualityRepairs.test.ts` adds **10 durable integrated regressions**: actual route/API builder, both real extracted edit handlers, End payload and actual local history serializer/readback; real draft JSON save/reload before zero-load completion; legacy load-only then actual completion; explicit target10/actual8; invalid edits. In-memory AsyncStorage/API and hook doubles are offline evidence, not mounted/native/DB verification. Prior-state integrity and stable IDs are asserted.

Strict vertical TDD receipts (`node --test --test-reporter=tap lib/__tests__/i2QualityRepairs.test.ts`): inline RED **0 pass/1 fail** (`actual reps '' instead of8`), GREEN **1/0**; modal RED **1/1** (same lost actual8), GREEN including retained performed tests **36/0**; invalid-state RED **2/2** (`performed` instead of `planned`), GREEN **4/0**. The shared helper initially introduced selector validation ahead of its own failing slice; it was removed, then invalid regressions were run RED before restoring it. Compatibility/draft controls were then added and passed without further production changes. A nonunique test patch was refused without modifying the file; a briefly unfinished loop edit was completed before execution. No harness exception is counted as behavioral RED and no existing expectation was changed.

Final receipts from repo root:
- Five-file I2 suite (`i2QualityRepairs`, `i2SpecRepairs`, `performedSets`, `programTemplates`, `programFormat`): **100 pass/0 fail/0 skipped**, exit0 (`ck-i2-quality-targeted.log`).
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **2989 pass/0 fail/0 skipped**, exit0 (`ck-i2-quality-full.log`).
- Retained six-file first-slice integrity/route suite: **2191 pass/0 fail/0 skipped**, exit0 (`ck-i2-quality-prior-slice.log`).
- Original unmodified `ck-i2-quality-repro.mts`: **2 pass/0 fail**, exit0 (parent's original RED was0/2). Other unmodified probes: final-adversarial **10 checks/0 failures**, structural-independent **345 checks/0 failures**, R1 reviewer repro **9 pass/0 fail**, all exit0.
- **One retained old probe is not green:** `ck-independent-spec.mts` returns **63 pass/1 fail**, exit1. Its line29 requires the obsolete clean-row harness ID `parsed`; the previous I2 spec-repair harness now executes the real builder generating a fresh client ID. This task changes neither builder nor that route harness; the old independent probe is left unchanged. Durable current-builder regressions pass. Parent must inspect/revalidate this stale fixture; no independent all-green claim.
- `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: exit0. App tsc excludes tests/Edge; no claim those were typechecked. Node module/react-renderer warnings and deliberate offline diagnostics remain. New test harness LSP reported missing Node typings; no dependency install or suppression.
- Raw logs remain under `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-i2-quality-{red1,green1,red2,green2,red3,green3,targeted,full,prior-slice,lint,typecheck,graph,graph-rerun}.log`; probe logs use `ck-i2-quality-probe-<original-filename>.log`.

Graph: pre-edit file-qualified `applyPendingEdit` **CRITICAL/13 symbols/11 flows** was warned; direct callers beginCellEdit, commitCellEdit, withPendingRows, commitPendingAndGet lead into send/End/clear/start/actions/coaching/modal. Modal handleSaveSet indexed LOW/no upstream; actual JSX onSave and helper callers manually inspected. New selector/harness UNKNOWN/not indexed. Source fallback inspected inline/modal/pending callers, real builder, End, draft/history serializers and existing regressions. Both aggregate graph runs report **CRITICAL/10 tracked files/34 range-attributed symbols/27 flows**, including prior edits. Presentation truncates at15 symbols/10 flows despite limit200; new untracked helper/tests/docs lack full stale-graph coverage. Not an all-clear.

Changed this follow-up: `app/(tabs)/index.tsx`, `lib/performedSets.ts`, `lib/__tests__/workoutIdentityHarness.ts`, new `lib/__tests__/i2QualityRepairs.test.ts`, this report and I2 planning progress/defaults. **I2 remains implementation_pending_review:** independent spec regression gate, then quality re-review. No new live edit sync/replay/idempotency (P4), cardio final persistence (P3), server/SQL/PR/history contract (I3/H1), native persistence or deployment claims. No commits, reset, installs, secrets, live provider/DB calls, migrations, deployments or approval/guard bypass.

## I2 composer provenance quality repair — pending independent spec then quality

Composer single/batch shorthand and named fast fills bypassed the shared edit transition. They inferred a prescription from any pending row, losing actual AI reps8 on load-only185 and fabricating target8 on named185×6. Both production fill sites now call the existing `resolveEditedPerformance`: shorthand passes whether reps were actually entered; named parsed sets pass explicit actual reps. Inline/modal and composer use the same metadata-free legacy distinction and numeric performed eligibility. No selector/parser/builder behavior changed in this follow-up.

Semantics: explicit AI pending actual8 plus185 or0 retains ID/actual8, becomes performed and has no invented target; entered actual6 replaces8 without turning8 into a target. Genuine target10 remains10 independently of actual8/6. Only eligible metadata-free blank-load legacy templates migrate ambiguous reps into a target; load-only leaves actual reps blank/planned until explicit completion. Mixed batch completes actual rows without performing the legacy template. AI completion remains append-only using the real builder's explicit performance metadata and performed-only live effects, not a fill transition.

Strict vertical TDD command `node --test --test-reporter=tap lib/__tests__/i2QualityRepairs.test.ts`:
- Single load-only RED **10 pass/1 fail**, missing performed log after actual8 was lost; shared single/batch transition GREEN **11/0**.
- Named completion RED **11/1**, actual6 present but fabricated target8; shared named transition GREEN **12/0**.
- Added compatibility matrix without further production edits: empty/current session, zero, shorthand explicit actual replacement, comma batch, named superset multi-fill, genuine target10, metadata-free legacy load-only then completion, mixed actual/legacy/target batch. AI provenance cases execute the actual response builder; all exercise the extracted composer, actual End closure and local history serializer/readback; original inline/modal/draft tests remain. **19 new composer cases**, **29 quality cases total**.
- First compatibility run was **18/11**, not behavioral RED: two fixtures used unsupported interleaved labels (parsed as a single set with literal notes), nine failed equal nested target objects from VM-realm JSON serialization. Corrected to existing supported `Bench and Squat superset 185 6 0 8` grammar and outer-realm structuredClone at the storage assertion boundary. No production change or relaxed value expectation for these fixture corrections; raw log retained.
- Helper refinement passes the entire route output into End/local serialization, including unchanged prior performed rows and incomplete legacy rows, rather than prefiltering fixtures. Live effects check only changed rows; final save verifies exact eligible counts, IDs/actuals/targets, prior-state integrity and one rest effect.

Final execution receipts (repo root):
- Five-file I2 suite (`i2QualityRepairs`, `i2SpecRepairs`, `performedSets`, `programTemplates`, `programFormat`): **119 pass/0 fail/0 skipped**, exit0.
- Full `node --test --test-reporter=tap "lib/__tests__/*.test.ts"`: **3008 pass/0 fail/0 skipped**, exit0.
- Retained six-file first-slice integrity/route suite: **2191 pass/0 fail/0 skipped**, exit0.
- `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: exit0. Typecheck was permitted on this run; no bypass of the earlier guard denial. App tsc excludes tests/Edge. Existing Node module/react-renderer warnings and intentional offline diagnostics remain; test LSP lacks Node types, no install/suppression attempted.
- Logs: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/ck-i2-composer-{red1,green1,red2,green2,controls,targeted,targeted-final,full,full-final,prior-slice,lint,graph,graph-rerun}.log`. Direct typecheck has the exit0 tool receipt, not a saved log. Historical independent probe status above is not revalidated or changed by this follow-up.

Graph/caller audit: sendMessage file-qualified impact LOW/no indexed upstream callers; shared resolver UNKNOWN/not indexed. Pending edit flow remains **CRITICAL/13 symbols/11 flows**, warned before production edits. Source fallback inspected all composer fills, response builder, inline/modal callers, target creation/import, parser pending selectors, performed effects, End and local/draft serialization. Repository target search confirms ambiguous target migration exists only in the shared resolver; routine targets come from genuine prescription metadata. Both aggregate graph runs report **CRITICAL/10 tracked files/34 range-attributed symbols/27 flows**, including earlier preserved edits; presentation still truncates15 symbols/10 flows despite limit200. New untracked files/helpers are not fully represented by the stale index. This is not an all-clear.

Changed this follow-up: `app/(tabs)/index.tsx`, `lib/__tests__/inSessionHarness.ts`, `lib/__tests__/i2QualityRepairs.test.ts`, `doc.md` and I2 plan progress. Existing helper and inline/modal fixes unchanged. **I2 remains implementation_pending_review**; parent independent spec regression then quality re-review required. No mounted/native storage, real provider/DB/Edge, server warmup/PR/history, replay/idempotency, I3/H1/P3/P4 or deployment claim. No installs, commits, resets, secrets, live provider/DB calls, migrations, deployments or guard bypass.

## P1 draft recovery integrity — implementation pending independent review

Latest parent handoff subsequently reports **bounded I2 local SPEC PASS / QUALITY APPROVED**, with119 targeted /3008 full /26 matrix at that gate; prior bounded D1/I1 approval remains valid, whole D1/I1 remain partial. Neither approval certifies native/server persistence or completes downstream work.

Implemented integrated F2/F8/F9 and proven local ordering fixes: serialized real draft helper operations; clear-invalidated scheduled generations bound to session ID; immediate empty active snapshots/cancelled debounce for clear/delete; latest-row background save; overnight/uncertain legacy preservation with original ID/date/title; editable incomplete interrupted parse recovery retaining exact original input when available; all Start/import restore gates and unmount/read-clear fences; visible sanitized storage failures/malformed-data preservation. Existing v1 key/model retained, no TTL/new schema/recovery picker or automatic provider replay. P2 End/save and late live AI responses remain out of scope.

Strict vertical TDD and complete caller/race receipts: [P1 local evidence](docs/plans/in-session-reliability/evidence/p1-draft-integrity-local.md). Final **28 P1 tests /53 P1+schedule /119 retained I2 /2191 retained first-slice /3036 full**, all pass/no skips; lint/direct app tsc/diff exit0. Original scratch I2 matrix remains unchanged **29 checks /1 missing delete-boundary fixture dependency**; separate assertion-preserving adapted matrix **30/0**. That file has30 checks, not the26 handoff matrix; no original all-green claim. Graph remains **CRITICAL/12 tracked files/52 symbols/27 flows**, stale/truncated and incomplete for untracked code/docs. No native/provider/DB/Edge/deployment/production/payment changes or verification. See evidence for failures, limitations and exact next contract: **P1 independent SPEC then QUALITY before advance**.

## P1 quality R1/R2 repairs — pending independent spec regression then quality re-review

Parent reports P1 SPEC PASS followed by QUALITY REQUIRED. Both defects reproduced in actual local production paths and repaired without changing explicit cleanup or prior work:
- **R1 HIGH:** inactive was not empty: real midnight interval/foreground checks deleted a pending/read-failed/malformed recovery draft. HomeScreen now supplies `draftChecked` as the session hook's recovery-resolution gate, and its automatic reset callback independently refuses cleanup until resolution. Deferred valid restore crossing midnight retains exact raw storage, original ID/date/createdAt/title/rows; Start remains blocked from replacing recovery. Resolved no-draft rollover/new-session behavior remains valid.
- **R2 MEDIUM:** every known optional LogRow field is validated before restore, including nested target primitives, enum/classification/transport/performance states, boolean flags, input evidence and finite cardio quantities/units. Missing legacy metadata, zero/bodyweight, valid targets/cardio and unknown additional fields stay intact. Corrupt known fields reject the whole read, retain raw bytes, keep restoration/Start unresolved and show existing sanitized notices. Actual WorkoutCard JSX through React's real child renderer reproduces the original object-child crash; rejected data never reaches recovered card rows. No new numeric ranges, TTL, normalization or destructive migration.

Strict vertical TDD command: `node --test lib/__tests__/workoutDraftLifecycle.test.ts`. Hook/storage/route midnight RED **28/3** then GREEN **31/0**; route defense RED **32/1** then **33/0**; nested-target/React-child RED **33/1** then **34/0**; remaining metadata matrix RED **49/70** then **119/0**. Final **119 P1 /144 P1+schedule /119 retained I2 /2191 retained input /3127 full**, all pass/0 fail/0 skips. `npm run lint`, direct `npx tsc --noEmit`, `git diff --check`: exit0. Tests/Edge excluded from app tsc; existing Node/react-renderer warnings remain. New test editor typings warnings not suppressed or installed away. Exact commands, raw scratch logs, harness corrections and behavior-vs-generated-case counts: [P1 quality local evidence](docs/plans/in-session-reliability/evidence/p1-quality-repairs-local.md).

Pre-edit clear impact **HIGH/6 symbols/3 flows**, warned; hook/getDraft LOW; new validator UNKNOWN/not indexed, source caller fallback performed. Both aggregate runs **CRITICAL/12 tracked files/55 range-attributed symbols/27 flows** include preceding edits; stale index/truncated presentation/untracked coverage remain unresolved, not an all-clear. Changed production: `hooks/useWorkoutSession.ts`, `app/(tabs)/index.tsx`, `lib/workoutDraft.ts`; expanded existing `workoutDraftLifecycle.test.ts`; this report, P1 plan progress and new quality evidence. No Card/type/API/DB changes required. Historical original/adapted matrix receipts unchanged/not rerun. **P1 stays implementation_pending_review**; independent spec regression then quality re-review before advance. P2 active late-AI/End/save ownership remains outside scope; no native/provider/DB/Edge/release verification, installs, commits, resets, secrets, live calls or deployment.



