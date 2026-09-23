# Coach Kettle UI/UX QA Report — 2026-09-06

## Executive verdict

- Overall readiness: **Hold public/TestFlight release sign-off.** The app has a strong visual foundation and broad feature coverage, but the active workout UI fails at accessibility text sizes, Nutrition can remain on the prior calendar day after midnight, and Coach presents confident calorie praise when its own nutrition status is unavailable.
- Biggest blocker: **Active workout logging becomes heavily clipped and vertically distorted at Accessibility Extra Large**, obstructing a core flow (`20-home-accessibility-text.png`).
- Biggest quick win: Replace raw/internal Coach status (`nutrition n/a`, `score —`, `harshness 0`) with a grounded insufficient-data state.
- Best next engineering pass: Fix Dynamic Type layout and date freshness first; then make Home/Nutrition targets consistent and normalize Exercise Library content.
- No app code was edited. Simulator data was not erased. No credentials, passwords, purchases, restore actions, sign-out actions, account dialogs, camera/photo permission dialogs, or payment sheets were used.

## Environment

- Date/time: QA began 2026-09-06 EDT and continued through 2026-09-07 18:13 EDT after interruptions.
- Simulator/device: iPhone 17 Pro, iOS 26.0, UDID `F0340485-E7C5-418D-9989-8AEC53F14E34`.
- App bundle/version: `com.coachkettle.coachkettle`; installed version 1.0.2, build 1. `app.json` is 1.0.2; `package.json` is 1.0.0.
- Repo path: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.
- Git status: dirty working tree, 84 porcelain entries at final check: 48 tracked changes/deletions and 36 untracked entries. `docs/qa/` is untracked. Existing unrelated changes were preserved.
- UI configuration: dark in-app appearance; simulator content size restored to `large`; Increase Contrast restored to `disabled`; simulator appearance reports `light`.
- Runtime note: Expo development tooling produced a floating gear overlay and earlier React LogBox warning. The gear is not treated as production app UI.

## Method

### Tools used

- `xcrun simctl` for booted-device confirmation, app launch, deep-link navigation, UI configuration, and primary PNG screenshots.
- CUA `computer_use` for visual inspection, accessibility-tree inspection, safe clicks, transitions, and fresh post-action verification.
- Terminal/read-only source inspection for likely-file attribution and runtime corroboration.
- No code editing, entitlement bypass, database manipulation, or simulator reset.

### Commands run

- `date +%F`, `date '+%F %T %Z %z'`.
- `git status --short`.
- `xcrun simctl list devices booted`.
- `xcrun simctl launch booted com.coachkettle.coachkettle`.
- `xcrun simctl appinfo booted com.coachkettle.coachkettle`.
- `xcrun simctl openurl booted 'exp+coachkettle://<route>'` for route-level coverage.
- `xcrun simctl io booted screenshot docs/qa/2026-09-06-uiux/<name>.png`.
- `xcrun simctl ui booted content_size accessibility-extra-large`, then restored to `large`.
- `xcrun simctl ui booted increase_contrast enabled`, then restored to `disabled`.
- `npm run lint`.
- `npx tsc --noEmit`.

### Screens tested

- Launch/Home dashboard.
- Onboarding landing, height, fitness focus, and workout setup.
- Workout start modal, existing-routine start, active workout table, field focus, and end confirmation/cancel.
- Rest timer ready state.
- Workout History list and existing workout detail.
- Coach Today, Past 7 Days, expanded history, and earlier development warning evidence.
- Nutrition dashboard, scrolled actions, Log Food, empty validation, weekly plan empty state, and targets.
- Progress overview, body measurements, and Strength Pro gate.
- Exercise Library list and exercise detail.
- More, Settings, notification settings, paywall, Terms, and Privacy tab container.
- Accessibility Extra Large on active workout and paywall; Increase Contrast on Progress; AX labels/tap bounds across screens.

### Screens not tested and why

- Clean-install auth/onboarding completion: existing authenticated data was preserved; no sign-out/reset/real credentials.
- Text-entry completion in workout fields: CUA typing approval timed out; no retry without renewed approval.
- Workout save/review persistence: the test-started routine was not saved to avoid adding invalid history; end confirmation was cancelled.
- Purchases, restore purchases, sandbox receipts, and payment sheets: intentionally excluded.
- Camera/photo/barcode permission flows: intentionally excluded to avoid sensitive permission dialogs.
- VoiceOver spoken traversal, physical small-phone/iPad layout, light in-app theme, and controlled offline networking: not completed.

## Evidence

All 46 PNGs in `screenshots-index.md` are real `simctl` captures. Key evidence:

- `16-workout-home.png`: normal Home state and duplicate workout-start surfaces.
- `17-workout-name.png`: workout naming/routine modal.
- `17-workout-active.png`: active routine workout, fixed bottom composer, and visible workout rows.
- `20-home-accessibility-text.png`: active workout at Accessibility Extra Large; severe clipping/reflow failure.
- `29-nutrition-next-day-refresh.png`: at host date 2026-09-07, Nutrition still labels data 2026-09-06.
- `30-coach-next-day.png`: Coach labels 2026-09-07 but praises calories while showing `nutrition n/a`.
- `16-workout-home.png` + `06-nutrition.png`: Home uses 3000/225 training targets while Nutrition uses the current 2700/203 rest-day target.
- `10-exercise-detail.png`: raw snake_case labels and multiple empty information sections.
- `13-paywall.png` and `21-paywall-accessibility-text.png`: paywall at standard and accessibility text sizes.
- `26-notification-settings.png`: 31-point visible decrement/increment controls and permission-off configuration state.

Screenshots may contain existing account/fitness content. `12-settings.png` includes an account identifier; all artifacts are internal-only and should be reviewed/redacted before sharing.

## Findings by journey

### 1. Launch / first impression

- What worked: Bundle launched successfully into an authenticated Home. Hierarchy is clean, cards are readable, and bottom navigation is recognizable.
- What failed or felt weak: Home exposes two visually similar Start actions: the program card and bottom workout bar. It is unclear whether they start the planned routine or a blank workout.
- User confusion risk: Medium; users may begin the wrong workflow or hesitate.
- Severity: P2.
- Recommended fix: Label actions explicitly (`Start planned workout`, `Start empty workout`) or collapse them into one source-selection flow.
- Evidence screenshot(s): `01-launch.png`, `16-workout-home.png`.
- Likely file(s): `components/home/HomeDashboard.tsx`, `components/workout/WorkoutBottomBar.tsx`, `app/(tabs)/index.tsx`.

### 2. Onboarding

- What worked: Landing copy is concise; progress (`Step n of 8`), Back, Skip, and large selection cards are clear. Height units and fitness-goal choices are visible.
- What failed or felt weak: Unselected onboarding screens show a bright Continue control that appears actionable, with weak differentiation from enabled state. Height/input steps leave a large unused vertical gap. Full completion was not performed.
- User confusion risk: Medium; users may tap Continue without knowing a selection/value is required.
- Severity: P2 affordance; completion remains a coverage gap.
- Recommended fix: Use a visibly disabled Continue state with explanatory validation; keep the footer anchored but improve vertical balance.
- Evidence screenshot(s): `03-onboarding.png`, `04-onboarding-height.png`, `27-onboarding-focus.png`, `28-onboarding-workout-setup.png`.
- Likely file(s): `app/onboarding/*.tsx`, shared onboarding quiz/footer components.

### 3. Workout logging

- What worked: Starting from the existing `Leg` routine succeeded after its loading state. The active workout supplied exercises, set numbers, editable weight/reps controls, swipe actions, End, and Send. Ending opened a confirmation and Cancel returned safely.
- What failed or felt weak: At normal text size the fixed composer crowds/obscures lower rows. At Accessibility Extra Large the table expands into oversized, clipped rows; controls move far off-screen and the core flow is not practically usable. Workout initiation also requires a second naming/routine modal after tapping the planned workout card.
- User confusion risk: High; large-text users cannot reliably review/log sets, and all users face redundant start decisions.
- Severity: **P1 core-flow/accessibility break**; P2 normal-size crowding.
- Recommended fix: Make workout rows vertically adaptive, cap nonessential label scaling where justified, allow horizontal content to wrap, and reserve measured bottom padding equal to the composer plus safe area. Add automated Dynamic Type layout coverage.
- Evidence screenshot(s): `16-workout-home.png`, `17-workout-name.png`, `17-workout-active.png`, `20-home-accessibility-text.png`.
- Likely file(s): `app/(tabs)/index.tsx`, `components/workout/WorkoutTable.tsx`, `components/workout/WorkoutBottomBar.tsx`, row/cell components used by WorkoutTable.

### 4. History

- What worked: Stable History list loaded with a real prior workout; detail navigation succeeded; sets, weights, reps, timestamps, reflection, media action, and review access were visible.
- What failed or felt weak: List copy says `1 Exercises` instead of `1 Exercise`. The `7/10` badge has no visible label, so users must infer it is a review score. History remains one level under More rather than a visible tab.
- User confusion risk: Low-to-medium; score meaning is unclear.
- Severity: P3.
- Recommended fix: Pluralize counts and label the score (`Review 7/10` or `Workout score 7/10`).
- Evidence screenshot(s): `02-history.png`, `18-history-with-active-draft.png`, `19-history-detail.png`.
- Likely file(s): `app/(tabs)/history.tsx`, `app/history/[id].tsx`.

### 5. Coach

- What worked: Today and historical reports render in clear sections; date, tone, streak, actions, and history expansion are available.
- What failed or felt weak: On 2026-09-07 Coach said calories were close to target while the same card showed `nutrition n/a`, `score —`, and `harshness 0`; Nutrition showed no logged meals and was still on 2026-09-06. Internal model/diagnostic vocabulary is exposed. Earlier history navigation also produced a missing-key LogBox warning in the development build.
- User confusion risk: High; unsupported praise damages trust in the product’s central coaching promise.
- Severity: P2 major trust defect; P2 development list-key defect; P3 copy.
- Recommended fix: Gate calorie claims on an explicit matching-day log/target evidence contract; show report freshness; replace diagnostics with human states; validate stable unique history IDs.
- Evidence screenshot(s): `04-coach-today.png`, `05-coach-history-warning.png`, `06-coach-history-expanded.png`, `07-coach-key-error-details.png`, `30-coach-next-day.png`, `29-nutrition-next-day-refresh.png`.
- Likely file(s): `app/coach/index.tsx`, `app/coach/history.tsx`, `lib/coaching.ts`, `contexts/CoachingContext.tsx`, `supabase/functions/daily-feedback`.

### 6. Nutrition

- What worked: Calories/macros use explicit units and remaining values. Log Food supports text/photo analysis, recent foods, search, barcode, and quick entry. Empty description validation was previously verified. Plan and target routes are reachable.
- What failed or felt weak: Nutrition remained dated 2026-09-06 on 2026-09-07 while Coach and the active workout advanced to 2026-09-07. `NutritionContext` only refreshes day boundaries on AppState changes, so a continuously active app can remain stale. Add Food is below the first viewport. Home always presents training targets (3000/225 in evidence) while the Nutrition dashboard presents the current rest-day target (2700/203), without explaining the difference. Targets says a custom target is saved while the weekly calorie fields appear blank.
- User confusion risk: High; “Today” can mean yesterday and calorie targets disagree across adjacent surfaces.
- Severity: P2 major trust/friction.
- Recommended fix: Add a midnight/interval/focus-aware local-day refresh; have Home consume the same resolved current-day target as Nutrition; keep Add Food above the fold; clarify saved base targets versus optional weekly overrides.
- Evidence screenshot(s): `06-nutrition.png`, `07-nutrition-log.png`, `09-nutrition-stale-date.png`, `10-nutrition-actions.png`, `11-food-entry.png`, `12-food-validation.png`, `23-nutrition-plan.png`, `24-nutrition-targets.png`, `29-nutrition-next-day-refresh.png`, `16-workout-home.png`.
- Likely file(s): `contexts/NutritionContext.tsx:259-398`, `app/(tabs)/nutrition/index.tsx`, `components/home/HomeDashboard.tsx:54-60`, `app/(tabs)/nutrition/targets.tsx`, `app/(tabs)/nutrition/log.tsx`.

### 7. Progress

- What worked: Missing metrics use dashes rather than invented data; body measurement fields have labels/units; high-contrast mode remained legible.
- What failed or felt weak: `Last logged never` is awkward. Strength does not advertise its Pro gate until after navigation. Body metrics use ambiguous `Arm` and `Thigh` fields with no side/measurement protocol. Save appears primary even with every field empty.
- User confusion risk: Medium; inconsistent measurements reduce longitudinal data quality.
- Severity: P2 measurement clarity; P3 gate/copy.
- Recommended fix: Add brief measurement guidance (`same side, relaxed/flexed`), disable Save until one valid change, add Pro badge, and replace empty copy with an action-oriented state.
- Evidence screenshot(s): `08-progress.png`, `13-progress.png`, `14-strength-pro-gate.png`, `22-progress-increased-contrast.png`, `25-progress-body.png`.
- Likely file(s): `app/(tabs)/progress/index.tsx`, `app/(tabs)/progress/body.tsx`, `app/(tabs)/progress/strength.tsx`.

### 8. Exercise library

- What worked: 1,339 exercises loaded; search, horizontal muscle filters, list metadata, and detail navigation worked.
- What failed or felt weak: Catalog names are visibly uncurated/lowercase. Detail surfaces raw values such as `body_weight`, `hip_flexors`, and `lower_back`. The tested exercise had no description, cues, or common mistakes, despite More describing the library as a catalog “with cues.” Three consecutive empty cards make the detail feel unfinished.
- User confusion risk: High for product credibility and exercise safety guidance.
- Severity: P2.
- Recommended fix: Apply title/snake-case formatting, hide empty sections, revise the More promise, and prioritize a curated subset with verified instructions/cues before exposing the full dataset.
- Evidence screenshot(s): `09-exercise-library.png`, `10-exercise-detail.png`, `11-more.png`.
- Likely file(s): `app/exercise-library/index.tsx`, `app/exercise-library/[slug].tsx`, `lib/exerciseFormat.ts`, `lib/exerciseLibrary.ts`, exercise seed/import pipeline.

### 9. More / settings / paywall / legal

- What worked: More groups Coaching, History, and Settings clearly. Settings routes are broad. Paywall displays plans, prices, auto-renew disclosure, Terms, Privacy, Restore, Close, and Sign Out semantics. It reflows into a scrollable long page at Accessibility Extra Large. Legal content rendered.
- What failed or felt weak: Settings is initially below the viewport on More. Standard-size Sign Out sits below the first paywall viewport; at Accessibility Extra Large purchase/legal/restore controls move several screens below the headline. Paywall Terms and Privacy both navigate to the same combined route, requiring users to choose the tab after arrival. `12-settings.png` contains a personal account identifier and must remain internal.
- User confusion risk: Medium, especially for account recovery and legal destination expectations.
- Severity: P2 paywall/legal friction; P3 More placement.
- Recommended fix: Make Settings visible without scrolling; keep Restore/Sign Out and legal links easy to reach; deep-link directly to the requested Terms or Privacy tab; test smallest supported phone.
- Evidence screenshot(s): `11-more.png`, `12-settings.png`, `13-paywall.png`, `14-terms-legal.png`, `15-paywall-readonly.png`, `21-paywall-accessibility-text.png`, `26-notification-settings.png`.
- Likely file(s): `app/(tabs)/more.tsx`, `app/settings/index.tsx`, `app/paywall.tsx`, `app/terms-of-service.tsx`.

### 10. Accessibility and polish

- What worked: Most controls expose useful AX labels; primary buttons are generally large; safe areas held on tested standard-size screens; high contrast did not break Progress.
- What failed or felt weak: Active workout fails at Accessibility Extra Large. AX announces five visible tabs as positions `1 of 6` through `5 of 6` because hidden History remains in the tab navigator. Notification time decrement/increment controls expose approximately 31×31-point bounds, below the common 44×44 iOS target. Muted gray copy and paywall disclosure are visually low-emphasis and still need measured contrast testing.
- User confusion risk: High for large-text users; medium for screen-reader and motor-access users.
- Severity: P1 Dynamic Type; P3 tab semantics/tap targets/contrast verification.
- Recommended fix: Treat accessibility text size as a release gate; correct tab collection semantics; expand plus/minus hit areas; run VoiceOver and measured contrast checks.
- Evidence screenshot(s): `20-home-accessibility-text.png`, `21-paywall-accessibility-text.png`, `22-progress-increased-contrast.png`, `26-notification-settings.png`, CUA AX captures.
- Likely file(s): workout table/bottom-bar components, `app/(tabs)/_layout.tsx`, `app/settings/notifications.tsx`, theme/shared text components.

## Prioritized issue list

| ID | Severity | Area | Finding | Evidence | Likely file(s) | Recommended fix | Effort |
|---|---|---|---|---|---|---|---|
| QA-01 | P1 | Workout / accessibility | Active logging breaks at Accessibility Extra Large | 20 | WorkoutTable, WorkoutBottomBar, tabs/index | Adaptive rows + measured composer inset + Dynamic Type tests | 1 day |
| QA-02 | P2 | Nutrition / date | Nutrition remains on prior day across midnight while other surfaces advance | 29, 30 | NutritionContext, nutrition/index | Timer/focus/AppState local-day refresh | 2 hours |
| QA-03 | P2 | Coach trust | Calorie praise shown beside `nutrition n/a` and no matching-day evidence | 30, 29 | coach screens/context, daily-feedback | Evidence-gated feedback + freshness state | 1 day |
| QA-04 | P2 | Nutrition consistency | Home always shows training target while Nutrition shows current rest-day target | 16, 06 | HomeDashboard, NutritionContext | Use one resolved current-day target | 2 hours |
| QA-05 | P2 | Exercise library | Raw snake_case and empty detail sections undermine quality | 09, 10 | exercise detail/format/import | Format values; hide empties; curate content | 2 hours–1 day |
| QA-06 | P2 | Workout navigation | Two Start surfaces and second start modal create redundant choice | 16, 17 | HomeDashboard, WorkoutBottomBar, WorkoutNameModal | Distinguish or consolidate flows | 2 hours |
| QA-07 | P2 | Nutrition hierarchy | Add Food is below initial viewport | 06, 10 | nutrition/index | Top/sticky Add Food action | 2 hours |
| QA-08 | P2 | Onboarding | Continue looks enabled before required selection/input | 04, 27 | onboarding screens/shared footer | Strong disabled state + validation | 2 hours |
| QA-09 | P2 | Body metrics | Arm/thigh protocol is ambiguous | 25 | progress/body | Measurement guidance + validation | 2 hours |
| QA-10 | P2 | Coach history | Development list-key warning observed | 05–07 | coach/history, coaching API types | Stable unique IDs; regression fixture | 2 hours |
| QA-11 | P3 | Accessibility nav | Five visible tabs announced as six | AX + 16 | tabs/_layout | Correct visible collection semantics | 2 hours |
| QA-12 | P3 | Notifications | Time stepper targets are about 31×31 points | 26 | settings/notifications | Expand hitSlop/container to ≥44×44 | 30 min |
| QA-13 | P3 | History | `1 Exercises` and unlabeled `7/10` | 18 | history list/detail | Pluralize and label score | 30 min |
| QA-14 | P3 | Progress | `Last logged never`; unbadged Pro route | 08, 14 | progress/index | Actionable empty copy + Pro badge | 30 min |

Severity definitions: P0 blocker; P1 core-flow break; P2 major friction; P3 polish/accessibility.

## Concrete solution plan

### 30-minute fixes

1. History and Progress copy
   - User problem: awkward or ambiguous labels (`1 Exercises`, `7/10`, `Last logged never`).
   - Proposed change: pluralize counts, label workout score, use `No measurements logged yet`.
   - Likely files: `app/(tabs)/history.tsx`, `app/(tabs)/progress/index.tsx`.
   - Acceptance criteria: singular/plural grammar is correct; score meaning is explicit; empty copy gives a next step.
   - Verification method: simulator screenshots for zero/one/many states; lint/typecheck.
2. Notification tap areas
   - User problem: 31-point +/- controls are difficult to hit.
   - Proposed change: preserve icon size but provide at least 44×44 interactive bounds.
   - Likely files: `app/settings/notifications.tsx`.
   - Acceptance criteria: AX bounds ≥44×44 points; adjacent targets do not overlap.
   - Verification method: CUA AX bounds and manual tap sweep.
3. Coach diagnostic copy
   - User problem: `harshness`/`n/a` looks internal and unhelpful.
   - Proposed change: human-readable data availability and tone labels.
   - Likely files: `app/coach/index.tsx`.
   - Acceptance criteria: no implementation jargon; missing data is explicit.
   - Verification method: no-data and full-data fixtures/screenshots.

### 2-hour fixes

1. Nutrition day freshness
   - User problem: Nutrition can display yesterday as Today.
   - Proposed change: add a bounded day-change timer and route-focus refresh in addition to AppState.
   - Likely files: `contexts/NutritionContext.tsx`, `app/(tabs)/nutrition/index.tsx`.
   - Acceptance criteria: date/query/target advance within one minute of midnight and on route focus; no manual restart.
   - Verification method: deterministic clock tests plus simulator foreground-across-midnight test.
2. One target contract
   - User problem: Home and Nutrition disagree on calorie/protein goals.
   - Proposed change: pass resolved current-day target to Home rather than hard-coded training fields.
   - Likely files: `components/home/HomeDashboard.tsx`, `app/(tabs)/index.tsx`, `contexts/NutritionContext.tsx`.
   - Acceptance criteria: Home and Nutrition show identical day target and source label.
   - Verification method: training-day/rest-day/weekly-override screenshots and unit tests.
3. Exercise detail formatting
   - User problem: raw dataset values and empty cards look unfinished.
   - Proposed change: title-case human labels, transform underscores, suppress empty sections, adjust More copy.
   - Likely files: `app/exercise-library/[slug].tsx`, `lib/exerciseFormat.ts`, `app/(tabs)/more.tsx`.
   - Acceptance criteria: no raw snake_case; no empty card unless it provides a useful next step; marketing copy matches coverage.
   - Verification method: sample detail matrix across equipment/muscle/empty-content variants.
4. Primary action hierarchy
   - User problem: duplicate workout starts and buried Add Food.
   - Proposed change: distinguish/consolidate workout starts; make Add Food visible above fold.
   - Likely files: HomeDashboard, WorkoutBottomBar, nutrition/index.
   - Acceptance criteria: one obvious primary action per screen; action outcome is predictable.
   - Verification method: first-glance screenshots and route/action verification.

### 1-day fixes

1. Dynamic Type-safe workout logging
   - User problem: core logging is unusable at Accessibility Extra Large.
   - Proposed change: redesign row cells for vertical stacking at large text, eliminate fixed heights, measure bottom bar, and add safe scroll padding.
   - Likely files: `components/workout/WorkoutTable.tsx`, row/cell components, `components/workout/WorkoutBottomBar.tsx`, `app/(tabs)/index.tsx`.
   - Acceptance criteria: every visible value/control remains readable and reachable from Large through Accessibility Extra Extra Extra Large; no overlap with composer/tab bar.
   - Verification method: automated screenshot matrix plus VoiceOver/manual set-edit flow.
2. Grounded daily coaching
   - User problem: Coach claims success without matching evidence.
   - Proposed change: enforce a date-stamped evidence object before generating/rendering claims; render deterministic insufficient-data state otherwise.
   - Likely files: CoachingContext, coach routes, `lib/coaching.ts`, `supabase/functions/daily-feedback`.
   - Acceptance criteria: no-log/partial/stale fixtures cannot produce calorie-adherence praise; displayed date matches evidence date.
   - Verification method: backend tests plus simulator no-data/partial/full scenarios.

### Later

- Curate a high-confidence exercise subset with reviewed cues/mistakes and licensing-safe media.
- Full VoiceOver spoken traversal, measured WCAG contrast, smallest iPhone, iPad, light/dark themes, Reduce Motion, and offline recovery matrix.
- Dedicated sandbox commerce QA with explicit purchase authorization.
- Clean-install onboarding/auth completion on a disposable simulator/test account.

## Release recommendation

- Minimum fixes before TestFlight/App Review: QA-01 Dynamic Type workout failure; QA-02 stale Nutrition day; QA-03 unsupported Coach feedback; verify clean onboarding and a complete synthetic workout save → History round trip; confirm Terms/Privacy direct behavior and smallest-device paywall access.
- Minimum fixes before public launch: all above plus Home/Nutrition target consistency, Exercise Library formatting/empty-section cleanup, Add Food hierarchy, VoiceOver/tab semantics, and notification hit targets.
- Risks if shipped as-is: inaccessible core logging for large-text users; stale “Today” data; contradictory coaching/nutrition claims; reduced trust from raw/empty exercise content; avoidable conversion/account-recovery friction.

## Verification

| Check | Result | Evidence / caveat |
|---|---|---|
| `npm run lint` | PASS | Exit 0; Expo lint emitted no diagnostics. |
| `npx tsc --noEmit` | PASS | Exit 0; no output. Supabase Deno functions are excluded by app tsconfig. |
| `xcrun simctl list devices booted` | PASS | iPhone 17 Pro, iOS 26.0 booted. |
| `xcrun simctl launch booted com.coachkettle.coachkettle` | PASS | Returned app PID; UI captured afterward. |
| `xcrun simctl io booted screenshot …` | PASS | 46 nonempty PNGs present in QA folder. |
| Deep-link route navigation | PASS | Custom scheme preapproval loaded after non-destructive simulator reboot; route screenshots verified. |
| Standard-size UI settings restored | PASS | Content size `large`; Increase Contrast `disabled`. |
| Full workout text entry/save | BLOCKED/PARTIAL | Start and routine load verified; typing approval timed out; save intentionally avoided. |
| Purchase/payment verification | NOT RUN | Intentionally excluded by safety rules. |
| App code changes | NONE | QA documentation only. |

### Residual test state

A test workout using the existing `Leg` routine was started to verify the real active logging UI. It was not saved. The end confirmation was cancelled rather than deleting/saving data, so an unsaved active draft may remain in the simulator. This is disclosed rather than silently erasing simulator state.
