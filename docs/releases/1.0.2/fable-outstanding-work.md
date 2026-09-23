# Coach Kettle 1.0.2 — Outstanding work (found, not fixed)

Author: FABLE lane. Compiled 2026-09-08 after the ASTRA/FABLE working session.
Release verdict at time of writing: **HOLD** (see `RELEASE_CHECKLIST.md`, ASTRA-owned).

Every line reference below was re-verified against the working tree when this file was
written. Where a finding came from a read-only recon pass and I could **not** confirm it
myself, it is marked `[unverified]`. Nothing here is a guess.

Legend — **Sev**: P1 blocks or loses user data · P2 real user harm · P3 polish/debt
**Owner**: FABLE / ASTRA / product decision

---

## 1. Onboarding — confirmed bugs, deliberately deferred

- [ ] **P1 · FABLE · Back is a dead end for anyone who skipped PR lifts (bounce loop).**
      `app/onboarding/workout-setup.tsx:146,184,214,351` push `/onboarding/pr-values` on Back;
      `app/onboarding/pr-values.tsx:105-109` immediately `router.replace`s back to
      `/onboarding/workout-setup` when `trackedLifts.length === 0`. Step 8 therefore has **no
      working Back** for those users. Verified.
- [ ] **P2 · FABLE · All 12 Back handlers use `router.push`, never `router.back()`.**
      `current-weight`, `age`, `goal-weight`, `focus`, `pr-lifts`, `height` (1 each),
      `pr-values` (2), `workout-setup` (4). The stack grows unbounded, the transition animates
      forwards on a backwards action, and screens remount. `app/onboarding/_layout.tsx:12` sets
      `gestureEnabled: false`, so this button is the only exit — there is no swipe fallback.
      *Not fixed because:* a 12-site navigation refactor entangled with the resume path is
      riskier than the bug this late in a release. Wants its own pass, not a release patch.
- [ ] **P1 · FABLE · Partial PR silently discarded.** `app/onboarding/pr-values.tsx:54` requires
      `weight.trim() && reps.trim()`; otherwise it returns unchanged with no message, and
      Continue is never disabled. Enter 225 with reps blank, tap Finish → the PR is gone.
- [ ] **P1 · FABLE · Unit toggle destroys the entered height.** `app/onboarding/height.tsx:188`
      `onSelect={setUnit}` swaps units without converting or clearing. The validator then reads
      the now-empty field as an intentional skip and writes `null`. Height lost, no error.
- [ ] **P3 · FABLE · Skip semantics are inconsistent.** `pr-lifts` clears `tracked_lifts` on
      Skip; every other Skip only advances `current_step`, leaving prior answers intact.
- [ ] **P3 · FABLE · Resume off-by-one.** `app/onboarding/index.tsx` compares
      `step < routes.length` while `workout-setup` writes `current_step: 8` and `routes` has 8
      entries, so a fully-completed user restarts at height. `[unverified]`

## 2. Exercise catalog — the half I did not close

- [ ] **P2 · FABLE · Exercise NAMES are never formatted anywhere.** 1,322 of the 1,324 seeded
      rows have a lowercase initial (`"air bike"`, `"ez barbell curl"`, `"3/4 sit-up"`).
      Rendered raw at `app/exercise-library/index.tsx:86` and as the 26pt screen title at
      `app/exercise-library/[slug].tsx:95` — so the detail screen's largest text is a lowercase
      database string.
      **`formatTerm` cannot be reused for this.** Its override table is keyed on whole strings
      (`lib/exerciseFormat.ts:9-31`), so multi-word names would title-case into `"Ez Bar…"` —
      exactly the corruption its own test at `lib/__tests__/exerciseFormat.test.ts:27-31`
      guards against. This needs a separate name formatter plus its own tests.
      *I fixed the metadata (category / equipment / muscles) and left the names.*
- [ ] **P3 · FABLE · Lossy override.** `lib/exerciseFormat.ts:12` maps `leverage_machine` →
      `'Machine'`, collapsing 81 rows to a bare "Machine".
- [ ] **P3 · FABLE · Formatter untested for override-less equipment tokens** —
      `stepmill_machine`, `elliptical_machine`, `assisted`, `weighted`, `hammer`, `tire`.
- [ ] **P3 · ASTRA · Duplicate ad-hoc formatter** at
      `app/settings/nutrition-preferences.tsx:143` (`v.replace(/_/g, ' ')`, no title-casing).
      `[unverified]`

## 3. Accessibility — below the line, and unmeasured

- [ ] **P2 · shared · Touch targets under 44pt.**
      `components/ui/screen-header.tsx:103-106` back chevron = 24pt icon + 8pt padding ≈ **40pt,
      and it appears on every screen in the app**. Also `app/exercise-library/index.tsx:238`
      filter pills (≈36pt) and `:270` Retry / Clear filters (≈40pt). None carry `hitSlop`.
- [ ] **P2 · FABLE · R2 shrink-to-fit is not accessibility-certified.** `minimumFontScale={0.5}`
      in `components/ui/Header.tsx` was measured for the literal string "Coach Kettle" on one
      device. **Untested:** long workout titles (the header renders date + name, e.g.
      "09/07 Upper Body Push Day"), small iPhones, iPad. 0.5 is a floor, so a long title can
      still truncate.
- [ ] **P1 · both · No VoiceOver traversal, no measured contrast, no physical device, no iPad,
      no Reduce Motion, no keyboard-open composer test — anywhere in the release.**
      Cause: `simctl` has no tap primitive, `idb`/`cliclick` are not installed (adding one is an
      unapproved dependency change), and deep links are blocked by an iOS confirmation dialog.
      This is the single largest evidence gap in the FABLE lane.

## 4. Progress / History polish

- [ ] **P3 · FABLE · Four empty states state a fact but no cause and no next action:**
      `app/(tabs)/progress/body.tsx:217` "No measurements yet.",
      `resting-hr.tsx:165` "No entries yet.", `photos.tsx:177` "No photos yet.",
      `strength.tsx:125` "No data yet for this exercise."
      Use `app/(tabs)/history.tsx:295-298` as the template — it is the good one.
- [ ] **P3 · FABLE · `app/(tabs)/progress/index.tsx:163` renders the literal string
      "Last logged never"** via `recentMetrics[0]?.measured_date ?? 'never'`.
- [ ] **P3 · FABLE · Pro gate is invisible until tapped.** The "Strength progression" NavCard
      (`app/(tabs)/progress/index.tsx:139`) carries no lock or Pro marker; the gate itself
      (`strength.tsx:50-80`) is well built, but a free user only meets it after navigating.
- [ ] **P2 · FABLE · `app/(tabs)/progress/body.tsx` has no client-side range validation.**
      ASTRA's handler now returns 400 for out-of-range input, so nothing is silently dropped
      any more — but the client still submits and surfaces a server error rather than
      pre-empting it inline.
- [ ] **P2 · FABLE · Reflection edit reverts after a successful save.**
      `app/history/[id].tsx:438` Cancel reads `workout.reflection` from stale state that
      `handleSaveReflection` never refreshes, so a saved reflection appears lost until reload.

## 5. Theme-rule violations (repo rule: `useThemeColor()`, no hardcoded hex)

- [ ] **P3 · FABLE · `app/settings/index.tsx`** — 6 hardcoded values: `:35` `#3d2d00`/`#FFF8E6`,
      `:36` `#3d1515`/`#FFF1F0`, `:98` and `:148` `#FFD700`, `:229` `#767577`,
      `:432` `rgba(0,0,0,0.05)`. Plus dead styles `optionsContainer`/`optionRow`/
      `optionSelected`, referenced nowhere.
- [ ] **P3 · shared · `components/ui/screen-header.tsx:109`** and
      **`components/TermsOfServiceScreen.tsx:292`** hardcode colors. `[unverified]`

## 6. Commerce / content

- [ ] **P3 · ASTRA · Benefit copy is duplicated and divergent.** `app/paywall.tsx:25` defines a
      local `FEATURES`; `constants/subscription.ts:58` exports `PRO_FEATURES` with different
      wording and a different analytics icon. `PRO_FEATURES` appears unused by the paywall.
- [ ] **P2 · product decision · Form Check has no working feature.** The dishonest copy is fixed
      and `lib/formAnalysis.ts` now throws `FORM_ANALYSIS_UNAVAILABLE` instead of fabricating
      scores — but the route and entry point still exist and lead nowhere useful. Whether to
      hide the feature for 1.0.2 is a product call, not a code gap.

## 7. Backend notes not actioned

- [ ] **P2 · ASTRA · `supabase/migrations/0036_progress_tracking.sql:28` is now factually wrong.**
      `COMMENT ON TABLE … 'One entry per day; updates replace.'` Updates **merge** since the R4
      fix. This comment is exactly how that data-loss bug grows back. Needs a follow-up
      migration or a checklist entry — agreed not to rewrite shipped migrations.
- [ ] **P2 · ASTRA · R4 has no real-database test.** The sparse-write behaviour is established
      by reading PostgREST `QueryBuilder.hs` and by handler-boundary tests. The actual failure
      mode — write weight, then write waist the same day, assert both survive — has never been
      executed. Ledger state is correctly `FIXED-UNVERIFIED`.
- [ ] **P3 · ASTRA · Service-role used for user-scoped operations.**
      `supabase/functions/body-metrics/index.ts` and `daily-feedback/index.ts` read/write with
      `supabaseAdmin`. Both pin `user_id` from the verified JWT so this is **not** an isolation
      break, but it is the pattern `.claude/CLAUDE.md` explicitly warns about.
- [ ] **P3 · ASTRA · Inconsistent blank-field contract in body-metrics.** A blank metric means
      "leave unchanged", but `notes: ""` would clear. A notes-only update is rejected 400 by the
      `some()` guard. Unreachable today (`body.tsx` has no notes input); will bite whoever adds
      one.

## 8. Pre-existing dead code — left deliberately, per repo rule 3

*"If you notice unrelated dead code, mention it — don't delete it."* None of this was created by
this session.

- [ ] `app/(tabs)/history.tsx:44-51` computes `volume` and never renders it.
- [ ] `components/workout/NextSetSuggestion.tsx` is imported by nothing.
- [ ] `components/workout/WorkoutBottomBar.tsx` accepts `onClearRows`, `goToHistory`, `hasRows`
      and `showStartToast` and uses none of them.

## 9. Never investigated

- [ ] More-screen discoverability (Settings reportedly below the fold).
- [ ] Meal plans, barcode scanner, and Form Check end-to-end.
- [ ] Nutrition/Coach beyond A1 and R4 — the FABLE read-only review stopped there so ASTRA was
      not blocked from building.

## 10. Fixed but never seen running (`tsc`/lint only)

- [ ] C4 Settings Legal rows · reader modal title · reader Close button
- [ ] C2 paywall CTA · C3 Form Check copy · R3 `initialDoc`/`readOnly` props
- [ ] **Highest-value single check:** sign out and back in, and confirm the acceptance gate
      still shows Accept / Decline with **no** Close button. The R3 change is conditional and I
      believe it is right, but "the legal gate became dismissible" is the failure mode with real
      consequences and it has not been exercised.

---

## If only three things get done

1. **The onboarding bounce loop** (§1) — users can get genuinely stuck.
2. **Exercise name formatting** (§2) — the most-read text in the app is raw database output.
3. **One real two-write test for R4** (§7) — the only silent data-loss bug in the set, and its
   fix is currently unproven against the exact thing it fixes.
