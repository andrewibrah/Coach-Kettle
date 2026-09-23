# FABLE handoff — Coach Kettle 1.0.2

Session: claude-code `session_015maweSYy2UpwAe1xGiWTW2`
Baseline: branch `b65/66` @ `7efd492ce4fa9379add765504e5c22c5abd2de4e`, dirty checkout preserved.
Written: 2026-09-07 ~22:55 EDT.
State: **READY_FOR_REVIEW**, and **QUIESCENT** as of this document — FABLE has stopped
editing. If FABLE resumes, this file is republished first and any combined test result
taken before that point is invalidated.

---

## 1. Task status

| ID | Task | Status | Note |
|---|---|---|---|
| F1 | Workout accessibility + primary action | **PARTIAL PASS** | 4 of 5 sub-items verified on device. Full AX acceptance BLOCKED on request R2 (shared `Header.tsx`). Keyboard-open case NOT RUN. |
| F2 | Onboarding, History, Progress | **PARTIAL** | All 6 pluralization bugs, the bare score badge, the mislabelled volume unit, and the empty-form junk save FIXED. Onboarding Back-navigation defects and the partial-PR discard INVESTIGATED but **NOT FIXED** (see §7). |
| F3 | Exercise catalog presentation | **CODE COMPLETE, UNVERIFIED ON DEVICE** | Raw-slug rendering, empty sections, duplicate muscles, and inaccurate More copy all changed. A deep-link attempt was blocked by an iOS confirmation dialog, so NO screenshot of the detail screen exists. Compile+lint only. |
| F4 | Navigation, accessibility, paywall/legal UI | **PARTIAL** | Tab semantics, notification tap targets, stepper + Switch labels FIXED. Paywall legal destinations BLOCKED on R3. Paywall scrolling verified ALREADY CORRECT (it is in a ScrollView). Contrast / VoiceOver / iPad **NOT RUN**. |

Nothing here is a release sign-off. Several ledger items in my lane have **no evidence**
and are listed as NOT RUN rather than assumed.

---

## 2. Reproduced root causes vs remaining hypotheses

### Reproduced on device (evidence in `docs/qa/2026-09-07-1.0.2-fable/`)
1. **Normal-size composer crowding — CAUSE FOUND, and it was not what the QA report guessed.**
   `WorkoutTable` set `overflow: 'visible'` on both `tableWrap` and `tableBody`. A FlatList
   with visible overflow does not clip to its frame, so rows painted *on top of* the bottom
   composer and the header. Reproduced at the **default** text size with the pre-existing
   4-set Leg session (shot 02: "Set 2" bleeding across the Send pill, title overpainted),
   and A/B-confirmed fixed in shot 03. The QA report's hypothesis was the fixed composer;
   the actual mechanism is list clipping.
2. **Accessibility Extra Extra Extra Large clipping.** Reproduced (shot 04). Fixed for the
   set cards, composer and swipe actions. **Still broken for the screen title** — that is
   `components/ui/Header.tsx`, not a FABLE-owned file. See R2.

### Traced in source, correct by construction, NOT independently reproduced on device
3. `KeyboardAvoidingView` had no `keyboardVerticalOffset` inside a bottom-tab navigator.
4. `WorkoutBottomBar` added `insets.bottom` on top of a tab bar that already covers it.
   *Honest caveat:* 3 and 4 were both already in the tree before my first workout-screen
   screenshot, so I have **no true before/after** for them. They are compile-verified and
   code-reasoned only. If React Navigation v7 already reduces the scene's bottom inset,
   fix 4 is a harmless no-op rather than a correction.
5. **Unguarded workout start (real correctness bug).** `app/(tabs)/index.tsx` passed
   `onStartWorkout={() => setNameModalVisible(true)}` to HomeDashboard, bypassing the
   `draftChecked` and `workoutActive` guards at `index.tsx:467-476` that the composer's
   Start button goes through. Starting from Home before draft restore resolved could orphan
   an in-progress draft. Now routed through the guarded handler. Not exercised on device.

### Still a hypothesis, NOT verified
- That stacking at `fontScale >= 1.35` is the right breakpoint for AX1/AX2. Only AX5 was
  photographed. AX1 (~1.35) is the most common accessibility size and was not viewed.
- That the drag-reorder interaction still feels right now that the list clips. Not tested.

---

## 3. Files changed by FABLE

Edited (all inside FABLE's declared ownership):
- `app/(tabs)/index.tsx` — KAV offset, tab-bar height context, guarded start prop.
- `app/(tabs)/_layout.tsx` — explicit `tabBarAccessibilityLabel` on the 5 visible tabs.
- `app/(tabs)/history.tsx` — count pluralization, "Review n/10" score label + AX label.
- `app/settings/notifications.tsx` — stepper 32x32 -> 44x44, hitSlop, contextual AX labels.
- `app/exercise-library/[slug].tsx` — use the existing `formatTerm`/`formatTermList`, hide
  empty Cues / Common-mistakes cards, de-duplicate secondary muscles against primary.
- `app/(tabs)/more.tsx` — Exercise Library description changed from "Catalog of exercises
  with cues" to "Step-by-step instructions, muscles and equipment". **Verified against the
  data:** all 1,324 rows in `20260708000100_exercise_dataset_seed.sql` ship `cues='[]'` and
  `common_mistakes='[]'`; they do ship `instructions`. The old copy promised coverage the
  catalog does not have, and hiding the empty cue cards would otherwise have made that
  mismatch harder to notice rather than fixing it.
- `components/workout/WorkoutBottomBar.tsx` — tab-bar-aware bottom padding, scaled minimum
  target sizes, pills stack at `fontScale >= 2.0`, accessibility hints.
- `components/workout/WorkoutCard.tsx` — header and weight/reps stack at `fontScale >= 1.35`,
  decorative divider dropped when stacked, scaled edit field, 44pt scaled tap targets.
- `components/workout/WorkoutTable.tsx` — **list now clips to its bounds**, swipe actions
  scale and stack, drag fallback row height scales with Dynamic Type.

Created:
- `lib/largeTextLayout.ts` — pure Dynamic Type breakpoint logic (no RN import, so testable).
- `hooks/useLargeTextLayout.ts` — the React hook wrapper.
- `lib/__tests__/largeTextLayout.test.ts` — 7 tests.
- `docs/qa/2026-09-07-1.0.2-fable/**` — 6 screenshots + `screenshots-index.md`.
- `docs/releases/1.0.2/coordination/fable-*` — lock, status, baseline and current diffs.

### Pre-existing work preserved
`fable-baseline.diff` (876 lines) captured Andrew's uncommitted changes inside FABLE-owned
paths **before** any FABLE edit; `fable-current.diff` (1519 lines) is the same paths now.
The difference is FABLE's delta. Nothing was reverted, reformatted or deleted.
Files in the FABLE lane that FABLE deliberately did **not** touch, so their diffs are 100%
pre-existing: `app/exercise-library/index.tsx`, `components/workout/RestTimerToast.tsx`,
`components/workout/RestTimerBar.tsx` (a pre-existing deletion).

---

## 4. Requests to peer (ASTRA) — all BLOCKING, none actioned by FABLE

| ID | Path | Why it is ASTRA's | Blocks |
|---|---|---|---|
| R1 | `components/ui/themed-text.tsx` | — | **WITHDRAWN — not a defect. My diagnosis was wrong; file never edited.** |
| R2 | `components/ui/Header.tsx` | allocated to FABLE by ASTRA | **CLOSED — fixed, cause was `numberOfLines`, not `lineHeight`** |
| R3 | `components/TermsOfServiceScreen.tsx` | allocated to FABLE by ASTRA | in progress |

**CORRECTION (2026-09-08).** I originally reported R1/R2 as one defect class: a fixed
numeric `lineHeight` beside a scaling `fontSize`, on the theory that `lineHeight` does not
scale. ASTRA challenged that and told me to measure instead of assume. I measured, and
**the theory was wrong — React Native does scale numeric `lineHeight` with `fontScale`.**
R1 is withdrawn outright and `themed-text.tsx` was never touched. R2 was a real defect with
a different cause: `numberOfLines={1}` truncating the title to "Co..." in a width-starved
container. Fixed by shrinking to fit. The original claim was an inference from a blurry
screenshot presented as a mechanism; that was my error, not a data problem. Exact proposed contracts and acceptance tests are in
`coordination/fable-status.md`. **FABLE edited none of these three files** and added no
speculative/inert code in anticipation. FABLE will implement any of them if ASTRA allocates
ownership.

Also for ASTRA's F1 cross-lane contract: the QA report's "workout initiation requires a
second naming modal after tapping the planned workout card" is **not fixed**. Removing that
redundancy needs HomeDashboard to pass the planned workout through instead of opening the
name modal, which is ASTRA-owned. FABLE did not create a second start path to work around it.

---

## 5. Commands run and actual results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx expo lint` | exit 0, no output |
| `node --test "lib/__tests__/largeTextLayout.test.ts"` | 7 pass / 0 fail |
| `node --test "lib/__tests__/*.test.ts"` @22:35 | 165 pass / 0 fail |
| `node --test "lib/__tests__/*.test.ts"` @22:55 | 166 tests, **165 pass / 1 fail** |
| `npx tsc --noEmit` @23:15 (final) | exit 0, no output |
| `npx expo lint` @23:15 (final) | exit 0, no output |
| `node --test "lib/__tests__/*.test.ts"` @23:15 (final) | 166 tests, **165 pass / 1 fail** — same single ASTRA test, unchanged |

The single failure is `lib/__tests__/nutritionRelease.test.ts:77` "late old-day refresh
cannot replace the new-day food log" (expected `2026-09-07`, actual `2026-09-06`). That file
is **untracked and was created at 22:37**, after the FABLE baseline, and exercises
ASTRA-owned nutrition/date code. It is a red test in ASTRA's in-flight TDD loop, **not a
FABLE regression** — no FABLE-owned file participates in it. FABLE did not touch it. The
combined green run is ASTRA's to produce once both lanes are quiescent.

Not run: Deno checks (no Deno on PATH; FABLE changed no Edge Function). No migrations and
no Edge Function changes were needed in this lane — **FABLE's lane requires no
`supabase db push` and no `supabase functions deploy`.** The only user action for FABLE's
work is reloading the app.

### GitNexus (mandated check — reported honestly)
`impact(direction: "upstream")` on `WorkoutBottomBar`, `WorkoutCard` and `WorkoutTable` each
returned `impactedCount: 0`, `risk: "UNKNOWN"`, `epistemic: "lower-bound"`, `partial: true`.
JSX component usage is not recorded as a call edge, so **this is not a clean bill of health
and is not being reported as one.** The tool's own `riskNote` says to confirm by text
search; FABLE did: `WorkoutBottomBar`/`WorkoutTable` are referenced only by
`app/(tabs)/index.tsx`, and `WorkoutCard` only by `WorkoutTable.tsx`. Real blast radius is
LOW and entirely inside FABLE ownership. No HIGH/CRITICAL warning was returned or suppressed.
The index is at HEAD's commit but was built 2026-09-04, before the ~85 dirty files;
re-indexing needs `runtime.lock` and was not done. `detect_changes()` was not run because
FABLE is making no commit.

### Tested build identity
iPhone 17 Pro, iOS 26.0, UDID `F0340485-E7C5-418D-9989-8AEC53F14E34` (the only booted
device). **Debug build served by Metro on :8081** — bundle contains `CoachKettle.debug.dylib`
and `EXDevLauncher` and has no `main.jsbundle`, so the JS under test is this working tree.
**This is not the TestFlight 1.0.2 binary, and none of this evidence says anything about
what is in that binary.** `app.json` marketing version is `1.0.2`; FABLE changed no version,
build number, or EAS/app config.

---

## 6. Simulator state disclosed
- The pre-existing unsaved **"09/07 Leg" draft** (Squat sets 1-3, Leg extension set 1) is
  still present and was never saved, cleared or edited. No sets added or removed.
- `content_size` was set to `accessibility-extra-extra-extra-large` and **restored to
  `large`**, read back to confirm. The pre-change value was not captured first; `large` is
  inferred from shots 01-03 showing default metrics.
- A live `content_size` change leaves the app in a stale layout — shot 05 is that artifact
  and is explicitly marked "do not cite" in the evidence index. Shot 06 is the clean reload.
- `runtime.lock` was acquired twice and released both times. `fable.lock` is still held and
  should be released once review is accepted.

---

## 7. Unresolved risks and what FABLE did NOT do
- **`tabBarAccessibilityLabel` is a real option** in `@react-navigation/bottom-tabs` v7
  (`types.d.ts:135`), so the key is not silently ignored — but **no VoiceOver test was run**,
  so the corrected "N of 5" announcement is unverified. Treat F4's tab item as "code change
  made, announcement unverified", not as confirmed fixed.
- **`difficulty` is a plain enum** (`'beginner' | 'intermediate' | 'advanced'`), not a
  dataset slug. Running it through `formatTerm` only title-cases it ("Beginner"), matching
  its sibling fields; it is non-null per the type, so the `'—'` fallback is unreachable.
  Deliberate, and called out here because it is the one F3 edit that is polish rather than
  a slug fix.
- **INVESTIGATED, CONFIRMED, DELIBERATELY NOT FIXED** (real defects, but the fix is riskier
  than the bug this late, and none is a release gate — all are documented with file:line so
  they can be scheduled):
  - Onboarding Back is `router.push`, not `router.back()`, on all 12 handlers, while
    `app/onboarding/_layout.tsx:12` sets `gestureEnabled: false` — so the stack grows
    unbounded and screens remount. Worse, `workout-setup.tsx:146` -> `pr-values.tsx:105-109`
    is a bounce loop for any user who skipped PR lifts. FABLE did not attempt this: it is a
    12-site navigation refactor interacting with a resume path, and a half-fix could break
    onboarding entry outright. Recommend a dedicated pass.
  - `app/onboarding/pr-values.tsx:52-68` silently discards a PR when only one of
    weight/reps is filled, with Continue never disabled and no message.
  - `app/onboarding/height.tsx:188` — switching units discards the entered value, and the
    validator then reads the empty field as an intentional skip, writing `null`.
  - Four vague Progress empty states (`body.tsx:209`, `resting-hr.tsx:165`,
    `photos.tsx:177`, `strength.tsx:124`), and `progress/index.tsx:162` renders the literal
    string "Last logged never".
- **VERIFIED ALREADY CORRECT — no change needed** (recorded so nobody re-opens them):
  the Pro gate at `progress/strength.tsx:50-80` is titled, explained and has an upgrade CTA;
  `body.tsx:38-47,174-176` labels units on every field; the paywall content genuinely is
  inside a `ScrollView` (`paywall.tsx:139`) so Restore and the legal links are reachable;
  paywall pricing is real localized StoreKit (`product.localizedPrice` via
  `lib/iap.ts:166-167`), not hardcoded; `href: null` correctly renders no phantom tab
  button; and `HapticTab` spreads all accessibility props through to `PlatformPressable`.
- **NOT INVESTIGATED (no evidence either way):** More-screen discoverability;
  measured contrast.
- **NOT RUN (needs a device or a tool this session lacks):** keyboard-open composer, actual
  VoiceOver traversal, measured contrast, small iPhone, iPad, Reduce Motion, physical
  device. `simctl` has no tap primitive and neither `idb` nor `cliclick` is installed;
  installing one is an unapproved dependency change.
- Two read-only recon subagents were dispatched for F2/F3/F4 and **went idle without
  returning reports**. Their findings are therefore absent, and nothing in this document is
  attributed to them. The F2/F3/F4 fixes above were grounded directly in
  `docs/qa/2026-09-06-uiux/QA_REPORT.md` and in files FABLE read itself.
- No commits, pushes, deploys, builds, purchases, credentials, or account actions.

## 9. Second work pass (post-quiescence), and what it changed

Two read-only recon subagents returned **after** FABLE declared QUIESCENT. FABLE republished
its status as ACTIVE (invalidating the 22:55 combined result), verified each claim against
the source before acting, and fixed the confirmed defects that sit in FABLE-owned files.
Every fix below was independently re-read at the cited line first — none was applied on the
subagents' word alone. The subagents produced no code.

Corroborated (already fixed in pass 1, independently found again): history pluralization at
`:228/:231/:270`, the bare `n/10` badge, all five raw-slug sites in `[slug].tsx`, the
`more.tsx` cue claim, the 32x32 steppers, and the tab-count mechanism — recon pinned it to
`BottomTabBar.tsx:429-435` using unfiltered `state.routes`, which is exactly what
`tabBarAccessibilityLabel` overrides. That raises confidence in the F4 tab fix from
"plausible" to "mechanism confirmed", though still VoiceOver-unverified.

Newly fixed in pass 2 (all verified at the line, all FABLE-owned):
- `app/history/[id].tsx:357` — "1 sets".
- `app/onboarding/workout-setup.tsx:317,319` — "1 sets" / "1 reps". `tsc` caught that these
  are strings, not numbers; the comparison was corrected to `Number(...) === 1`.
- `app/(tabs)/progress/strength.tsx:155` — Volume was labelled `lb`. Volume is weight x reps,
  so it is now `lb·reps` and thousands-separated. It sat directly under "Top weight 225 lb",
  inviting a nonsense comparison.
- `app/settings/notifications.tsx` — the 12 category Switches and the rest-timer Switch had
  no `accessibilityLabel` and no `accessibilityState.disabled`, so VoiceOver gave no name
  and no reason they were inert when permission is denied. Both added.
- `app/settings/index.tsx` — Dark Mode Switch had no label; the text and the control were
  two unlinked elements. Added.
- `app/(tabs)/progress/body.tsx` — Save was enabled on a completely empty form and wrote a
  dated row of eight nulls that renders "No fields recorded.". Now guarded, dimmed, and
  announced as disabled with a hint.

## 10. Release-blocking defect FABLE found but cannot fix — R4

`supabase/functions/body-metrics/index.ts:134-151` upserts a COMPLETE row on
`(user_id, measured_date)`. `upsert` replaces, it does not merge, and the client always
sends all eight fields with blanks as `null`. **A second body-metrics save on the same day
destroys the fields saved earlier that day, silently.** FABLE verified both sides by reading
them. This is ordinary usage, not an edge case.

The Edge Function is not FABLE-owned, so FABLE wrote a complete ready-to-apply merge patch
and an acceptance test into `coordination/fable-status.md` (R4) rather than editing it.
FABLE fixed only the client-side half it owns (the empty-form guard), which removes the
junk-row case but **does not** fix the data loss.

**FABLE's recommendation: this should gate the release.** It is silent, permanent user-data
loss in a shipped feature.

*Note on scope:* this is the only place FABLE's lane touched anything backend, and FABLE did
not deploy or migrate anything. If ASTRA applies R4, that becomes a
`supabase functions deploy body-metrics` for Andrew — the one action that would change
FABLE's earlier "no db push, no functions deploy" statement.

## 12. Final state (2026-09-08, after the cross-agent working session)

FABLE worked a second and third pass after the original handoff, in file-based coordination
with ASTRA (which turned out to be the Hermes session holding `astra.lock`, not a separate
ChatGPT session). Message log: `docs/releases/1.0.2/coordination/inbox/`.

| Item | State | Verified how |
|---|---|---|
| R1 `themed-text.tsx` | **WITHDRAWN — not a defect** | Measured at AX5; file never edited |
| R2 `Header.tsx` truncation | **FIXED** | 4-shot A/B on device |
| R3 `initialDoc` / `readOnly` | **FIXED** | tsc/lint only |
| R3 modal title mismatch | **FIXED** | tsc/lint only |
| R3 reader Close affordance | **FIXED** | tsc/lint only — **not exercised** |
| C2 paywall CTA | **FIXED** | tsc/lint only |
| C3 Form Check copy | **FIXED** | tsc/lint only |
| C4 Settings Legal entry | **FIXED** | tsc/lint only |
| R4 body-metrics data loss | **ASTRA fixed; FIXED-UNVERIFIED** | reviewed by FABLE; no real-DB test |
| Coach workout-evidence defect | **FOUND by FABLE, fixed by ASTRA** | ASTRA reports Deno 10/10 |

Final gates observed by FABLE: `npx tsc --noEmit` 0, `npx expo lint` 0,
`node --test "lib/__tests__/*.test.ts"` 184/184.

### Two corrections FABLE made to its own earlier claims
1. **R1/R2 mechanism was wrong.** I reported "a numeric `lineHeight` does not scale with
   Dynamic Type" as the cause of app-wide clipping. ASTRA told me to measure instead of
   assume. I measured: RN *does* scale numeric `lineHeight`. R1 was withdrawn outright and
   R2's real cause was `numberOfLines={1}`. Had I not been challenged I would have edited a
   working shared component for a fabricated reason.
2. **My R4 patch was racy.** ASTRA rejected my read-then-upsert merge as TOCTOU and shipped a
   sparse-payload write instead, which has no read step at all. I withdrew mine and verified
   theirs aborts before any write.

### What FABLE contributed that neither lane had alone
- The real cause of normal-size composer crowding (`overflow: 'visible'` on the list),
  which the historical QA report had attributed to the fixed composer.
- The body-metrics same-day data-loss defect.
- The Coach workout-evidence defect: a failed workout query was read as a confirmed missed
  workout, which both asserted a false negative to the user and incremented the harshness
  state machine off a database error.

### Honest limits on this whole lane
No VoiceOver traversal, no measured contrast, no physical device, no iPad, no keyboard-open
composer test, and no tap-driven journey anywhere — `simctl` has no tap primitive, `idb` and
`cliclick` are absent, and deep links are blocked by a system confirmation dialog. Everything
marked "tsc/lint only" above is genuinely unexercised. The manual tap-throughs are written out
in `docs/qa/2026-09-08-1.0.2-fable-legal/screenshots-index.md`.

**FABLE does not assert release readiness.** ASTRA owns the verdict.

## 11. One concrete next action for ASTRA
Decide R2 (`components/ui/Header.tsx`). It is the only thing standing between F1 and a full
accessibility PASS, and it is a two-line change with a written acceptance test.
