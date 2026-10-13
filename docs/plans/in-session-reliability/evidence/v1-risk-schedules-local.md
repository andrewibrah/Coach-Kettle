# V1 gesture, restore and association risk schedules: local evidence

Baseline: HEAD `70aea8b` (A1). Everything here is local and uncommitted. There is no migration, Edge change or deploy.

**Status:** V1 was made the serial owner of `app/(tabs)/index.tsx`. The reorder fix and the companion fixture updates are **APPLIED**. After the SPEC review, the import part was **replaced** (see **SPEC repair: import ordinals**). Sections marked *(historical)* record the pre-fix state and the first proposal. The current results are in **Applied fix**, **SPEC repair** and **QUALITY changes**.

**Current state (after QUALITY):**
- **Reorder.** `handleReorderRow(fromIndex, toIndex, rowId: string)` takes a required row id.
  - It keeps its first-line fence (`canUseSession`, `ownership.busy`) and runs through `withPendingRows`. A pending edit is therefore committed first, and an invalid one blocks the move.
  - It finds the row only by `findIndex` on the id. A missing id is a no-op. Otherwise the row moves by `toIndex - fromIndex` from its current position.
  - `WorkoutCard` always passes `row.id`.
- **Import.** Appended rows are numbered with `nextSetNumberForExercise`, which skips warmups and rest markers and matches names case- and space-insensitively. Existing rows are never renumbered, so no live change is hidden.
- **Classification.**
  - Fixed: 1a, 1b, 1c, 1d (out-of-range stale index), 2a (commit first), 2c, 4b, 4c.
  - Not reproduced: 1d (missing id), 1e, 3a–3c, 4a, 4d, 7a–7c.
  - Characterization: 3d.
  - Policy pending: 5 and 6 (D10/Q10), and D09 (a reorder changes which exercise new answers bind to, because the key follows the last row).
- **Tests:** `inSessionRiskSchedules.test.ts` reports 24/24; the full lib suite reports 3624/3624.

**V1 handler-seam gate:** met locally once the fix was applied. No positional reorder mutation is left unchecked in the required schedules. Native gesture timing (V2) and the policy items (5, 6, D09) stay open.

Fixture: `lib/__tests__/inSessionRiskSchedules.test.ts`.
- Its controlled schedules drive the **real** HomeScreen closures through `sourceClosure`: `handleReorderRow`, `deleteRow`, `commitCellEdit`, `applyPendingEdit`, `withPendingRows`, `handleSaveSet`, `handleImportRoutine`, `persistDraftRows`, `coachingExerciseKey` and `coachingAnswerLog`.
- They also use the real `resequenceSets`, `createSessionOwnership`, `currentAnswer`, and `lib/workoutDraft.ts` with in-memory AsyncStorage.
- Every `render()` rebuilds the closures over the current state, as React does. A "gesture render" is an older render whose captured `rowIndex` has gone stale.
- These are **handler-seam** schedules. Native gesture timing (RNGH/Reanimated worklets on a device) is **not** exercised and remains V2.

Method:
- Each test asserts the DESIRED safe behaviour: no throw, no `undefined` row, the same row-id multiset, and no row other than the dragged one changing relative order.
- When a test fails against current source, it stays in the file with `{ todo: RED }`. The file therefore exits 0, and every RED is explained and points to this doc.
- *(historical)* The `todo` markers have since been removed: the fix is applied.

## Per-risk results *(historical: "fix proposed, not applied" is the pre-fix status; see Applied fix and SPEC repair)*

| # | Risk | Result | Tests |
|---|------|--------|-------|
| 1 | Reorder by stale positional index during a concurrent delete | **Reproduced (handler seam); fix proposed, not applied** | `1a` (wrong row moves: D moved instead of C), `1b` (`TypeError: Cannot read properties of undefined (reading 'isRest')` thrown inside the state updater) |
| 1 | Reorder by stale index after an inline rename regroups rows | **Reproduced (handler seam); fix proposed, not applied** | `1c` (A moved instead of B) |
| 1 | Invalid `fromIndex`/`toIndex` | **Reproduced; fix proposed, not applied.** Reachability: from the shipped gesture, only an out-of-range `fromIndex` is reachable, through a stale `rowIndex` (1b). `-1`, `NaN` and `1.5` are handler-robustness cases only, because `rowIndex >= 0` and `Math.round` gives an integer. | `1d`: an out-of-range `fromIndex` (5) throws the same TypeError; `-1` moves the **last** row; `NaN` moves row 0; `1.5` moves row 1; a `NaN` `toIndex` moves the row to the top |
| 1 | Clamping of a valid `toIndex` (negative or past the end) | Not reproduced (regression guard) | `1e` ×3 |
| 2 | Pending inline edit kept on the right row id across a reorder | **Not reproduced** (regression guard) | `2a` |
| 2 | Pending inline edit committed **before** the reorder | **Reproduced as a gap, not data loss.** Reorder leaves the edit open, and it commits later by id. | `2b` |
| 2 | Reorder while the pending edit is invalid | **Reproduced as an inconsistency.** Reorder proceeds, although `withPendingRows`, delete and modal save all refuse. The invalid edit stays open; no data is lost. | `2c` |
| 3 | Modal save after the same row was reordered | Not reproduced. It updates that id only, and ordinals are resequenced. | `3a` |
| 3 | Modal save after the same row was deleted | Not reproduced. Nothing is resurrected and no put goes out for the deleted id. | `3b` |
| 3 | Modal save inside `deleteRow`'s awaited durable drop | Not reproduced for row state: the row stays deleted. **Observation:** the live queue receives `drop B` and then `put B`. Retiring that id is the P4 outbox's job and was not changed here. | `3c` (safety), `3d` (characterization of the drop-then-put order) |
| 4 | Import routine with rows and a pending edit: identity, duplicates, lost rows | Not reproduced. Existing ids are kept, new ids are unique, and the pending edit commits on its row. | `4a` |
| 4 | Import appends without resequencing, so set ordinals repeat within an exercise | **Reproduced** (Bench ordinals `1,2,1,2`); fixed. The first fix resequenced the whole list. That was found unsafe (SPEC repair), and the final fix numbers only the appended rows. | `4b`, `4c` ×2 |
| 5 | Modal vs inline rename grouping (D10/Q10) | **Observed difference; policy pending D10/Q10, not accepted by V1.** Inline rename relocates the row to the end of the target group; modal rename keeps it in place. | `5` (characterization; update when D10/Q10 is decided) |
| 6 | Undo | **Feature gap; policy pending D10/Q10, not a defect.** The shipped route has no undo. `hooks/useRowActions.ts` does contain an `undoDelete` (5 s timer), but nothing in `app/`, `components/` or `contexts/` imports it. Only `performedSets.test.ts` exercises it. The hook was not deleted (pre-existing code). | `6` |
| 7 | D09 Q/A association across reorder | Not reproduced. The answer log survives the real rows save, and `currentAnswer` still returns `answered`. **Observation:** `coachingExerciseKey` follows the **last row**, so a reorder changes which exercise **new** answers bind to (`bench press` → `squat`). | `7a` |
| 7 | Association across rename | As expected: the old answer no longer applies (`state: unknown`) but is kept as `excluded` evidence with reason `other_exercise`. The log is unchanged. | `7b` |
| 7 | Association across delete | Not reproduced. The evidence is kept, even after every Bench row is deleted. | `7c` |

Restored questionnaire freshness is already covered:
- `coachingAnswersIntegration.test.ts`: "flag on: … survive a rows save, restore overnight" and the corrupt-restore tests.
- `coachingAnswers.test.ts`: "stale timestamp: boundary is still fresh…".

V1 did not duplicate that coverage.

Stale audit note: the state audit said routine import lacked the `draftChecked` guard. Current source has it (`handleImportRoutine` returns early when `!draftChecked`), and `workoutDraftLifecycle.test.ts` covers it ("handleImportRoutine waits for unresolved restoration").

## Changes made (owned files)

- `components/workout/WorkoutCard.tsx`: the reorder gesture now calls `onReorderRow(rowIndex, rowIndex + movedSlots, row.id)`, and the prop type gains `rowId: string`.
- `components/workout/WorkoutTable.tsx`: the prop type gains `rowId: string`.
- *(historical)* When written, these changes were type-compatible with the old two-argument handler. The applied fix now **requires** `rowId`, and the card is its only caller.
- GitNexus impact: `WorkoutCard` LOW (1 direct: `renderItem`), `WorkoutTable` LOW (1 direct: `HomeScreen`).
- `handleReorderRow` and `handleImportRoutine` show 0 graph callers. Both are reached only as JSX props (`onReorderRow`, `onSelectTemplate`), which text search confirms.
- `hooks/useRowActions.ts` is unchanged: it is not wired into the route, so a fix there would fix nothing that ships.

## *(historical)* First proposed `app/(tabs)/index.tsx` diff

The `handleReorderRow` hunk was applied unchanged. The `handleImportRoutine` hunk (`resequenceSets([...prev, ...skeletonRows])`) was applied and then **superseded** by the SPEC repair below.

Target semantics: the gesture expresses "move **this row** by N slots". The route resolves the row by id and applies the offset `toIndex - fromIndex` from that row's **current** index. An absolute stale `toIndex` would misplace the row after a shift.
- Routing through `withPendingRows` commits a pending edit first, refuses while that edit is invalid, and keeps the existing reconciliation of live updates and retractions.
- Non-integer indices are refused.
- A missing or out-of-range source changes nothing.

```diff
--- app/(tabs)/index.tsx	2026-10-13 09:22:22
+++ app/(tabs)/index.tsx	2026-10-13 13:54:00
@@ -749,7 +749,7 @@
       setRows(skeletonRows);
     } else {
       // Append to current rows
-      setRows((prev) => [...prev, ...skeletonRows]);
+      setRows((prev) => resequenceSets([...prev, ...skeletonRows]));
     }

     if (Platform.OS === "ios") {
@@ -1093,22 +1093,22 @@
     scrollToBottom();
   };

-  const handleReorderRow = useCallback((fromIndex: number, toIndex: number) => {
-    if (!canUseSession() || ownership.busy) return;
-    invalidateResponses();
-    setRows(prev => {
-      const clamped = Math.max(0, Math.min(toIndex, prev.length - 1));
-      if (fromIndex === clamped) return prev;
-      const next = [...prev];
-      const [moved] = next.splice(fromIndex, 1);
-      next.splice(clamped, 0, moved);
-      const changed = resequenceSets(next);
-      const updates = changed.filter(row => isPerformedRow(row) &&
-        JSON.stringify(row) !== JSON.stringify(prev.find(old => old.id === row.id)));
-      if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
-      return changed;
+  const handleReorderRow = useCallback((fromIndex: number, toIndex: number, rowId?: string) => {
+    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
+    // Commits a pending inline edit first and reconciles live changes (withPendingRows).
+    withPendingRows(prev => {
+      // A render-time index can be stale after a delete/regroup: resolve the dragged row by
+      // id and apply the gesture's slot offset from where that row is now.
+      const from = rowId === undefined ? fromIndex : prev.findIndex(row => row.id === rowId);
+      if (from < 0 || from >= prev.length) return prev;
+      const clamped = Math.max(0, Math.min(from + toIndex - fromIndex, prev.length - 1));
+      if (from === clamped) return prev;
+      const next = [...prev];
+      const [moved] = next.splice(from, 1);
+      next.splice(clamped, 0, moved);
+      return resequenceSets(next);
     });
-  }, [invalidateResponses, ownership, setRows, queueLiveRows, showToast, canUseSession]);
+  }, [withPendingRows]);

   const handleOpenEditSet = (rowId: string) => {
     if (!canUseSession() || ownership.busy) return;
```

Two existing tests from other lanes need fixture-only updates with this diff. Neither change alters behaviour:
- In `p4OperationOutbox`, the context gains `withPendingRows`.
- In `sessionOwnership`'s `aiFixture`, `withPendingRows` is built after the real `invalidateResponses` is assigned. As written today, the fixture hands the prebuilt closure a stale stub that never converts the syncing ghost.

```diff
--- lib/__tests__/p4OperationOutbox.test.ts	2026-10-13 04:06:25
+++ lib/__tests__/p4OperationOutbox.test.ts	2026-10-13 13:55:19
@@ -109,9 +109,11 @@
 test('actual reorder reconciles changed set ordinals with unchanged row identities',async()=>{
   const {sourceClosure}=await import('./workoutIdentityHarness.ts');const ops:any[]=[];
   const original=[row,{...row,id:'second',set:2}];
-  const run=sourceClosure('handleReorderRow',{useCallback:(fn:any)=>fn,
+  const context:any={useCallback:(fn:any)=>fn,draftRowsRef:{current:original},editingCell:null,applyPendingEdit:(r:any)=>({nextRows:r}),
     setRows:(fn:any)=>fn(original),resequenceSets:(r:any[])=>r.map((v,i)=>({...v,set:i+1})),
-    queueLiveRows:async(r:any)=>ops.push(r)});
+    queueLiveRows:async(r:any)=>ops.push(r)};
+  context.withPendingRows=sourceClosure('withPendingRows',context);
+  const run=sourceClosure('handleReorderRow',context);
   run(0,1);await Promise.resolve();assert.equal(ops.length,1);
   assert.deepEqual(Array.from(ops[0],(r:any)=>[r.id,r.set]),[['second',1],['r',2]]);
 });
--- lib/__tests__/sessionOwnership.test.ts	2026-10-11 21:44:12
+++ lib/__tests__/sessionOwnership.test.ts	2026-10-13 13:55:19
@@ -75,8 +75,8 @@
   });
   f.ctx.api.chat = () => chat.promise;
   f.ctx.api.logSet = async (payload: any) => { f.calls.push([payload.operation === 'drop' ? 'drop' : 'log', payload]); return { pr: payload.operation === 'drop' ? null : { liftName: 'Bench' } }; };
-  f.ctx.withPendingRows = sourceClosure('withPendingRows', f.ctx);
   f.ctx.invalidateResponses = () => sourceClosure('invalidateResponses', f.ctx)();
+  f.ctx.withPendingRows = sourceClosure('withPendingRows', f.ctx);
   Object.assign(f.ctx, Object.fromEntries(['setCoachLoading','setCoachAnswer','setCoachError','setCoachOpen','setRestPrompt'].map(name => [name, () => {}])));
   return { ...f, chat, send: () => sourceClosure('sendMessage', f.ctx)() };
 }
```

## *(historical)* RED / GREEN before the apply

- **RED (real repo, current source):** `node --test lib/__tests__/inSessionRiskSchedules.test.ts` reports 25 tests: 14 pass, 0 fail, 11 todo. All 11 todo tests fail, which reproduces the risks: 1a, 1b, 1c, 1d ×5, 2b, 2c and 4b.
- **GREEN (scratch copy only):**
  - The scratch copy was a fresh rsync of the current working tree, including the parallel A2 changes, with `node_modules` symlinked.
  - Both diffs above were applied with `patch -p0`, and the `todo` markers were removed.
  - The same file then reports 25/25 pass.
  - The full lib suite reports **3624/3624 pass, exit 0**.
  - `tsc --noEmit` shows no errors outside `reels/`. Those errors come only from that untracked sub-project's missing `remotion` deps in the copy.
  - `eslint --max-warnings 0` on the patched `index.tsx` and both tests: exit 0.

## *(historical)* Gates before the apply

- `node --test lib/__tests__/inSessionRiskSchedules.test.ts`: exit 0 (25 tests: 14 pass, 11 todo RED, 0 fail).
- Full `node --test "lib/__tests__/*.test.ts"`: 3624 tests, 3613 pass, 0 fail, 11 todo (the V1 REDs); exit 0.
  - An earlier run showed 4 transient failures in A2's `nextSetDecision.test.ts` while that worker was mid-edit. The V1 file passed alone at that time too.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint --max-warnings 0`: exit 0.
- Direct `npx eslint --max-warnings 0` on the V1 test, `WorkoutCard.tsx` and `WorkoutTable.tsx`: exit 0.
- `git diff --check`: clean. On untracked files, `git diff --no-index --check`:
  - The V1 test is clean.
  - This doc flags trailing whitespace only on the blank single-space context lines of the embedded patches. That is kept so that `patch -p0` applies them.

## Residual limits

- Native gesture timing is not exercised: whether RNGH re-binds `onEnd` with a fresh `rowIndex` mid-drag after a re-render. The stale-index reproduction holds at the handler seam; device confirmation is V2.
- The applied reorder fix routes a possibly stale handler through `withPendingRows`. That handler captures `editingCell`/`editValue`, so a stale drag-end re-applies whatever pending edit existed at drag start.
  - This is idempotent in the 1c shape.
  - It could revert a value only if that same field were re-edited mid-drag, which is implausible with one finger. Native rebinding is V2.
- Policy items stay with their owners and are not accepted by V1:
  - rename grouping (D10/Q10);
  - undo (D10/Q10);
  - whether new answers should bind to the last row's exercise (D09);
  - the drop-then-put order for a modal save inside a pending delete (P4 outbox).

## Applied fix: RED → GREEN (real repo)

GitNexus upstream impact, run before the edit:
- `handleReorderRow` LOW (0 graph callers; reached only as the JSX prop `onReorderRow`).
- `handleImportRoutine` LOW (0 graph callers; reached only as the JSX prop `onSelectTemplate`).
- **`resequenceSets` CRITICAL** (22 impacted, 10 direct, 11 processes). The function itself is unchanged. *(Superseded: the import call site this step added was removed by the SPEC repair, and import now uses `nextSetNumberForExercise`.)*

The edit applied the diff above with `patch -p0`, plus both companion fixture diffs, and removed the `todo` markers.
- **RED (before the edit):** 25 tests, 14 pass, 11 todo. All 11 failed: 1a, 1b, 1c, 1d ×5, 2b, 2c and 4b. The failure messages are recorded in the table above.
- **GREEN (after the edit):** `node --test lib/__tests__/inSessionRiskSchedules.test.ts` reports 25/25 pass, 0 todo.

Final classification:
- **Fixed** (reproduced, now GREEN): 1a, 1b, 1c, 1d ×5, 2b, 2c, 4b.
- **Not reproduced** (kept as regression guards): 1e ×3, 2a, 3a, 3b, 3c, 4a, 7a, 7b, 7c.
- **Characterization:** 3d (drop-then-put order; the P4 outbox owns it).
- **Policy pending (not accepted):**
  - 5: rename grouping, D10/Q10.
  - 6: undo absent, D10/Q10.
  - D09: `coachingExerciseKey` follows the last row, so a reorder changes which exercise **new** answers bind to (7a: `bench press` → `squat`). Stored answers are unaffected.

Gates (real repo, after the fix):
- Full `node --test "lib/__tests__/*.test.ts"`: **3624/3624 pass, 0 todo, exit 0**.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint --max-warnings 0`: exit 0.
- Direct `eslint --max-warnings 0` on `index.tsx`, `WorkoutCard.tsx`, `WorkoutTable.tsx` and the three test files: exit 0.
- `git diff --check`: clean. The new test file is also clean under `--no-index --check`.

## SPEC repair: import ordinals (independent SPEC FAIL, MEDIUM)

**Finding (reproduced).** The first fix ran `setRows(prev => resequenceSets([...prev, ...skeletonRows]))` outside `withPendingRows`, so it queued no live operation for existing rows. Shipped paths can leave gapped ordinals: `onIncrementSet` does `set + 1` without resequencing, and the AI `setOverride` path can too.
- Schedule: Bench A=1, B=2. Increment B, so B=3 and `put B` is queued. Then import an unrelated Squat routine.
- Result: performed B silently became `set 2`, with ops `[]`.
- Later `withPendingRows` diffs compare against the renumbered previous rows, so the change is never re-queued.

**Fix chosen (minimal).** `handleImportRoutine` now numbers **only the appended skeleton rows**. Each one continues after the highest existing `set` of its exercise (rest markers are skipped; the comparison uses `normalizeExercise`).
- Existing rows, performed or not, keep their ordinals untouched.
- Import therefore changes no existing row, and nothing needs queuing.

Honest effect on existing rows: **none**. A gap such as Bench `1,3` stays a gap after import, and a same-exercise import continues at `4,5`. A gap is only closed by a later resequencing mutation (edit, delete, duplicate or reorder), and those run through paths that queue live operations. Imported rows are `planned`, so no live operation carries them.

Why not `withPendingRows`: renumbering performed history as a side effect of an import is not a requested behaviour. Leaving it untouched avoids the hidden change rather than queuing it.

Tests in `lib/__tests__/inSessionRiskSchedules.test.ts`:
- `4c import after a gapped ordinal leaves existing performed rows unchanged`, in two variants:
  - the unrelated Squat routine (the reviewer's probe);
  - a same-exercise Bench routine.
  - Each asserts existing rows deep-equal before and after, ops `[]`, and unique Bench ordinals.
- `4b` (no repeated ordinals) stays green.

RED and GREEN:
- **RED:** a scratch copy with the import hunk reverted to the first fix gives 25 pass and **2 fail**, both 4c variants. B went 3→2 with no operation.
- **GREEN:** the real repo gives **27/27**.
- **Reviewer's probe**, run in the real repo and then removed: after import, `A 1, B 3, Squat 1, Squat 2`, ops `[]`.

Gates (real repo, after the repair):
- Risk file: 27/27, 0 todo.
- `p4OperationOutbox` plus `sessionOwnership`: 81/81.
- Full lib suite: **3626/3626, 0 todo, exit 0**.
- `tsc`: exit 0.
- `expo lint --max-warnings 0`: exit 0.
- Direct eslint on `index.tsx`, `WorkoutCard.tsx`, `WorkoutTable.tsx` and the three test files: exit 0.
- `git diff --check`: clean.

## QUALITY changes (after SPEC PASS)

GitNexus upstream impact, run before the edits:
- `handleReorderRow` LOW (reached only as the JSX prop).
- `handleImportRoutine` LOW.
- `nextSetNumberForExercise` LOW (2 impacted). The function is unchanged; only a call site was added.

1. **`rowId` required.** `handleReorderRow` resolves the row only through `findIndex`, and the old `rowId === undefined` / `from >= prev.length` branches are gone.
   - Tests now pass ids: 1e, 2a, 2c, 3a, 7a, `p4OperationOutbox` `run(0,1,'r')`, and `sessionOwnership` (`'set-original'`).
   - The first-line `canUseSession()/ownership.busy` fence was restored. `p4AuthRecovery`'s fence test stubs `withPendingRows` as an effect. Before this change it passed only because the integer guard happened to reject its string arguments, so the handler must fence itself before delegating.
2. **Integer guard removed.** The NaN, 1.5 and NaN-`toIndex` cases are gone from 1d, since that input is impossible from the gesture.
   - 1d now covers the reachable cases.
   - A missing id is a no-op.
   - An out-of-range stale `fromIndex` with a valid id moves that row by the offset. This was RED on the original code, which threw a TypeError for an out-of-range `fromIndex`.
3. **Import numbering** uses `nextSetNumberForExercise`. Its semantics matched the hand-written loop: it skips rest rows, skips warmups (set 0) and normalizes with trim and lowercase. New test `4d` pins the reviewer's case: a warmup at set 0, a rest row, then `bench press ` and `  BENCH press` (set 3) give imported sets `4, 5`, with existing rows untouched and ops `[]`.
4. **Tests merged.** Duplicate tests 2a and 2b became one test: "2a reorder: commits the pending inline edit first, on its own row id, then moves the dragged row".
5. **This doc:** added the Current state summary and marked the stale lines historical or superseded.

Gates (real repo):
- `inSessionRiskSchedules`: 24/24.
- `p4OperationOutbox`, `sessionOwnership` and `p4AuthRecovery`: all pass.
- Full lib suite: **3624/3624, 0 todo, exit 0**.
- `tsc`: exit 0.
- `expo lint --max-warnings 0`: exit 0.
- Direct eslint on the six changed files: exit 0.
- `git diff --check`: clean.
