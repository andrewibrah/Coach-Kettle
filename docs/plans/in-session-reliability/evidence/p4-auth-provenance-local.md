# P4 auth / session-provenance repair — recovered, pending independent SPEC then QUALITY

Date: 2026-10-11. Branch `deps/audit-2026-09-25`, uncommitted. Recovers two interrupted workers
(`deleg_f7d10058`, `deleg_f8a98fd3`); their edits were preserved, not reimplemented.

## SPEC defects addressed

1. **Sign-out deleted recovery.** `contexts/AuthProvider.tsx` `clearAllCaches` called `clearWorkoutDraft`.
   It now calls `fenceWorkoutDraft()` synchronously before any async cleanup. Stored draft bytes survive
   sign-out, and pre-signout autosaves captured at the old generation are dropped.
2. **Session provenance across restore/edit/delivery.** Drafts carry `ownerId`. The route refuses
   foreign-owner or owner-less (legacy) recovery: bytes are kept unchanged, Start/import stay blocked and a
   notice is shown. `saveWorkoutDraft` refuses to overwrite foreign/legacy bytes, and
   `clearWorkoutDraft(ownerId, generation)` refuses another owner's draft. Route entry points check
   `canUseSession()`/`canStartSession()` against the current draft generation, so an auth change fences
   callbacks before React rerenders. `queueLiveRows` refuses to label A-session rows as B. AuthProvider
   fences on every owner change synchronously and ignores a stale initial `getSession()` that resolves
   after an auth event.

## Added in this recovery

- **Owner lockout (found by advisor review, reproduced RED).** The owner's own End cleanup advances the
  draft generation (`clearWorkoutDraft` bumps it before IO). Both guards compare against it, so the
  rightful owner could not Start after a successful End, or edit/retry after a failed cleanup.
  Fix: `restampOwner` in `app/(tabs)/index.tsx`. It runs only after the existing generation checks prove no
  auth fence intervened.
  - **Success:** `recoveryOwnerRef` is set to the current generation and `sessionProvenanceRef` is cleared
    (the session has ended).
  - **Failure:** both refs are set to the current generation, so the session continues.
  - **Coverage:** applied in both `onEndWorkout` (empty) and `handleEndWorkoutWithReview` (performed).
  - **Receipts:** RED `p4-auth-auth-lockout-red.log` (4 fail: guard false after End reached
    `end`/`phase:failed`), GREEN `p4-auth-auth-lockout-green.log` (21/0).
- `canStartSession` is memoized like `canUseSession`. `onResetForNewDay` deps are now
  `[draftChecked, setRows, canStartSession]`. This removes a stale-closure lint warning (and an unused
  `showToast` dep) that the interrupted edit introduced.

## Independent SPEC review round 1: FAIL, then repaired

A read-only reviewer subagent found two HIGH and two LOW defects that the permissive fixture guards hid.
Each one got a RED test before its fix (`p4-auth-review-red.log`: 3 fail; GREEN `p4-auth-review-green.log` 24/0).

1. **HIGH: the review modal could not close after a successful End.** `onClose` required
   `canUseSession()`, but `restampOwner` clears the session provenance on success. The new
   `ownsPresentation()` uses `canUseSession()` while the workout is active and `canStartSession()` after
   End. `onClose` now guards on it.
2. **HIGH: Settings → Clear Cache locked out the signed-in owner.** `clearAllCaches` fenced the draft even
   though the user didn't change. The fence moved to the top of `signOut` only.
3. **LOW: the rest-entry sink wasn't fenced.** It now also checks `canUseSession()`, which is listed in its deps.
4. **LOW: `onSaveReflection` wasn't fenced.** It now guards on `ownsPresentation()`.

Known remaining edges for the next review:
- A reflection typed while the phase is `saving`, after cleanup but before re-stamp, is dropped.
- ~~Account deletion calls `signOut`, so an owner-scoped draft stays on the device.~~ Decided and fixed:
  see "Account deletion clears the deleted user's draft" below.
- After End fails, the render-captured `draftGeneration` stays stale until the rerender (reviewer INFO).

**Round 2 re-review: PASS for findings 1-4** (reviewer ran 119/119 across the four touched suites).
Open items, not fixed here:
- ~~**MEDIUM, privacy:** account deletion → `signOut` only fences, so the deleted user's `workout_draft_v1`
  stays on the device.~~ **CLOSED 2026-10-13**: see "Account deletion clears the deleted user's draft" below.
- **LOW:** if the account-deletion re-auth lands on another account and React batches A→B→A into one render,
  the restore effect doesn't re-run and the stale refs lock A out until relaunch. Unlikely because of the two awaits.

## Account deletion clears the deleted user's draft (closes the MEDIUM item)

Product decision: once the server confirms the deletion, the deleted user's saved workout is removed from
the device.
- `lib/accountDeletion.ts` `runAccountDeletion` gains a `clearLocalDraft` dep. It is the **first**
  best-effort post-success step, ahead of cancel notifications, `signOut` and `signOutLocal`, because the
  clear is owner-checked and `signOut` fences the draft.
- `app/settings/delete-account.tsx` wires it to `clearWorkoutDraft(session.user.id)` and leaves the
  generation to default at call time.
- `clearWorkoutDraft` itself is unchanged. Its impact is **HIGH** (End-workout callers in
  `app/(tabs)/index.tsx`), so it is only called, not edited. Impact on `runAccountDeletion`: LOW (1 caller).
  `handleDelete` came back UNKNOWN; it is a local closure used only as `onPress`, confirmed by text search.
- Behaviour:
  - Another account's draft, or a legacy draft with no owner, is refused by the owner check and kept
    byte-for-byte. The thrown error is swallowed and sign-out still completes.
  - On cancelled or failed re-auth, wrong account, or server failure, the clear is never called.

Tests (`lib/__tests__/privacyRelease.test.ts`). The screen harness loads the **real** `lib/workoutDraft.ts`
over an in-memory AsyncStorage, so the owner check runs for real.
- **RED→GREEN (5).** RED: 5 fail on assertions against the pre-change sources, with 0 load errors.
  - lib success order includes `clearDraft` before `signOut`;
  - a throwing clear still runs cancel, `signOut` and `signOutLocal`;
  - screen password-success order includes `['clearDraft','user-1']`;
  - screen own draft removed;
  - screen foreign and legacy drafts kept, with the clear attempted as `user-1` and sign-out plus routing
    still running.
- **Guards** (green before and after): "kept when deletion does not happen" (5 failure paths), plus the
  existing exact-call-array lib tests for cancel, fail, wrong account and server error, now that the fixture
  records `clearDraft`.
- **Mutation:** wiring `clearWorkoutDraft()` without an owner fails 3 tests.
- **Harness note:** the AsyncStorage mock needs `__esModule: true`. Without it, TypeScript's default-import
  interop broke `getItem` and the foreign-draft test passed for the wrong reason.

Gates: `node --test --test-timeout=20000 "lib/__tests__/*.test.ts"` **3385 pass / 0 fail** (+4). `npm run
lint` exits 0 with no warnings; `tsc --noEmit` and `git diff --check` both exit 0.
Independent reviewer: PASS (read-only subagent: requirements 1-8 OK and mutation-checked; no reachable autosave race. 3 LOW: #1 RED on SyntaxError not an assertion, fixed with assert.ok and re-verified; #2 legacy/corrupt drafts stay by design; #3 refusal reason not asserted, covered by the (d)/(e) pair). No commit, push or remote Supabase command.

## Behaviour change flagged for review (superseded P1 assertion)

`onResetForNewDay` no longer calls `clearWorkoutDraft()` on inactive date rollover (prior worker's edit).
The rollover only runs when recovery is resolved and the workout is inactive. In that state no draft
owned by the current user can exist:
- restoring an own draft makes the session active;
- a foreign or legacy draft leaves recovery unresolved;
- successful End clears the draft;
- failed End cleanup keeps the session active.

So the old clear did nothing in practice. With owner checks, an owner-less call would also have
rejected. The retained P1 test
`resolved empty recovery still allows normal rollover then new session` now asserts `s.calls` `[]`
(was `['clear']`). Its rollover/new-session assertions are unchanged.

## Fixture-only updates (no original assertion weakened except the one above)

| File | Change | Reason |
|---|---|---|
| `workoutIdentityHarness.ts` | `restampOwner` no-op default | permissive-guard legacy fixtures. The P4 auth tests pass the real closure |
| `inSessionHarness.ts` | `canUseSession: () => true` default | parser/grammar route fixtures with no auth logic (2232 ReferenceErrors) |
| `workoutDraftLifecycle.test.ts` | `rows()` returns `Array.from(rows)` | restore effect now resets with a VM-realm `[]` (79 cross-realm deepEqual failures) |
| `workoutDraftLifecycle.test.ts` | delayed-restore fixture delays only the first `getItem` | owner-scoped clear performs its own read and hung on the never-released second promise |
| `sessionOwnership.test.ts` | `ownerId: 'offline-owner'` in two metadata fixtures | failure must come from the `removeItem` throw, not legacy-owner mismatch |
| `onboardingPersistence.test.ts` | mock `fenceWorkoutDraft` instead of `clearWorkoutDraft` | these tests assert onboarding cleanup, not workout-draft removal |
| `p4OperationOutbox.test.ts` | `workoutActive: true` in one `commitPendingAndGet` context | the guard reads `workoutActive` |
| `sessionFinalizationUi.test.ts` | `canUseSession`/`ownsPresentation` in JSX prop context | inline JSX handlers reference the guards |
| `sessionOwnership.test.ts` | `ownershipEffect` defaults `canUseSession: () => true` | rest-sink effect now reads the guard. The real-guard case lives in the P4 auth tests |
| `privacyRelease.test.ts` | `deletionDeps` records `clearDraft`; both success orders (lib + screen) now expect it before `signOut`; screen harness uses real `workoutDraft.ts` | account-deletion draft clear (2026-10-13). Stricter, not looser |
| `privacyRelease.test.ts` | signOut source regex also requires `fenceWorkoutDraft();` before `try` | the fence moved into signOut. The assertion is stricter, not looser |

## Verification (receipts in `~/.hermes/profiles/telegramlite/cache/scratch/p4-auth-*.log`)

- Pre-repair inventory `p4-auth-full-baseline.log`: 2232 `canUseSession` ReferenceErrors, 79 cross-realm, 2
  `fenceWorkoutDraft` mocks, 1 timeout, 3 others; all classified above. Prior approved baseline was
  3357/0 (`p4-recovery-full-memoized.log`).
- Final `node --test --test-timeout=20000 "lib/__tests__/*.test.ts"`: **3381 pass / 0 fail / 0 cancelled /
  0 skipped** (`p4-auth-full-final.log`; +24 P4 auth tests).
- `npm run lint` exit0 with **no warnings**; `./node_modules/.bin/tsc --noEmit` exit0; `git diff --check` exit0.
- `node --test "supabase/functions/_shared/*.test.ts"`: **66/13 fail, pre-existing and out of slice**
  (`p4-auth-shared.log`). `workoutValidation.test.ts` (Oct 10 01:09, I3) posts identity-free log-set bodies
  that the later P4 session protocol (`log-set/index.ts`, Oct 10 18:29) rejects with 400. No Edge file was
  touched here. Prior P4 receipts never ran this glob. This needs its own repair; it is not cleared.
- Graph: `impact` onEndWorkout LOW/0, handleEndWorkoutWithReview LOW/2 (sendMessage, onEndWorkout),
  onResetForNewDay LOW/0, canStartSession **UNKNOWN** (new/unindexed; text search shows only 8 in-route
  references). Aggregate `detect-changes --scope all`: **CRITICAL, 26 files/103 symbols/84 processes**,
  inherited from the whole dirty P4 tree, stale index, not an all-clear (`p4-auth-graph.log`).

## Limits

Offline VM fixtures over actual sources; no native/device AsyncStorage, real Supabase auth events, Deno
or deployed verification. No migration, deploy, install, commit or provider/live DB. Whole P4, P5 and the
edge-test drift above remain open. Next: independent SPEC, then QUALITY.
