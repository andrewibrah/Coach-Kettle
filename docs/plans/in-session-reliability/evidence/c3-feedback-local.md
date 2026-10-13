# C3 visible errors, honest review and uniform rest effects: local evidence

Baseline: HEAD `80a039d` (C1). Lane A was written before HEAD moved and is uncommitted.

Scope:
- **Code:** `components/modals/CoachModal.tsx`, `app/(tabs)/index.tsx` (`submitCoachQuestion`, `logPerformedRows` in `sendMessage`, `handleEndWorkoutWithReview` call site), `lib/api.ts` (`generateSessionReview`), `lib/coachingPolicy.ts`, `supabase/functions/_shared/coachingPolicy.ts`, `supabase/functions/coach/index.ts`.
- **Tests:** new `lib/__tests__/coachingFeedback.test.ts`; edits to `lib/__tests__/restTimer.test.ts`, `lib/__tests__/coachingContext.test.ts`, `supabase/functions/coach/handler.test.ts` and `supabase/functions/chat/handler.test.ts`.
- **Not in scope:** no migration, no schema change, and no change to `isCompoundExercise` or `suggestRestSeconds`.

## Reproduced (RED)

| # | Case | Pre-fix result |
|---|---|---|
| A1 | Coach request fails after a partial stream with `HTTP 500: {json}` | Error not rendered. Partial answer displayed and archived into modal history. |
| A2 | Failed submit | Input already cleared; question lost. |
| A3 | End / owner change while a rest prompt is shown | Already cleared (`invalidateResponses`, presentation-reset effect), but untested. |
| A4 | Leg press / Lat pulldown | Classified non-compound (isolation rest). This is current behaviour, not a decision. |
| B1 | Empty or whitespace coach stream | Shows invented "Coach had no response." and archives it via `saveCoachChatQA`. |
| B2 | `CoachModal.onSubmit(chatHistory)` | Dead argument: the route ignores it since C1. |
| B3–B5 | Review warmups, backoff penalty, numeric load advice, rest on any set kind | No policy switch existed. |
| B6 | `coach` Edge: invalid body (400) | `gateAiRequest` ran first, so a 4xx consumed free AI quota (5 bad requests hit the limit, measured by the other session). `chat` already validated before gating. |

RED receipts:
- **Lane A:** `coachingFeedback.test.ts` 1 pass / 2 fail. The rest-prompt coverage test passed, as expected for coverage only.
- **Lane B, `coachingFeedback.test.ts`:** 3 pass / 7 fail.
  - The first review-test failures came from a missing offline fixture dependency. I re-proved them by running the review tests against `git show HEAD:lib/api.ts` placed temporarily at `lib/api.ts`, then restored it (`cmp` identical):
    - flag-off byte-identity: pass (the guard holds at HEAD);
    - `reviewSetPolicy` on: fail;
    - `suppressReviewLoadAdvice` on: fail.
  - The auto-start restart test passed at HEAD: it pins existing behaviour.
- **Edge handler tests** (`coach` + `chat`): 18 pass / 1 fail. The coach failure showed 5 `get_entitlement` RPCs for 4xx requests. Chat passed.

## Repair

**Lane A: `CoachModal`**
- Renders `error` as an alert line coloured with the `danger` theme colour.
- Transport errors (`^HTTP \d` or containing `{`, `}`, `<`) become: "Coach couldn't answer right now. Your question is back in the box — tap send to retry." Other messages, such as the AI-limit copy, pass through.
- On a loading→false transition with `error`:
  - the partial answer is neither committed nor displayed;
  - the unanswered user bubble is removed;
  - the exact last-sent question is restored into the input via `onChangeQuestion`.

**Lane B, unflagged (integrity)**
1. **Empty coach answer.** `submitCoachQuestion` treats an empty or whitespace answer as unavailable. It sets `coachAnswer` to null and `coachError` to "Coach didn't answer that one.", does not call `saveCoachChatQA`, and adds no session turn. CoachModal then restores the question.
   - This changed one C1 expectation in `coachingContext.test.ts`: the empty-answer question no longer becomes a user turn. That is consistent with the test's own title, "fenced or failed coach requests add no turn".
2. **Dead `onSubmit` argument.** `onSubmit: () => void`; the dead `chatHistory` argument is removed from the modal.
3. **Coach Edge quota.** In `coach/index.ts`, `gateAiRequest` now runs after JSON parse, `question` and `context` validation. As a side effect, the missing-`OPENAI_API_KEY` 500 also no longer consumes quota.
   - Behaviour change: an invalid request from an over-limit user now gets 400 instead of the gate's limit response.
   - `chat/index.ts` already validated before the gate; it is unchanged and now pinned by the new test.

**Lane B, flagged (all `false`; `version: 'unapproved'`, mirrored in both policy files)**
- **`reviewSetPolicy` (Q2a).**
  - Drops `setKind: 'warmup'` rows from the review input.
  - Appends to the 20+ lb drop rule: `Rows with setKind "backoff" or "drop" are prescribed lighter sets: never apply this penalty to them.`
- **`suppressReviewLoadAdvice` (Q4a).** Replaces the `NEXT_SESSION_NOTE` instruction with a non-load focus: "Do not prescribe any weight, load or load increase."
- **How the flags reach the review.** `generateSessionReview(rows, part, policy?)`: an omitted policy means off. Only a type import is added, so existing offline `sourceModule('lib/api.ts')` maps are unchanged. `handleEndWorkoutWithReview` passes `COACHING_POLICY`.
- **`restWorkSetsOnly` (Q3a).**
  - In `logPerformedRows`, the last performed non-cardio row triggers rest only if `setKind` is absent or `'work'`.
  - Restarting a running timer was already true when auto-start is on (`startRestTimer` replaces the state); this is now pinned by a test.
  - Prompt mode still suppresses the prompt while a timer is non-idle. That keeps the #8 "prompt and live indicator never compete" rule, and changing it is left to the Q3 owner.
- **Flag-off proof.**
  - The review request body's sha256 equals the HEAD body (`77af65fa…c1ae`, computed from `git show HEAD:lib/api.ts`).
  - Omitted policy gives the same body.
  - A warmup still triggers rest with the shipped policy.
  - The existing rest assertions in `i2SpecRepairs` and the others are green.

## SPEC FAIL repairs (independent reviewer)

RED is measured against the pre-repair tree: 5 fail / 12 pass on `coachingFeedback.test.ts` + `restTimer.test.ts`. GREEN: 23/0.

| # | Finding | RED | Repair |
|---|---|---|---|
| 1 | Partial stream reappears after error and reopen (`openCoach` clears only the error) | "partial stream never reappears after error and reopen": `coachAnswer` stayed `'Your bench went fr'`. The reviewer probe `scratchpad/c3-spec/reopen.probe.test.ts` showed it visible. | `submitCoachQuestion` catch now calls `setCoachAnswer(null)`. CoachModal also marks the stale partial as settled (`committedRef`) on error, so it stays hidden even with the old parent state. The probe now passes. |
| 2 | A stalled stream leaves the coach Loading forever | Stall test: 0 idle timers armed. | Covered below. |
| 3 | Retry copy claimed a restore that hadn't happened | Retry-copy test: a technical error shown without any send still said "back in the box". | Covered below. |
| 4a | `restWorkSetsOnly` ignored a `[work, warmup]` batch | Batch test: no rest at all. | Under the flag, the last *eligible work* non-cardio row in the submit triggers rest, still once per submit. Flag off keeps the last non-cardio row (asserted). |
| 4b | `suppressReviewLoadAdvice` was prompt-only | Enforcement test: `'Try 190 lbs for 8.'` kept. | Covered below. |

**Item 2 repair: idle deadline in `askCoach`**
- The fetch, the error-body read, every `reader.read()` and the non-stream `text()` are each raced against an idle deadline.
- Each received chunk re-arms the deadline. On expiry, `AbortController.abort()` plus a readable `Coach stopped responding.` error; the timer is cleared in `finally`.
- The clock is injectable, following the `settleOptionalReview` pattern.
- Stall test (a reader that never resolves, fake clock): the request is aborted, Loading clears, the error shows with the retry line, the question is restored and nothing is archived.
- A guard test shows that chunks re-arm the deadline and completion clears it. It passes vacuously before the repair.
- **Why N = 20000 ms.** Repo search found no request timeout in `fetchWithAuth`, `api.ts` or any expo fetch wrapper. The only precedent is P2's 5000 ms optional-review wait. That wait suits a dispensable background result, but this is an idle (no-progress) deadline on a first token, which includes server context queries plus provider latency, and aborting a valid answer costs the user a manual retry. N is a client responsiveness deadline, not coaching policy.

**Item 3 repair: retry copy**
- A technical error reads "Coach couldn't answer right now.". Other messages pass through.
- " Your question is back in the box — tap send to retry." is appended to every message, the AI-limit copy included, only when the modal actually restored the question (`questionRestored` state).

**Item 4b repair: load-advice enforcement**
- With the flag on, a `nextSessionNote` matching `/\d+(\.\d+)?\s*(lb|lbs|kg|pounds|%)/i` becomes `''`. It is never rewritten, and flag off is unchanged (asserted).
- Known gap: a unitless `190x8` is not matched by this regex. The flag-on prompt already forbids it.

Fixture note: C1's `realApi` VM in `coachingContext.test.ts` now passes `setTimeout`, `clearTimeout` and `AbortController`, because `askCoach` arms the deadline. Its compared request bodies are unchanged.

**Interpretation (not approved policy):** under Q3a, `backoff`, `drop` and `superset` count as non-work, because only an absent `setKind` or `'work'` is eligible.

## Gates

| Gate | Result |
|---|---|
| `coachingFeedback.test.ts` | 16/0 |
| `coachingFeedback.test.ts` + `restTimer.test.ts` | 23/0, including 2 "characterization (D07 pending)" tests |
| `node --test "lib/__tests__/*.test.ts"` | 3485/0 |
| Edge tests: `_shared/*.test.ts`, `next-set/baseline.test.ts`, `chat/handler.test.ts`, `coach/*.test.ts` | 133/0 |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint --max-warnings 0` | exit 0 |
| `git diff --check` | exit 0 |
| Direct `npx eslint --max-warnings 0` on every changed file | Clean except `coach/index.ts`: 2 Deno URL `import/no-unresolved` errors and an unused `e` warning. These are identical to `git show HEAD:… \| eslint --stdin`, and Edge functions are outside expo lint scope. |

## Impact receipts (`node .gitnexus/run.cjs impact <symbol> --direction upstream --repo .`)

| Symbol | Result | Confirmation |
|---|---|---|
| `CoachModal` | LOW, 1 (HomeScreen) | — |
| `submitCoachQuestion` (index.tsx) | UNKNOWN | Grep: used only as the `onSubmit` prop. `hooks/useCoachLogic.ts` has its own unrelated function. |
| `askCoach` | LOW, 0 | Grep: `index.tsx` and `hooks/useCoachLogic.ts:47`. The clock is an optional trailing parameter. |
| `generateSessionReview` | LOW, 0 | Grep: one caller, `index.tsx` `handleEndWorkoutWithReview`. |
| `handleEndWorkoutWithReview` | **HIGH**, 3 (`sendMessage`, `onEndWorkout`, HomeScreen) | Only the review call gained a third argument. With the policy off the body is byte-identical (golden hash). The full End suite is green. |
| `logPerformedRows` / `triggerRestTimer` | LOW, 1 / 2 | `triggerRestTimer` is not edited. |
| `COACHING_POLICY` | UNKNOWN | Grep: `index.tsx`, `chat/index.ts`, `coach/index.ts` and tests. The change is additive keys only, and the parity test is green. |
| `gateAiRequest` | UNKNOWN (coach) / LOW | Grep: called by `chat/index.ts` and `coach/index.ts`. Only the call position in `coach` moved. |

## Residual

- **Test files outside the original lane, edited at coordinator direction:**
  - `coachingContext.test.ts`: the policy assertion plus the empty-answer expectation above;
  - `coach/handler.test.ts` and `chat/handler.test.ts`: the `host` now records RPC names (`rpcCalls`) and accepts a raw request body.
- **Not covered:** no deployed function, live provider, device run, or real `ai_usage` table check. The quota fix is proven by gate RPC count only.
- **Not done (needs approval):**
  - Q1, and Q2–Q4 activation;
  - whether Leg press and Lat pulldown are compound (pinned as non-compound);
  - prompt-mode restart semantics;
  - D03 warmup display numbering.

## Local real-DB quota receipt (orchestrator)

Real HTTP → Kong → `supabase functions serve` → ck-p5 Postgres `public.ai_usage`, using a free smoke user (`smoke-c3.mjs`):
- **RED at HEAD 80a039d (coach code served before lane B):** 4 invalid coach requests moved `ai_usage` from 0 to 4.
- **GREEN with C3:** missing question, non-string question and malformed JSON each return 4xx with `ai_usage` staying 0 → 0. A valid request still meters (+1), so the gate still runs.
- A non-array `chatHistory` is deliberately treated as empty (C1 bounds), so that request counts as valid and is metered.

## QUALITY repair: idle-deadline abort ordering (orchestrator)

The QUALITY reviewer found that the deadline callback aborted before settling the idle error. Real fetch rejects a pending `reader.read()` on abort, so mid-stream the raw "This operation was aborted" won the race and reached the user.
- **RED/GREEN on real Node fetch** (`scratchpad/c3-quality/race2.mjs`): the read phase produced "This operation was aborted" with the original order, and "Coach stopped responding." after `expire()` was moved before `controller.abort()`.
- The unit fixture's reader now rejects on abort, like real bodies, so the test exercises the abort path. The vm harness's microtask ordering did not reproduce the race; the real-fetch probe is the RED receipt.
- QUALITY LOW (partial answer hidden in both the parent and the modal) is kept on purpose: the modal guard protects any other modal caller.
