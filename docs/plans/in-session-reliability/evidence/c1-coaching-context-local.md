# C1 scoped coaching conversation and durable pain context: local evidence

Scope: `app/(tabs)/index.tsx` (`submitCoachQuestion`, the `sendMessage` chat call), `lib/api.ts` (`chat`, `askCoach`), new `lib/coachingContext.ts`, new `lib/coachingPolicy.ts`, new `supabase/functions/_shared/coachingPolicy.ts`, `supabase/functions/chat/index.ts`, `supabase/functions/coach/index.ts`, tests. No migration, no schema change, no `chatStorage.ts` or `CoachModal.tsx` change (CoachModal still displays the archive; C3 owns it).

## Reproduced (RED at the pre-C1 source)

| # | Case | Pre-C1 result |
|---|---|---|
| 1 | Coach reopen: the modal passes the refetched all-time `coach_modal` archive | the archive is sent to `askCoach` as conversation |
| 2 | New session after an earlier one | previous turns come from the archive, not empty |
| 3 | Server history: role `system`/`tool`, object content, 5001-char content, 17 entries | trusted as-is (`slice(0,-1)` only) |
| 4 | Pairs-only history (no trailing current question) | the server silently dropped the last real answer |
| 5 | Pain disclosure, then 11 more turns | outside the 10-message window, so lost |
| 6 | Historical workout notes in the coach summary | dropped |

RED receipts:
- `lib/__tests__/coachingContext.test.ts`: 0/1 while the module was missing. With a throwing stub, 1 pass / 10 fail. The reopen failure showed `ARCHIVE:` entries in `chatHistory`.
- `coach/handler.test.ts`: 4 pass / 4 fail. The 3 pre-existing tests and the flag-off regression guard passed. The later cardio-note assertion: 7/1, then 8/0.
- `chat/handler.test.ts`: 5 pass / 2 fail after one stale-expectation correction (see Residual).

## Repair (minimal)

- **Session-scoped turns.** `coachTurnsRef = { owner, turns }` is keyed by `renderOwner.owner`, the existing P2 `sessionOwnerKey` of user and workoutId. A new owner resets the turns.
  - After End, `canUseSession()` is false, and the next Start mints a new workoutId (`setWorkoutId(makeId())`, `hooks/useWorkoutSession.ts:74`).
  - Clear keeps the same session identity (P4), so it keeps the turns.
  - The request sends `[...sessionTurns, currentQuestion].slice(-10)`. The CoachModal archive argument is ignored.
  - A pair is appended only on the owned success path. A failed or fenced request adds nothing, and an empty answer records no fabricated assistant turn.
- **Server history bounds** (`coach/index.ts`). Drop entries with a role other than user or assistant, non-string content, empty content, or more than 5000 chars. Keep the last 10.
  - The trailing entry is stripped only if it is the user's current question. This is compatible with old clients (which append the question) and new clients, in either deploy order.
  - Numbers reuse existing code: the client's 10-message window and `chatStorage.sanitizeContent`'s 5000. They are documented as transport safety, not coaching policy.
  - A non-array `chatHistory` is treated as empty. A non-string `question` is a 400.
- **`collectDisclosures(rows, turns, sessionId)`.**
  - Returns exact row-note and user-turn strings that match the existing `structuredGate` pain/effort vocabulary, plus I1's "exhaustion".
  - Each entry carries `sessionId`, plus `rowId` for row notes and `source`.
  - Order is chronological, with no dedupe and no precedence. A later "no pain" does not remove an earlier pain entry, and absence yields nothing.
  - Assistant text is never treated as a disclosure.
- **Flag (`COACHING_POLICY`, `version: 'unapproved'`, all false).**
  - The client builds `context` only when `contextualDisclosures` is on (`buildCoachingContext`).
  - `api.chat` and `api.askCoach` attach `context` only when one is supplied, so the flag-off payload is byte-identical.
  - Edge side, flag off: `context` is ignored entirely.
  - Edge side, flag on: `context` is validated and malformed context gets a 400, never trimmed. Limits: 100 disclosures, 5000 chars each, ids up to 200 chars, and each disclosure's sessionId must match the context's.
  - Valid disclosures become one labeled `CURRENT-SESSION DISCLOSURES` system message: not chat turns, not sets to log, no diagnosis, absence means unknown. In chat parse mode they stay outside `existing_rows`.
  - With the flag on, the coach summary appends `[note from <date>, historical, not current: "<note>"]` to strength sets and to the cardio line. Flag off keeps the old output.

## Gates

- `node --test lib/__tests__/coachingContext.test.ts`: 16/0 (after the SPEC repairs).
- Coach handler 9/0, chat handler 8/0.
- `node --test "lib/__tests__/*.test.ts"`: 3463/0.
- `node --test "supabase/functions/_shared/*.test.ts" supabase/functions/chat/handler.test.ts supabase/functions/coach/*.test.ts`: 121/0 after the one-line cross-owner fix below. Before it: 83/36, of which 35 were C1-caused and 1 was H1's.
- `npx tsc --noEmit`: exit 0. `git diff --check`: exit 0.
- `npx expo lint --max-warnings 0`: exit 1 at the final run. The single warning is in the foreign `app/(tabs)/history.tsx:119` (`react-hooks/exhaustive-deps`, P4/P5 work in progress); it exited 0 before the SPEC repairs. None of the C1 files have findings.
- Transient: one full run showed 2 lib failures (`p4OperationOutbox`, `coachingAnswers`) and 1 `workoutValidation` P4 failure while other workers were committing. On rerun all were green: 22/0, 14/0, 79/0.
- Direct `npx eslint --max-warnings 0` on the changed files: the client and test files are clean.
  - `chat/index.ts` and `coach/index.ts` report 4 and 3 problems. These are identical to `git show HEAD:<file> | eslint --stdin`: Deno URL `import/no-unresolved`, plus pre-existing `import/first` and unused `e` warnings.
  - The Edge functions are outside the expo lint scope.

## SPEC FAIL repairs (independent reviewer)

All repairs sit behind `contextualDisclosures` (false). Flag-off payloads are unchanged: `buildCoachingContext` returns undefined, `api.*` attach nothing, and the Edge ignores `context`.

1. **HIGH: composer path** (audit Q2, `evidence/coach-kettle-question-audit.md:47`).
   - `sendMessage` now records the composer message (literal disclosure, `source: 'composer_message'`) into the same per-session `CoachingRecord` used by the coach modal.
   - After an answer-mode reply, `sendMessage` stores `exchange = { question, answer }`.
   - The next `api.chat` carries both in `context`. The Edge renders them as a labeled `CURRENT-SESSION DISCLOSURES` block plus a `PRECEDING EXCHANGE` system block. They are never chat turns and stay outside `existing_rows`, and parse mode still returns only model rows.
   - Routing was verified: `My shoulder hurts` and `Only on the way down` both go to `kind: ai / conversational_question` through the real `decideAndParse`.
2. **MEDIUM: retention.** Disclosures are append-only once observed (`observeCoaching`).
   - Observation happens at each coach/composer request and on every rows change (a flag-gated effect).
   - Row notes are deduped by rowId and exact text, so editing a note adds the new text and keeps the original. Deleting the row keeps it.
   - The record resets only when the session owner changes (new session, End, or account).
3. **MEDIUM: scope fields.** Each disclosure has `rowId`, `exercise` (as typed, row notes only), `exerciseCanonical` and `revision`.
   - `exerciseCanonical` and `revision` are always `null`, meaning explicitly unknown. The client has no canonical lift mapping (that is server-side `liftMatching`, owned by H1), and `LogRow` carries no revision (the P4 outbox revision is not exposed on rows).
   - Message disclosures have `rowId` and `exercise` set to `null`.
   - The Edge validates every field and renders `unknown` for nulls.
4. **LOW: caps.**
   - The client mirrors the transport bounds (`MAX_CONTEXT_DISCLOSURES = 100`, `MAX_CONTEXT_TEXT = 5000`, `MAX_CONTEXT_ID = 200`). Both copies are commented as transport safety, not coaching policy.
   - The client sends the most recent in-bounds 100 plus a required `omittedCount`, which includes any oversized entries.
   - The Edge states the omission in the block, for example: "N earlier disclosures omitted ... still apply as unknown".
   - The only thing still dropped silently is an oversized exchange (more than 5000 chars). Disclosures are always counted.

Repair RED → GREEN:
- `lib/__tests__/coachingContext.test.ts`:
  - The file failed at load until stub exports existed. With throwing stubs: 7 pass / 9 fail.
  - The composer test showed `disclosures: []` and no exchange. The edit/delete test lost the scope fields.
  - Then 16/0.
- `chat/handler.test.ts` + `coach/handler.test.ts`: 13 pass / 4 fail, then 17/0. The malformed-context cases were already rejected by the old validator.

## Impact receipts (`node .gitnexus/run.cjs impact <symbol> --direction upstream --repo .`)

| Symbol | Result | Confirmation |
|---|---|---|
| `submitCoachQuestion` (index.tsx), `sendMessage`, `askCoach`, `chat` (api.ts) | LOW, 0 callers | Callers are JSX props or object properties. Grep finds `askCoach` at index.tsx and `hooks/useCoachLogic.ts:47` (unchanged), and `api.chat` at index.tsx only. |
| `coach/index.ts`, `chat/index.ts` (file) | UNKNOWN | These handlers are reached only over HTTP from `lib/api.ts`: `/coach` from `askCoach` and `generateSessionReview`, `/chat` from `chat`. |
| `sourceClosure`, `runWorkoutRoute` (harness; run after the edit) | UNKNOWN | Grep shows 16 and 17 test files using them. The additions are `??=` / pre-`overrides` defaults only. |
| `buildCoachingContext` (repair) | LOW, 2 (index.tsx coach + composer) | `collectDisclosures`, `readCoachingContext` and `disclosureBlock`: the file-scoped impact runs printed nothing, so there is no receipt. Grep shows their only callers are `lib/coachingContext.ts` and the chat/coach handlers. |
| test `host` (chat and coach), `edgeRaw` | LOW, 0 | `host` gained an optional second parameter, and `edgeRaw` gained an additive dependency key. |

No HIGH or CRITICAL results.

## Residual, recorded

- **Shared harness touch (not on the owned list).** `lib/__tests__/workoutIdentityHarness.ts` (`sourceClosure` `??=` defaults) and `lib/__tests__/inSessionHarness.ts` (`runWorkoutRoute` context) now supply `coachingRecordRef`, the real `coachingRecordFor`/`observeCoaching`/`buildCoachingContext` and the shipped `COACHING_POLICY`. Without this, the approximately 17 suites that execute `sendMessage` or `submitCoachQuestion` would hit a ReferenceError.
- **Cross-owner touch: `supabase/functions/_shared/workoutValidation.test.ts`.** The file also holds paused, uncommitted P4 edits, which were left intact.
  - Its `edgeRaw` loads `chat/index.ts` through a strict dependency map, so the new import caused 35 C1-caused failures.
  - Added one additive key next to `operationErrors`: `'../_shared/coachingPolicy.ts': sourceModule('supabase/functions/_shared/coachingPolicy.ts'),`.
  - The one other failure seen earlier (`./baseline.ts` for `next-set`, H1) has since cleared.
- **Stale expectation corrected (owned file).** `chat/handler.test.ts` expected 200 for unparseable and envelope-less model output. Since 5189c7a the handler returns 502 "Invalid model response". This was already failing at HEAD (probe 2/2 fail).
- **Not covered.**
  - No live provider, deployed function, native, or device verification.
  - No claim about real model advice quality.
- `hooks/useCoachLogic.ts` calls `askCoach(q, rows)` without history. It is unchanged.

## D09 questions left blocked (flag stays `false`; `version: 'unapproved'`)

1. Questionnaire wording.
2. Trigger cadence.
3. Answer freshness/TTL.
4. Applicability (which disclosures apply to which exercise, set, or session scope).
5. Pain, readiness and effort scales.
6. Explicit stop/clarify thresholds.
7. Qualified-help escalation copy.
8. Contradiction precedence (latest explicit answer vs earlier disclosure; contradictions leading to clarify).
9. Sensitive-data retention (including any durable or cross-session storage of disclosures; this slice stores none).

Also unapproved and therefore off: `adaptiveNextSet` and `structuredQuestions`. Turning `contextualDisclosures` on requires a D09 owner, decision, rationale, policy version and acceptance fixture.
