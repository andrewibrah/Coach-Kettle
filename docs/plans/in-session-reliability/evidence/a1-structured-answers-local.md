# A1 structured readiness, pain and effort answers: local evidence

Baseline: HEAD `b5f51ef` (C3). Everything here is uncommitted and local only. No migration, no Edge behaviour change, no deploy. Product policy is **not approved**: it ships with `COACHING_POLICY.structuredQuestions: false` and `questionnaire: null`, so the feature is inert.

## Scope

- **Lane A (new files):**
  - `types/coachingAnswers.ts`. `types/coaching.ts` already existed (harshness/feedback types), so the answer types live in a new file.
  - `lib/coachingAnswers.ts`
  - `components/workout/CoachingQuestions.tsx`
  - `lib/__tests__/coachingAnswers.test.ts`
- **Lane B (integration):**
  - `lib/coachingPolicy.ts` and `supabase/functions/_shared/coachingPolicy.ts`: `questionnaire: null`. The Edge copy declares a local type and imports nothing from outside `supabase/functions`.
  - `lib/workoutDraft.ts`
  - `app/(tabs)/index.tsx`
  - New `lib/__tests__/coachingAnswersIntegration.test.ts`
  - `lib/__tests__/coachingContext.test.ts`: the shipped-policy `deepEqual` gains `questionnaire: null`.
- **Not in scope:** next-set wiring and any decision logic (A2), mounting `NextSetSuggestion` (A3), server persistence.

## Behaviour (all behind the flag)

**Validation and applicability**
- `validateAnswer` rejects all of the following:
  - a null policy (`policy_unapproved`);
  - an unknown question, state or provenance;
  - an out-of-range, off-step or invalid choice;
  - a skip or unknown answer that carries a value;
  - a malformed scale in the policy (`invalid_policy`).
- `isApplicable` rejects another session, another exercise (for exercise scope), clock skew (capture time after now, or not finite), stale answers (`capturedAt + freshnessMs < now`; equality is still fresh) and a superseded revision of the answer's own row.

**Resolving the current answer: `currentAnswer`**
- The log is append-only. "Later" means position in the log, never `capturedAt`.
- Skipped and unknown answers never become a value and never clear an earlier answered value; they set `skippedLater` instead.
- Differing answered values are a `conflict` that keeps all evidence, even under one answerId.
- Excluded answered evidence is never dropped. It is reported as `excluded: [{answer, reason}]` on every state.
- Some exclusions are from the same session and exercise: `clock_skew`, `stale`, `revision_mismatch`. If one of those differs from the surviving value, or nothing survives, the result is `conflict`.
- `other_session` and `other_exercise` exclusions are reported but do not cause a conflict.

**Draft persistence: `lib/workoutDraft.ts`**
- `WorkoutDraft` gains `coachingAnswers?: CoachingAnswer[]`.
- Restore follows the P1 R2 rule: a corrupt entry (bad state, provenance or shape, a skip with a value, or a log that isn't an array) rejects the whole read. The raw bytes stay unchanged, and restore and Start stay unresolved.
- A legacy draft without the field restores as before.
- A rows save (`saveWorkoutDraft`) copies over the same session's stored log, as-is and even if it is corrupt, when the incoming draft lacks the field. It never carries the log into a different `workoutId`.
- New `appendWorkoutDraftAnswer` validates the answer, then appends inside the existing draft queue. It refuses, without writing, another owner's or session's draft and a corrupt stored log, including an array log with any corrupt entry.

**Route: `app/(tabs)/index.tsx`**
- New state `{owner, log}`, keyed to `sessionOwnerKey`.
- The derived `coachingAnswerLog` is empty when no workout is active (after End) or when the owner changes (account switch).
- `onCoachingAnswer` and `onCoachingSkip`:
  - The exercise key is the last exercise through the shared `normalizeExercise` (trim + lower-case, the same key as before).
  - A skip is stored with `state: 'skipped'` and no `value` key.
  - Both are no-ops unless the flag is on, the session is usable, the draft is checked, the session is not finalizing and a workoutId exists.
- A new flag-gated effect ("Structured coaching answers: restore") restores the log for the same owner and workoutId.
- There is one `<CoachingQuestions>` mount above `WorkoutBottomBar`.
- No existing closure or effect body was changed. Existing fixtures build their vm contexts by hand, so new identifiers there would break them.

**Component**
- It renders null unless `enabled` is true and the policy is non-null.
- A malformed scale gives no options, only Skip.
- Each excluded answered item gets a dated, labelled line. The label text is a placeholder pending Q8.

## RED → GREEN receipts

| Step | RED | GREEN |
|---|---|---|
| A, first pass | 0/14 (stubs that throw) | 14/14 |
| A, conflict and row-scope fix | 13/15 | 15/15 |
| A, SPEC repair (excluded evidence, state/provenance, overnight, malformed scale) | 11/21 | 21/21 |
| B, integration file | 2/13 (both passes are characterization: legacy draft, round-trip) | 13/13 |
| B, component excluded history | 21/22 | 22/22 |
| B, shipped-policy `deepEqual` (`coachingContext.test.ts`) | 17/18 | 18/18 |
| B, SPEC LOW repairs (flag-guard mutant, corrupt entry in log on append, shared `normalizeExercise`) | 14/16. The guard test passes at HEAD and fails 0/1 with the guard removed (mutant killed; file restored byte-identical). | 16/16 |

Final gates:
- `node --test "lib/__tests__/*.test.ts"`: 3547/3547.
- Edge set (`_shared/*.test.ts`, `next-set/baseline`, `chat/handler`, `coach/*`): 134/134.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint --max-warnings 0`: exit 0.
- Direct `eslint --max-warnings 0` on all touched files: exit 0.
- `git diff --check`: clean.

## Impact (GitNexus, reindexed first)

- `saveWorkoutDraft`: **HIGH**. 5 impacted, 3 processes, through `persistDraftRows` (debounce timer, AppState background, deleteRow, onPress). The change is carry-over only, and it fires only when the stored draft already has `coachingAnswers` for the same workoutId. With the flag off that never happens.
- `getWorkoutDraft`: LOW (HomeScreen, Settings).
- `COACHING_POLICY` (both copies): LOW.
- `HomeScreen`: LOW.

## What is proven, and what is not

- **End:** proven through the real `clearWorkoutDraft` plus the real derived `coachingAnswerLog` (empty with no active workout). The full `onEndWorkout` run was not exercised with answers.
- **Clear (table clear):** keeps the answers log, because session identity is unchanged. That matches append-only evidence, but it is a product question.
- **Native/device behaviour, VoiceOver and layout:** unverified. Because of the flag, nothing renders today.

## Blocked (D09; the flag must stay off)

- **Q8:** questionnaire wording, trigger cadence, pain/readiness/effort scales, RPE vs RIR, freshness, and the excluded-history label copy.
- **Q11:** whether an edited effort/readiness answer is latest-wins or a conflict. The build makes every change a conflict (`// D09 open` in `lib/coachingAnswers.ts`).
- **Q12:** whether effort is set-scoped, i.e. whether an answer on a deleted row still counts for the next set. The build keeps it for other sets (`// D09 open`).
- Shipping also needs the excluded-history rendering approved (implemented, placeholder copy) and qualified review per DECISIONS Approval rules.
