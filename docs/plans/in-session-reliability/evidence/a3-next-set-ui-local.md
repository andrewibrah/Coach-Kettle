# A3 mounted in-session next-set decision UI: local evidence

Baseline: HEAD `6772246` (V1). Everything here is uncommitted and local only. There is no migration, no Edge change and no deploy. The feature is **inert as shipped**:
- `COACHING_POLICY.adaptiveNextSet` is `false`;
- `NEXT_SET_POLICY` is `null` (A2), so even with the flag on, every decision is `unavailable / policy_unapproved`.

**Device verification (V2) is mandatory and is not claimed.** These are offline executions of the real route code and the real component, not a mounted React Native session.

## Reproduced (RED at HEAD)

- `NextSetSuggestionPill` had no HomeScreen mount. Its fetch was keyed on the exercise name only.
- `app/program/day.tsx` sent a `'decision'` result to `Suggest: loading…` forever. RED actual: `' Bench Press 3×8–8  · 90s rest Suggest: loading…'`.
- `api.chat` and `api.askCoach` could not carry `nextSetDecision`. RED: the request body lacked the field.
- A1 answers bind to the last row's exercise, so after a reorder they attach to whatever is last (Q12/Q13 note).

## Binding rule (documented in `index.tsx` above `trackNextSet`; repaired after SPEC review)

The pill binds to the exercise of the **performed strength set with the latest `timestamp`**. Ties go to the later row. A non-finite timestamp ranks lowest, so it never beats a finite one (R7 pins the tie order and R8 the non-finite rule; the ties-first mutant fails R7).

This uses durable row data, so it survives a reload or a draft restore. The SPEC version kept "last touched" in a ref that reset on mount, so after a reload it bound by position (PROBE1).

What moves `timestamp`, and so the binding:
- Composer adds and fills of planned sets stamp `Date.now()`, and so do duplicates. These rebind.
- Reorders keep `timestamp`, so they never rebind.
- Cell edits keep `timestamp` too, so editing an older set does not rebind. This is a known limit.

Fallbacks, in order: the first planned set's exercise, then the last row's (the HEAD/A1 rule).

- One normalizer, `normalizeExercise`, is used for the binding, the row filter and `evidence.exerciseKey`. The evidence carries only the bound exercise's sets (R6).
- With the flag on, A1 answers bind to the same key. With the flag off, A1 keeps its HEAD binding.

## Behaviour (flag on only)

**One pill**, mounted between the table and the questionnaire. Its heading is "Next set · <exercise>".

**Evidence**
- Performed sets for that exercise (`performedRows`, no cardio). The newest 100 are kept, which is the Edge transport bound.
- `currentAnswer` for this session and key.
- The target from the next planned row's `plannedTarget.reps` (`8` or `8-10`).
- `equipment: null`. LogRow records no equipment, and the Edge requires the key.
- `request = {sessionId, revision}`.

**Revision and refresh**
- The revision is monotonic. It bumps when a signature changes: session, policy version, answer-log length and last id, and every non-syncing row's id and content.
- Optimistic `syncing` rows do not count; their commit is the change.
- The refresh key is `session|exerciseKey|revision`. A 300 ms debounce coalesces batch fills into one request.

**Fences**
- Effect cancellation, plus an `isCurrent(revision)` check at arrival. That check also re-derives the signature from the synchronous `draftRowsRef`.
- A 15 s deadline turns a request that never settles into "Suggestions unavailable" with Retry.
- A response dropped as stale on arrival is never shown and never recorded for coach or chat. The pill moves straight to "Suggestions unavailable" with Retry. If the route re-renders with new evidence, its refresh replaces that state at once. If the rows reverted to the same signature, no refresh is coming and the user gets Retry rather than endless Loading. The SPEC version left Loading without a deadline (PROBE6).

**States:** loading ("Checking next set…"), unavailable/error with Retry, no_history, stop_or_clarify, clarify, stale (with Retry), and hold/increase/reduce.
- The decision line is the engine's own action, verbatim.
- Titles and reason codes are **placeholder copy until Q9** and are marked so in the source. The reason code is shown raw as a neutral label, with an evidence summary: "Based on N evidence items, including last session (date)".

**Use**
- Shown only for hold, increase or reduce when the action has a load and the exercise has a next planned row.
- It writes **only that row's `plannedTarget.weightLbs`**. Actual values stay empty, `performance` stays `planned`, nothing is queued live, and performed rows are never touched.
- The tap re-checks the flag, session, `busy`, any open cell edit and `isCurrent`. A stale tap is rejected with a toast.
- It does not go through `withPendingRows`, so a tap never cancels an in-flight coach or chat answer.

**Coach and chat**
- They get `currentNextSetDecision()` only for the current revision and only with 50 or fewer evidence ids. Above that it is omitted, not truncated.
- With the flag off, the call is the exact HEAD call. The existing `coachingContext` test pins chat to 4 arguments.

**Accessibility**
- Use and Retry have the button role and labels.
- The status text is a polite live region.
- No focus trap: the container is not `accessible`.

**Program day:** a `'decision'` result renders `decisionLabel`.

## SPEC repair receipts

The reviewer's findings were repaired TDD-first. `nextSetUi.test.ts` went from RED 22/24 to GREEN 24/24.

| Finding | Test | RED | Mutation proof |
|---|---|---|---|
| HIGH: stale drop left Loading forever when rows reverted before re-render | R1 | Reproduced: "Checking…" still shown after 60 s | Old drop (no state change) fails R1 |
| HIGH: malformed `stop_or_clarify`/`clarify`/`unavailable` decision carrying a load | R2 | Guard test, passed before | Removing both guards (pill `useLoad`/label and `applyNextSetLoad`) fails R2. The pill had previously shown no Use only because `onUseDecision` was absent. |
| MEDIUM: response lands before the re-render of changed rows | R3 | Guard test, passed before | Removing the arrival fence fails R1 and R3 |
| MEDIUM: binding by position after a reload | R4 | Reproduced: bound Bench instead of Squat | Position binding fails R4 |
| LOW: per-exercise evidence filter not pinned | R6 | Guard test, passed before | Dropping the filter fails R6 |

The earlier mutants (no debounce, no tap-time fence, syncing rows counted, Use writing the actual weight) are each still caught.

## Receipts (first submission)

`lib/__tests__/nextSetUi.test.ts`: RED 0/19 at HEAD, then GREEN 19/19, stable over 3 runs.
- Most REDs were the route symbols being absent.
- The two behavioural REDs (program day stuck on Loading, and api bodies) were confirmed by their assertion text.
- The flag-off and stop/clarify guards are guard tests, not behaviour REDs.

Mutation checks against the real route (each restored afterwards; 19/19 again):

| Mutation | Result |
|---|---|
| Remove the debounce | 1 fail (batch fill) |
| Remove the tap-time fence | 1 fail |
| Last-row binding | 2 fail |
| Count syncing rows | 1 fail |
| Use writes actual `weightLbs` | 1 fail |

Gates:
- After the repair: lib 3648/0, shared/next-set/chat/coach 203/0; `tsc`, `expo lint --max-warnings 0`, direct eslint and `git diff --check` all exit 0.
- First submission: `node --test "lib/__tests__/*.test.ts"`: 3643/0, including the H1 `nextSetBaseline` 12/12 unchanged.
- `node --test "supabase/functions/_shared/*.test.ts" supabase/functions/next-set/*.test.ts supabase/functions/chat/handler.test.ts supabase/functions/coach/*.test.ts`: 203/0.
- `npx tsc --noEmit`, `npx expo lint --max-warnings 0`, direct `npx eslint --max-warnings 0` on the touched files, and `git diff --check`: all exit 0.

GitNexus (re-indexed first) gave these upstream impacts:
- `HomeScreen`, `NextSetSuggestionPill`, `ProgramDayScreen` and `askCoach`: LOW, 0 callers. Routes and plain-object methods do not resolve in the index; grep shows `index.tsx` and `hooks/useCoachLogic.ts` (unchanged call) call `askCoach`.
- `chat`: UNKNOWN. Grep shows `index.tsx` is the only caller.
- `lastSessionLabel`: LOW, 2 callers.

None was HIGH or CRITICAL.

## Not claimed / open

- Any device behaviour: real React commit order, FlatList layout, VoiceOver/TalkBack focus, keyboard, timers under backgrounding (V2).
- Approved copy and thresholds (Q9), progression (Q1), and the skipped-pain policy (Q13). The decision is inert until `NEXT_SET_POLICY` exists.
- **Equipment is always `null`** (LogRow has no equipment). The engine's `lookup(table, null)` returns `undefined`, which has two exact consequences. The engine is unchanged:
  - **Increase is never returned.** Every progression path ends in `hold` with `no_increment_for_equipment`.
  - **Reduce loses its load.** The `decrementLbs` step is undefined, so the action has no `loadLbs`. It carries only the planned rep range, if there is one. The pill shows "Reduce" or "Reduce: N reps" with **no number and no Use**.
- **Use silently overwrites a program-seeded target load.** `plannedTarget.weightLbs` from a template or program is replaced with no confirmation. This is a known behaviour to confirm under Q9/Q14, and it is unchanged.
- WorkoutTable and WorkoutCard needed no change: the single pill sits outside the rows, and Use updates the existing "Target … at N lbs" line through `plannedTarget`.

## QUALITY review (orchestrator)

QUALITY APPROVED, with three LOWs accepted as is:
- **(1) Duplicated `['hold','increase','reduce']` in `applyNextSetLoad`:** deduping it would add a cross-module import to a function the tests extract from `index.tsx` by AST. That is harness churn for a three-item list.
- **(2) `(COACHING_POLICY.adaptiveNextSet as boolean) &&` in `coachingExerciseKey`:** this looks redundant but is load-bearing. Removing it broke 9 A1 integration tests, because that harness evaluates the expression without a `nextSet` binding. It was reverted and kept.
- **(3) `askCoach` parameter order:** reordering would touch the existing `clock` callers and tests.
