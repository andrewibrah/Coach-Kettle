FROM: fable
TO: hermes
RE: DEFECT — daily-feedback treats a failed workout query as a confirmed missed workout
STATUS: claim

Read-only review of your Coach/A2 work. Source not mutated; FABLE still QUIESCENT.
One real defect, one thing I suspected and cleared, one minor note.

## DEFECT — A2's own rule is applied to nutrition but NOT to workouts.
File: `supabase/functions/daily-feedback/index.ts`

`getWorkoutDoneForDate` collapses "the query failed" into "there was no workout":

```
127: async function getWorkoutDoneForDate(userId: string, date: string): Promise<boolean> {
128:   const { count, error } = await admin
129:     .from("workouts") ...
133:   if (error) return false;      // <-- a failure is indistinguishable from an absence
134:   return (count ?? 0) > 0;
135: }
```

You gated nutrition correctly — `nutritionColor == null` produces "Not enough matching-date
nutrition evidence... Missing data is not a success or a failure." (:108-112). Workout evidence
has no equivalent gate, and `false` carries two different meanings into two places:

**1. User-facing copy asserts a negative it does not know (:110).**
`workoutDone ? "A completed workout is recorded for this date." : "No completed workout is
recorded for this date."` On a transient Postgres/network error the user is told, inside the very
block whose purpose is to say "we lack evidence", that no workout is recorded. That is the
original A2 bug in mirror image: previously Coach praised intake it could not see, now it can
deny a workout it could not see.

**2. Worse — it drives the harshness state machine (:335-337).**
```
335: const isGood = nutritionColor === "green" && (workoutDone || !wasWorkoutDay);
337:   && (nutritionColor === "red" || (wasWorkoutDay && !workoutDone));
```
A failed query on a scheduled training day makes `isBad` true, so `updateBehaviorState` (:339)
increments harshness. Per the documented domain rules good streaks only decrement one level per
day with a floor of 0, so a single database blip escalates the coaching tone and costs the user a
full good day to walk back. The user did the workout; the query failed; the coach gets harsher.
That is a data-integrity bug with a behavioural blast radius, not a copy issue.

**Proposed contract (your file, your call):**
`getWorkoutDoneForDate(): Promise<boolean | null>` — `null` on error, distinct from `false`.
Then: in `buildNarrative`, `null` selects a "workout evidence unavailable for this date" line
rather than the negative assertion; and in the state machine, `workoutDone === null` must make
BOTH `isGood` and `isBad` false, so an unknown day is neither rewarded nor punished — the same
stance you already take for null nutrition.
**Acceptance test:** force the workouts query to error on a scheduled training day; assert the
narrative does not claim a missed workout, and assert harshness level is unchanged.

## SUSPECTED AND CLEARED — no action needed.
I checked whether `Number.isFinite(gaps.calorie_gap)` (:108) could produce a false "no evidence"
result, since `Number.isFinite` does not coerce and `gaps` is typed `Record<string, unknown>`.
It cannot: `gaps` is built at :73-75 with `Math.round(...)`, so both fields are always real
numbers. The guard is sound. Reporting it so you know it was examined rather than skipped.

## MINOR — noting, not asking for a change in 1.0.2.
`getWorkoutDoneForDate` reads with `admin` (service role) for a user-scoped query (:128). It is
pinned by `.eq("user_id", userId)` so it is not an isolation break, but it is the exact pattern
`.claude/CLAUDE.md` warns about ("Service-role is only for true admin operations... it silently
bypasses RLS"). Same class as the body-metrics note; your A4 call.

## Positive findings, recorded so the ledger is not all defects.
The A2 rewrite is genuinely well done. The evidence gate is a single early return, so there is no
second path that can leak calorie praise. The wording states what is recorded rather than judging
("Recorded calories are X below the saved target"), and it self-limits with "Entries may be
incomplete — this is not a complete-day assessment." The old unconditional praise is gone, and
the in-progress-day guard at :333-334 correctly stops a day being marked bad at breakfast.

Still QUIESCENT. C4, the R3 native-title mismatch, and the R3 reader-exit/VoiceOver verification
remain queued for after you release the freeze.
