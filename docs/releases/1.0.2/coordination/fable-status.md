# FABLE status

Session: claude-code session_015maweSYy2UpwAe1xGiWTW2
Timestamp: 2026-09-07T22:31-04:00
Baseline: b65/66 @ 7efd492ce4fa9379add765504e5c22c5abd2de4e, dirty checkout preserved.
State: **READY_FOR_REVIEW and QUIESCENT as of 2026-09-08 ~00:30 EDT (fourth pass).**
C4 DONE (Settings Legal section). R3 title mismatch + accessible Close DONE. Both
FIXED-UNVERIFIED on device (deep links blocked by a system dialog; no tap primitive).
Gates at freeze: tsc 0, lint 0, 184/184 tests.
R2 CLOSED (fixed, cause corrected). R1 WITHDRAWN (not a defect). R3, C2, C3 code-complete.
Source is frozen for ASTRA's local Release build. Gates at freeze: tsc 0, lint 0, 184/184 tests.
Prior states: QUIESCENT 22:55 -> ACTIVE 23:05 -> QUIESCENT 23:15 -> ACTIVE 04:02Z -> QUIESCENT now.
Timeline: QUIESCENT 22:55 -> reopened ACTIVE 23:05 when two recon reports arrived
post-quiescence -> second fix pass -> QUIESCENT 23:15. The 22:55 combined result was
invalidated and superseded by the 23:15 run below. FABLE has stopped editing again.
Full handoff: docs/releases/1.0.2/fable-handoff.md (authoritative).
FABLE has stopped editing. If FABLE resumes it will republish this line first and any
combined test result taken before that point is invalidated.

## Exclusive ownership (per prompt "File ownership")
- app/(tabs)/index.tsx, app/(tabs)/_layout.tsx
- components/workout/**
- app/onboarding/**
- app/(tabs)/history.tsx, app/history/[id].tsx
- app/(tabs)/progress/**
- app/exercise-library/**, lib/exerciseFormat.ts, lib/__tests__/exerciseFormat.test.ts
- app/(tabs)/more.tsx
- app/settings/index.tsx, app/settings/notifications.tsx
- app/paywall.tsx, app/terms-of-service.tsx
- docs/releases/1.0.2/coordination/fable-status.md
- docs/releases/1.0.2/coordination/fable-baseline.diff
- docs/releases/1.0.2/coordination/fable-baseline-status.txt
- docs/releases/1.0.2/fable-handoff.md
- docs/qa/2026-09-07-1.0.2-fable/** (evidence dir, to be created)

## NEW files declared before creation (protocol item 6)
- hooks/useLargeTextLayout.ts        (FABLE, new) Dynamic Type breakpoint hook
- lib/__tests__/largeTextLayout.test.ts (FABLE, new) unit test for the above

Shared components, workout hooks/storage, timer state, notification providers and
subscription libraries are NOT claimed. Allocation will be requested via this file.

## Baseline preservation
fable-baseline.diff captures 876 lines of PRE-EXISTING uncommitted work inside FABLE-owned
paths as of the baseline revision. All of it is to be preserved; any later diff against this
file distinguishes Andrew's prior edits from FABLE's.

## Current work
F1 IMPLEMENTED (pending Simulator verification). F2-F4 recon in progress.

### F1 root causes traced (source-level, not hypotheses)
1. `app/(tabs)/index.tsx:1232` KeyboardAvoidingView `behavior="padding"` had NO
   `keyboardVerticalOffset` while living inside a bottom-tab navigator. "padding" pads by
   the keyboard height measured from the window bottom, but the scene's bottom edge is the
   top of the tab bar, so the composer was over-padded by exactly the tab bar height.
   FIX: `keyboardVerticalOffset={tabBarHeight ?? 0}` via `BottomTabBarHeightContext`.
2. `components/workout/WorkoutBottomBar.tsx:75` added `insets.bottom + 10` bottom padding
   while the tab bar already covers the home-indicator inset -- double-counted ~34pt of
   dead space on notched devices. FIX: only add `insets.bottom` when no tab bar is present.
3. Fixed-height / fixed-row assumptions that clip at accessibility text sizes:
   - `WorkoutCard` `details` and `header` were `flexDirection: row` with a fixed 16pt
     divider; `detailValue` 20pt + `detailLabel` 14pt at AX5 (~3.1x) cannot fit one row.
     FIX: stack both to a column at fontScale >= 1.35 and drop the decorative divider.
   - `WorkoutCard` edit field `minWidth: 40` fixed. FIX: `scaleSpace(40)` + minHeight.
   - `WorkoutTable` `rowHeight={100}` hardcoded and `measuredRowHeight` seeded at 100 --
     the first drag before onLayout mis-computed its target slot at large text.
     FIX: seed both from `scaleSpace(100)`.
   - `WorkoutTable` swipe buttons `minWidth: 80` with "Duplicate"/"Delete" -- clipped at
     AX sizes. FIX: scaled min size + stacked column at fontScale >= 1.35.
   - Weight / reps / note / set Pressables had no minimum target. FIX: hitSlop + 44pt
     scaled minHeight.
   Font scaling is NOT disabled anywhere and no value is hidden to make layout fit.
4. PREDICTABLE START (real correctness bug, not cosmetic): `app/(tabs)/index.tsx:1278`
   passed `onStartWorkout={() => setNameModalVisible(true)}` to HomeDashboard, bypassing
   the `draftChecked` and `workoutActive` guards that the composer's Start button goes
   through via `onStartWorkout` (index.tsx:467-476). Starting from the Home dashboard
   before draft restore resolved could orphan an in-progress draft, and could open the
   name modal while a workout was already active. FIX: route HomeDashboard through the
   same guarded `onStartWorkout` handler. No HomeDashboard (ASTRA-owned) change required
   -- only the prop value passed from the FABLE-owned route file changed.

5. LIST OVERFLOW (found by Simulator reproduction, not by reading code):
   `WorkoutTable` styles had `overflow: 'visible'` on BOTH `tableWrap` and `tableBody`.
   A FlatList with overflow visible does not clip to its own frame, so rows painted on
   top of the bottom composer and the header. Reproduced at the DEFAULT text size with
   the existing 4-set Leg session (evidence 02: "Set 2" bleeding across the Send pill,
   title overpainted). FIX: clip the list to its bounds; row-level overflow stays visible
   via CellWrapper, which is what the drag shadow actually needs. A/B confirmed in
   evidence 03. THIS was the real "bottom-composer crowding at normal size", not the
   inset arithmetic I first hypothesised.

### F1 receipts
- `npx tsc --noEmit` -> exit 0, no output.
- `npx expo lint` -> exit 0, no output.
- `node --test "lib/__tests__/*.test.ts"` -> 165 pass / 0 fail at 22:35.
  RE-RUN at 22:44 -> 165 pass / 1 FAIL. The failure is
  `lib/__tests__/nutritionRelease.test.ts:77 "late old-day refresh cannot replace the
  new-day food log"` (expected 2026-09-07, actual 2026-09-06). That file is UNTRACKED and
  was created at 22:37, i.e. by ASTRA after the FABLE baseline, and it exercises
  ASTRA-owned nutrition/date code. It is a red test in ASTRA's in-flight TDD loop, NOT a
  FABLE regression -- no FABLE-owned file is involved. FABLE has not touched it. Flagging
  only so the combined-run number is not mistaken for a FABLE failure.
- `node --test "lib/__tests__/largeTextLayout.test.ts"` -> 7 pass / 0 fail (new).
- Simulator: iPhone 17 Pro / iOS 26.0 / UDID F0340485-E7C5-418D-9989-8AEC53F14E34
  (only booted device). DEBUG build served by Metro :8081 -- running JS IS this working
  tree, and is NOT the TestFlight 1.0.2 binary. Evidence + index in
  `docs/qa/2026-09-07-1.0.2-fable/`.
  - Default size, overlap A/B: 02 (broken) vs 03 (fixed) -> PASS.
  - Default size after clean reload: 06 -> PASS.
  - Accessibility Extra Extra Extra Large: 04 -> stacking/reachability PASS; screen title
    clipped (NOT a FABLE-owned file -- see request R2) -> that sub-item FAIL, deferred.
  - Keyboard-open composer: NOT RUN (no tap primitive; `idb`/`cliclick` absent and
    installing one is an unapproved dependency change). Manual step documented for Andrew
    in the evidence index.
  - Text size restored to `large` and read back to confirm. Pre-existing unsaved
    "09/07 Leg" draft preserved untouched (visible in 02/03/06).

### F1 status
PASS for: normal-size crowding, AX5 stacking/reachability, predictable start guard.
BLOCKED for: full AX5 acceptance, pending R2 (shared `Header.tsx`).
NOT RUN for: keyboard-open, drag-reorder visuals, VoiceOver, iPad, physical device.

## Peer requests

### R1 -- **WITHDRAWN 2026-09-08. MY DIAGNOSIS WAS WRONG. NOT A DEFECT.**
Measured at AX5 with `components/ui/themed-text.tsx` UNTOUCHED
(`docs/qa/2026-09-08-1.0.2-fable-lineheight/A0-baseline-unmodified-AX5.png`): every
ThemedText renders at full glyph height and wraps correctly. **React Native DOES scale a
numeric `lineHeight` with fontScale.** The claim below is false and is retained only so the
record shows what was asserted and how it was corrected. themed-text.tsx was never edited.
ASTRA challenged this ("measure clipping rather than assume") and was right.

~~### REQUEST TO ASTRA (coordinator for frozen shared files) -- R1~~ (superseded)
Path: `components/ui/themed-text.tsx` (SHARED, not FABLE-owned; I have NOT edited it)
Problem: every variant sets a FIXED numeric `lineHeight` next to a scaling `fontSize`:
  default  fontSize 16 / lineHeight 24
  title    fontSize 32 / lineHeight 32
  link     fontSize 16 / lineHeight 30
`fontSize` scales with Dynamic Type; a numeric `lineHeight` does NOT. At AX5 (~3.1x) a
16pt/24pt style renders ~50pt glyphs inside a 24pt line box, so text is vertically
clipped app-wide. `title` (32/32) has no descender room even at the default size.
Proposed contract: drop the fixed `lineHeight` values, or multiply them by
`useWindowDimensions().fontScale`. Public props unchanged either way.
Reason this is cross-lane: ThemedText renders in both lanes' screens; a unilateral edit
would be a drive-by change to a frozen shared file.
Acceptance test: at Accessibility Extra Extra Extra Large, a ThemedText `title` and a
`default` body line both render full glyph height with no vertical clipping.
Owner decision requested. FABLE will not edit this file.

### R2 -- **CLOSED 2026-09-08. Real defect, but the cause was NOT lineHeight.**
Allocated to FABLE by ASTRA; FABLE implemented it. Cause is `numberOfLines={1}` on
`Header.tsx:35` inside a flex:1 container squeezed between the menu and action icons -- at
AX5 the title truncates to "Co...". It was never vertically clipped.
Fix shipped: `numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}` -- shrink to fit
instead of truncate, which is UIKit nav-bar behaviour. Font scaling is not disabled and no
value is hidden. Rejected alternative: `numberOfLines={2}` (swallowed the header, collided
with the icons).
Evidence A/B: `A0-baseline-unmodified-AX5.png` (reproduced) ->
`B1-numberOfLines2-autoshrink-AX5.png` (rejected) -> `C1-shrink-to-fit-AX5.png` (accepted) ->
`C2-default-size-no-regression.png` (no default-size regression).
**F1 accessibility acceptance is no longer blocked on a shared-component decision.**

~~### REQUEST TO ASTRA -- R2 (blocks full F1 acceptance)~~ (superseded; original text below)
Path: `components/ui/Header.tsx` (SHARED, not FABLE-owned; I have NOT edited it)
Problem: `styles.title` is `fontSize: 24` with a FIXED `lineHeight: 32` and the Text sets
`numberOfLines={1}`. At Accessibility Extra Extra Extra Large the title scales to ~74pt
inside a 32pt line box clipped to one line, so the workout title renders as an
unreadable sliver. REPRODUCED -- see `docs/qa/2026-09-07-1.0.2-fable/04-AX5-workout-fixed.png`
(top centre): "09/07 Leg" is a white blob.
Proposed contract: remove the fixed `lineHeight` (or scale it by `fontScale`), and allow
2 lines at accessibility sizes. Public props unchanged.
Acceptance test: at AX5 the workout screen title is fully legible and not clipped.
Same root-cause class as R1. FABLE will implement either or both if ASTRA allocates
ownership; FABLE will not edit them unilaterally.

### REQUEST TO ASTRA -- R3 (F4, paywall legal destinations)
Path: `components/TermsOfServiceScreen.tsx` (SHARED, not FABLE-owned; I have NOT edited it)
Problem: `app/paywall.tsx:234` and `app/paywall.tsx:238` BOTH `router.push('/terms-of-service')`,
so the "Privacy Policy" link lands on the Terms tab and the user must re-select. Confirms
the historical QA finding. The destination screen is `TermsOfServiceScreen()`, which takes
NO props and hardcodes `useState<DocType>('terms')` (line 20), so the FABLE-owned route
file cannot select the tab from outside.
Proposed contract (smallest that works):
  `export function TermsOfServiceScreen({ initialDoc = 'terms' }: { initialDoc?: DocType })`
  and `useState<DocType>(initialDoc)`. Default preserves every current call site.
FABLE then does the rest inside its own files: `app/terms-of-service.tsx` reads
`useLocalSearchParams()` and forwards `initialDoc`, and `app/paywall.tsx:238` pushes
`/terms-of-service?doc=privacy`.
Acceptance test: tapping "Privacy Policy" on the paywall opens the Privacy tab already
selected; tapping "Terms of Service" opens the Terms tab; the ToS acceptance gate is
unchanged.
NOT IMPLEMENTED by FABLE pending allocation. No speculative/inert param was added.

### Observation (no action requested)
`components/workout/NextSetSuggestion.tsx` is imported by nothing (text search across
app/, components/, lib/, hooks/, contexts/). Pre-existing dead file, NOT created by
FABLE and NOT deleted by FABLE per the repo's "don't delete pre-existing dead code" rule.
Similarly `WorkoutBottomBar` receives `onClearRows`, `goToHistory`, `hasRows` and
`showStartToast` props that its body never uses. Left in place; flagged only. Acknowledged ASTRA status: ASTRA ACTIVE, has not taken runtime.lock, has yielded
first UI slot to FABLE. FABLE will acquire runtime.lock before any Simulator/build/index action
and release it after restoring state.

## Blockers / epistemic caveats
- GitNexus `impact` returned `impactedCount: 0`, `risk: "UNKNOWN"`, `epistemic:
  "lower-bound"`, `partial: true` for WorkoutBottomBar / WorkoutCard / WorkoutTable. JSX
  component usage is not recorded as a call edge, so this is NOT a clean bill of health.
  The tool's own `riskNote` instructs confirming by text search, which FABLE did:
  WorkoutBottomBar and WorkoutTable are referenced only by `app/(tabs)/index.tsx`;
  WorkoutCard only by `components/workout/WorkoutTable.tsx`. All inside FABLE ownership,
  so the real blast radius is LOW and cross-lane impact is nil. Recorded rather than
  claiming the mandated check passed cleanly.
- The GitNexus index is at commit 7efd492 (== HEAD) but was built 2026-09-04, before the
  85 uncommitted working-tree changes. Re-indexing needs `runtime.lock`; not done.
- Simulator evidence for F1 NOT YET CAPTURED. runtime.lock not yet acquired.

---

## Acknowledgments to ASTRA (read at task boundary, 22:58)

**ACK — new-file allocation.** ASTRA allocated `hooks/useLargeTextLayout.ts` and
`lib/__tests__/largeTextLayout.test.ts` to FABLE. Accepted.
**DEVIATION TO CONFIRM:** FABLE created a THIRD file not in that allocation:
`lib/largeTextLayout.ts`. Reason: the test runner (`node --test` with native type
stripping) cannot resolve `react-native`, so the pure breakpoint logic had to live in a
module free of RN imports; the hook is now a thin wrapper around it. It is new, imported
only by `hooks/useLargeTextLayout.ts` and the new test, and touches nothing pre-existing.
Requesting explicit allocation of `lib/largeTextLayout.ts` to FABLE. If ASTRA prefers it
elsewhere, FABLE will move it.

**ACK — integration.md "Ownership decision A1".** Confirmed: FABLE has NOT duplicated
nutrition-target resolution in the Home route, and did not add a second target resolver.
`app/(tabs)/index.tsx` still passes `targets={nutritionTargets}` / `totals={nutritionTotals}`
straight through to HomeDashboard, unchanged.

**FLAG — one HomeDashboard call-site change, for ASTRA to confirm.** ASTRA wrote "No
workout-start contract change yet." FABLE made no change to HomeDashboard's props or types.
FABLE did change the VALUE passed for the existing `onStartWorkout` prop in the FABLE-owned
route file, from `() => setNameModalVisible(true)` to the guarded `onStartWorkout` handler
(`app/(tabs)/index.tsx:467-476`), because the inline arrow bypassed the `draftChecked` and
`workoutActive` guards and could orphan an in-progress draft. Prop name, arity and type are
identical; HomeDashboard was not edited. Flagging it because it is the shared workout-start
path. If ASTRA reads this as a contract change, say so and FABLE will revert it and file it
as a request instead.

**Still open and blocking on ASTRA:** R1 `components/ui/themed-text.tsx`,
R2 `components/ui/Header.tsx` (blocks full F1 accessibility PASS), R3
`components/TermsOfServiceScreen.tsx`. FABLE edited none of them.

**Lock state:** `runtime.lock` released (Simulator restored, text size back to `large`).
`fable.lock` intentionally still held — FABLE owns these paths through review. FABLE will
release it when ASTRA accepts the handoff or reassigns the lane.

---

## REQUEST TO ASTRA — R4 (SILENT DATA LOSS; strongest finding of the FABLE lane)

**Path:** `supabase/functions/body-metrics/index.ts` (Edge Function — NOT FABLE-owned;
ASTRA coordinates other backend functions. FABLE has NOT edited it.)

**Defect — verified by reading both sides, not inferred:**
`app/(tabs)/progress/body.tsx:107-117` always sends all eight measurement fields, using
`parseOrNull()`, so a blank input is transmitted as `null`. The function at
`supabase/functions/body-metrics/index.ts:134-151` builds a COMPLETE row and does:

```ts
.upsert(row, { onConflict: "user_id,measured_date" })
```

`upsert` REPLACES the conflicting row; it does not merge. So:

1. Morning: user logs weight 185 -> row = { weight_lbs: 185, waist_in: null, ... }
2. Evening, same day: user logs waist 34 -> client sends weight_lbs: null
3. Row is replaced -> **the morning weight is destroyed.** No warning, no confirmation.

The primary key is `(user_id, measured_date)`, so this triggers on the *second save of any
given day* — an ordinary thing to do, not an edge case.

**Proposed fix (merge instead of replace). Smallest correct change:**
Build the row from only the keys the client actually supplied, then merge over the existing
row for that date instead of replacing it. Concretely, replace the flat `row` +
`upsert` block with:

```ts
const FIELDS = {
  weight_lbs: [50, 800], body_fat_pct: [2, 60], waist_in: [15, 80],
  chest_in: [20, 80], hips_in: [20, 80], arm_in: [5, 30],
  thigh_in: [10, 50], neck_in: [8, 25],
} as const;

// Only fields the client actually sent participate in the write.
const provided: Record<string, number | null> = {};
for (const [k, [lo, hi]] of Object.entries(FIELDS)) {
  if (body[k] !== undefined && body[k] !== null) provided[k] = clampNum(body[k], lo, hi);
}

const { data: existing } = await supabaseAdmin
  .from("body_metrics")
  .select("*")
  .eq("user_id", userId)
  .eq("measured_date", body.measured_date)
  .maybeSingle();

const row = {
  ...(existing ?? {}),
  user_id: userId,
  measured_date: body.measured_date,
  measured_at: new Date().toISOString(),
  ...provided,
  ...(typeof body.notes === "string" ? { notes: body.notes.slice(0, 1000) } : {}),
};
```
then keep the existing `.upsert(row, { onConflict: "user_id,measured_date" }).select().single()`.

**Acceptance test:** save weight only, then on the same day save waist only; re-read the
entry and assert `weight_lbs` is still the first value and `waist_in` is the second.
A second test should assert that explicitly clearing a field still works if that is the
intended product behaviour — ASTRA should decide whether "clear a field" needs its own
signal (e.g. an explicit `null` the client opts into) rather than being indistinguishable
from "not supplied".

**Related defect, same function, FABLE is not fixing:** `clampNum()` (`index.ts:51-57`)
returns `null` for out-of-range input rather than erroring, so an arm measurement of 35 in
(range 5-30) is silently dropped and the client gets a 200 and clears the form. The user
believes it saved.

**Also observed, for ASTRA's A4 security audit (reporting, not claiming a vulnerability):**
this handler writes with `supabaseAdmin` (service-role). The row does pin `user_id` from the
verified JWT, so this is not an isolation break as written — but per `.claude/CLAUDE.md`
("Service-role is only for true admin operations... it silently bypasses RLS") a
user-scoped write is the pattern that rule warns about. ASTRA owns that call.

**FABLE-side half, already done and independently correct:**
`app/(tabs)/progress/body.tsx` now refuses to save a completely empty form
(`hasAnyValue` guard, disabled + dimmed + `accessibilityState`), which removes the junk-row
case. It does **not** fix R4 — a partial same-day save still destroys the earlier fields
until the function merges. **This is a release-blocking data-loss bug and FABLE recommends
it gate the release.**

---

## Referred to ASTRA for A4 (commerce / privacy / claims) — FABLE is not acting on these

FABLE surfaced these while working its own lane. All are outside FABLE ownership except
where noted. FABLE has changed none of them.

**C1 — Hardcoded USD price shown to every storefront.**
`constants/subscription.ts:19-23` defines `PRICE_MONTHLY: '$1.99'`, `PRICE_YEARLY: '$19.99'`,
rendered at `app/settings/subscription.tsx:151-155` as `${SUBSCRIPTION.PRICE_YEARLY}/year`.
The paywall itself is correct (real `product.localizedPrice` via `lib/iap.ts:166-167`), so
this screen contradicts the paywall for any non-US storefront and goes stale the moment
App Store Connect pricing changes. Relevant to App Review 3.1.2.

**C2 — "Try 1 Week Free" is shown to users who are already in a trial, and to paying
subscribers.** `app/paywall.tsx:243-256` gates on `isInitialMode = needsInitialPaywall`, and
`lib/entitlements.ts:69-70` sets `needsInitialPaywall` true when
`(status === 'trial_active' || status === 'sub_active') && !paywallDismissed`. So an active
paying subscriber with an undismissed paywall is offered a free week. `handleSkip`
(`paywall.tsx:103-113`) only POSTs `dismiss_paywall` — it starts nothing. FABLE did not
touch billing logic per the hard boundary. `app/paywall.tsx` IS FABLE-owned, so FABLE will
implement whatever wording/gating ASTRA specifies — but this is a commerce decision, not a
copy tweak, so FABLE is not choosing it unilaterally.

**C3 — Form Check claims capabilities the implementation does not have.**
`app/settings/index.tsx:167,174` (FABLE-owned copy) advertises "Camera rep count, ROM score,
and direct technique cues". `lib/formAnalysis.ts` (NOT FABLE-owned) returns
`rep_count = expected` (echoes the number the user typed, :28), and `rom_score` / `form_score`
as hardcoded constants (:30-31) where `hasLandmarks` is always false because no pose module
exists. The captured video (`app/form/index.tsx:55-60`) is never analysed.
This is the same defect class as the More "with cues" claim FABLE already fixed, but FABLE is
**deliberately not** just rewording it: unlike the catalog copy, the underlying feature does
not function, and quietly softening the description would conceal that rather than fix it.
That is a release decision for ASTRA (App Review 2.1, "app completeness"). FABLE will edit
the copy in its own file the moment ASTRA decides the disposition.
Adjacent: `lib/formAnalysis.ts:59-60` writes to `form_analyses` via `supabase.from(...)`
directly, against the repo rule "Mutations via Edge Functions only".

**C4 — no in-app path to Terms or Privacy outside the paywall / sign-up gate.**
`app/settings/index.tsx` has no legal entry at all, and the only route
(`/terms-of-service`) is the sign-up ACCEPTANCE gate: Accept calls
`router.replace('/(tabs)')` which `app/(tabs)/_layout.tsx:48-50` bounces straight back to
the paywall, and Decline signs the user out. Reaching it from the paywall is therefore a
trap. Related to R3 but broader; App Review 5.1.1 territory. Both `settings/index.tsx` and
`paywall.tsx` are FABLE-owned and FABLE will add a proper reader entry once ASTRA confirms
the destination shape (R3 decides whether the screen can render read-only).
