# A2 deterministic next-set decision: local evidence

Baseline: HEAD `70aea8b` (A1). Everything here is uncommitted and local only: no migration, no deploy, and Deno was not run. Product policy is **not approved**. The feature is inert:
- `COACHING_POLICY.adaptiveNextSet` is `false`.
- `NEXT_SET_POLICY` is `null`, so every decision is `unavailable / policy_unapproved`.

## Blocked decisions

| Q | Decision | What it blocks |
|---|---|---|
| Q1 | D07 rule table | Thresholds, increments by equipment, effort responses and the missed-target response for `NEXT_SET_POLICY`. |
| Q9 | D09 copy | Stop/clarify thresholds (`pain.stopValues` / `noPainValues`) and the user-facing copy for each reason code. None ships. |
| Q13 | D09 | Whether an increase is allowed when pain was skipped or unanswered. The engine fails closed: it holds with reason `pain_unanswered`. |
| Q14 | D07 | Target semantics. "Met" means reps ≥ the top of the range, "missed" means reps < the bottom. The reference is the last valid work set this session, falling back to the baseline. Warmup, backoff, drop and cardio sets are never the reference or a failure. |

## Engine (`lib/nextSetDecision.ts`, re-exported by `supabase/functions/_shared/nextSetDecision.ts`)

- **Signature and purity:** `decideNextSet(evidence, policy)`. It is pure: no clock, no IO, no model.
- **Fixed priority:**
  1. null policy gives `unavailable`;
  2. a revision or session race gives `stale`;
  3. pain gives `stop_or_clarify`. Any value not explicitly listed as no-pain counts, as do a pain conflict and a same-context excluded disclosure;
  4. `baseline_mismatch`;
  5. `invalid_evidence` (invalid target);
  6. `clarify` on a conflict or an own-context exclusion;
  7. the effort response from the policy (hold or reduce only);
  8. target and equipment progression;
  9. `hold` or `no_history`.
- **Discriminated union:** only `reduce`, `hold` and `increase` can carry an `action`.
- **Scoping:** answers from another session or exercise are ignored but still cited in `evidenceIds`.
- **Invalid sets** are ignored. Equipment lookups use `Object.hasOwn`.
- **`agreesWithDecision(decision, proposal)`** is an exact structured comparator. Code, load and rep range must all match. Null counts the same as absent. A malformed rep range never matches.

## Wiring (all behind `adaptiveNextSet`)

**next-set Edge** (`index.ts`, new `evidence.ts`)
- A POST `evidence` body is read only when the flag is on.
- Validation is strict:
  - sets use the shared `numericValue`;
  - answers are checked against the CurrentAnswer/CoachingAnswer shapes;
  - transport bounds are 100 items and 200-character ids;
  - `evidence.sessionId` must equal the body `sessionId` the baseline excludes. This only makes two client fields agree. Ownership comes from the RPC's `auth.uid()` scoping (caller JWT, RLS), not from this check;
  - the evidence is rebuilt from whitelisted keys. A client-supplied `baseline` or any unknown field is dropped, and the server's H1 baseline is always the one used (tested);
  - `evidence.exerciseKey` must resolve to the same tracked lift as `exercise`, or the request gets a 400 before the baseline RPC. The decision is then computed under the canonical key, and answers recorded under an alias of that lift are re-keyed to it. Answers for other lifts stay foreign (tested: "bench" with tracked "Bench Press" works);
  - malformed input returns 400 before any read.
- The response is the existing fields plus `decision`. There is no AI provider and no quota.
- With the flag off, the response text is byte-identical to HEAD (tested).

**Client** (`lib/programming.ts`, `types/programming.ts`)
- A response that carries `decision` maps to `{ status: 'decision', decision, baseline }`. Other statuses are unchanged.
- `fetchNextSetDecision(exercise, evidence)` POSTs the evidence. It is for A3.

**Review** (`lib/api.ts`)
- With the flag on and a decision supplied, the prompt asks for a structured `nextSet` copy of the decision.
- That copy is kept, normalized from the decision, only when `agreesWithDecision` is true. Otherwise it is dropped, with no retry and nothing fabricated.
- With the flag on and a decision supplied, the legacy NEXT_SESSION_NOTE overload instruction (and its "try 190x8" example) is replaced. The new note may give no load or rep number other than the decision's action, and none when the decision has no action. This is prompt guidance only and is not enforced.
- With the flag off, the prompt and the result are byte-identical.

**Coach and chat**
- With the flag on, an optional `nextSetDecision` body field is checked by `readNextSetDecision(value, NEXT_SET_POLICY?.version ?? null)` and rebuilt from known fields, so unknown keys are stripped. The server cannot recompute the decision, so it checks what it can:
  - the policy version must be the server's own, so the shipped null policy admits only the inert `unavailable`, and a forged decision gets a 400 (tested);
  - `reason` must be a known engine reason code for that `code`, never free text;
  - reps must be positive integers with low ≤ high, and the load finite and ≥ 0;
  - at most 50 evidence ids of 200 characters each. This is a transport bound that keeps the block small, so A3 must not send more.
- It is added as a labelled system block: context only, not sets to log; next-set numbers only from the decision's action; no load without an action.
- A malformed decision returns 400 before the quota gate.
- **Prose is NOT enforced.** Enforcement is the structured review field and the A3 UI. `nextSessionNote` prose can still contradict the decision (Q4).

## Blockers for A3 and known limits

- **Answer keys:** the client must send `evidence.exerciseKey`, the key its answers use. Aliases of one tracked lift are canonicalized server-side; a key for a different lift gets a 400.
- **The pill:** `NextSetSuggestionPill` shows "Suggestions unavailable" for status `decision`. A3 owns the rendering.
- **Client senders:** the client `chat`/`askCoach` functions do not yet send `nextSetDecision`. That is A3 wiring.

## Scope extensions

New flag-on and flag-off tests were added to two handler test files outside the ownership list:
- `supabase/functions/chat/handler.test.ts` (3 new tests)
- `supabase/functions/coach/handler.test.ts` (3 new tests)

The harnesses that load the real modules needed one map entry each, `./nextSetDecision` or `./evidence.ts`:
- `lib/__tests__/coachingFeedback.test.ts`
- `lib/__tests__/sessionReviewFailure.test.ts`
- `lib/__tests__/workoutRoundtrip.test.ts`
- `supabase/functions/_shared/workoutValidation.test.ts`
- `supabase/tests/p4_edge_sql.mts` (not run: it needs a disposable DB)

## Receipts

**TDD.** The Part 1 quality LOWs were a refactor that stayed green before and after; its only RED was the comparator rep-shape case.


| Area | RED (new tests failing) | GREEN |
|---|---|---|
| Comparator rep-shape | 3 / 84 | 84 / 84 |
| Shared readers | 16 / 16 | 17 / 17 |
| next-set | 26 of 29 new | 39 / 39 |
| chat | 2 of 3 new | 12 / 12 |
| coach | 2 of 3 new | 13 / 13 |
| Client and review | 4 of 11 new | 95 / 95 |
| Review anti-contradiction sentence | 1 / 112 | 112 / 112 (lib file plus parity) |

The remaining new tests were flag-off, identity and drop guards. They pass trivially before the wiring exists.

**Gates**
- Lib suite: 3613 pass, 0 fail, 11 todo (already there).
- Shared, next-set, chat and coach suites: 185 / 185.
- `tsc` exits 0. `expo lint --max-warnings 0` exits 0.
- Direct eslint reports no new findings on the touched files. The Deno URL-import errors and old unused-variable warnings are identical at HEAD. The exception is `supabase/tests/p4_edge_sql.mts`: eslint ignores it (no config), so it was neither linted nor run.
- `components/workout/WorkoutCard.tsx` and `WorkoutTable.tsx` show as modified in the working tree. Those changes are not part of A2.
- `git diff --check` is clean, and so is the per-file check on the untracked files.

**GitNexus:** `impact` returned UNKNOWN for every target because the index is 22 commits behind. I used a text search instead to list the callers: `index.tsx` (review, chat, askCoach), `NextSetSuggestion.tsx`, `program/day.tsx`. Every change is an optional parameter or an additive union member, and `tsc` passes.
