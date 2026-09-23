# Coach Kettle screenshots — 2026-09-06 UI/UX QA

All 46 PNGs are real captures from the booted iOS Simulator using `xcrun simctl io booted screenshot`. They are internal QA evidence, not mockups. CUA screenshots/AX trees were used to verify interactions. Several images contain existing fitness/account content; `12-settings.png` includes an account identifier and must be reviewed/redacted before external sharing.

| File | Screen | What it proves |
|---|---|---|
| `01-launch.png` | Initial launch | Installed bundle rendered into existing authenticated state. |
| `02-home.png` | Earlier Home | Initial dashboard/workout entry evidence from first pass. |
| `02-history.png` | History list | Stable list, real prior workout, count summary, score chip. |
| `03-more.png` | Earlier More | Navigation grouping and below-fold Settings from first pass. |
| `03-onboarding.png` | Onboarding landing | Intro copy, time estimate, Get Started, Skip. |
| `04-coach-today.png` | Earlier Coach Today | Calorie praise beside unavailable nutrition diagnostics. |
| `04-onboarding-height.png` | Onboarding height | Step progress, unit selector, fields, footer controls. |
| `05-coach-history-warning.png` | Coach history warning | Development missing-key LogBox warning. |
| `05-coach.png` | Coach Today | Section hierarchy and internal status chips on Sep 6. |
| `06-coach-history-expanded.png` | Coach history expanded | Historical report expansion behavior. |
| `06-nutrition.png` | Nutrition dashboard | 2700/203 rest-day target, zero totals, Add Food below fold. |
| `07-coach-key-error-details.png` | LogBox details | Warning context pointing to CoachHistoryScreen/list keys. |
| `07-nutrition-log.png` | Log Food | Text/photo analysis, recent item truncation, search/barcode/quick entry. |
| `08-progress.png` | Progress | Empty metrics, drill-down actions, `Last logged never`. |
| `08-timer.png` | Earlier Timer | Timer ready state and presets. |
| `09-exercise-library.png` | Exercise Library | 1,339 items, search, filters, uncurated lowercase names. |
| `09-nutrition-stale-date.png` | Earlier stale Nutrition | Prior pass captured previous-day Nutrition date. |
| `10-exercise-detail.png` | Exercise detail | Raw snake_case values and empty description/cues/mistakes cards. |
| `10-nutrition-actions.png` | Nutrition scrolled | Add Food, meal plan, and targets are reachable after scrolling. |
| `11-food-entry.png` | Earlier Log Food | Food-entry modes and search/recent surface. |
| `11-more.png` | More | Coaching/History/Settings grouping; library promise mentions cues. |
| `12-food-validation.png` | Food validation | Empty meal description produces actionable validation. |
| `12-settings.png` | Settings | Settings surface and account/profile sections; contains PII, internal only. |
| `13-paywall.png` | Paywall standard size | Prices, benefits, disclosure, legal links, restore/close; no purchase made. |
| `13-progress.png` | Earlier Progress | Progress overview from first pass. |
| `14-strength-pro-gate.png` | Strength gate | Unbadged Progress route opens Pro restriction. |
| `14-terms-legal.png` | Terms/Privacy container | Combined legal route, tabs, long scrollable content, acceptance UI. |
| `15-paywall-readonly.png` | Earlier paywall | Read-only commerce surface; no purchase/restore interaction. |
| `15-timer.png` | Timer | Ready 1:30 state, presets, drag ruler, Start. |
| `16-home-resumed.png` | Earlier resumed Home | Five visible tabs and duplicate Start surfaces. |
| `16-workout-home.png` | Home before workout | Program Start, lower Start, 3000/225 Home training target. |
| `17-workout-active.png` | Active workout | Real routine rows, fixed composer overlap/crowding, active draft. |
| `17-workout-name.png` | Workout start modal | Name field, routine-loading/selection state. |
| `18-history-with-active-draft.png` | History while draft active | History remains navigable; green active-workout indicator persists. |
| `19-history-detail.png` | Workout detail | Sets, weights, reps, time, reflection, media/review controls. |
| `20-home-accessibility-text.png` | Active workout, Accessibility Extra Large | Severe row clipping/reflow and off-screen controls in core flow. |
| `21-paywall-accessibility-text.png` | Paywall, Accessibility Extra Large | Paywall reflows to long scroll; purchase/legal/account actions move far below fold. |
| `22-progress-increased-contrast.png` | Progress, Increase Contrast | Progress remains legible with increased contrast enabled. |
| `23-nutrition-plan.png` | Meal-plan empty state | Sparse first-use state and Generate Meal Plan action. |
| `24-nutrition-targets.png` | Nutrition targets | Saved-target statement, blank weekly fields, Auto/Macros controls, below-fold Save. |
| `25-progress-body.png` | Body measurements | Field labels/units, ambiguous Arm/Thigh protocol, empty-state Save. |
| `26-notification-settings.png` | Notification settings | Permission state, reminder steppers, toggles, small +/- targets. |
| `27-onboarding-focus.png` | Onboarding fitness focus | Four choices and Continue appearance before selection. |
| `28-onboarding-workout-setup.png` | Onboarding final step | Template setup vs Skip, full progress, large unused lower area. |
| `29-nutrition-next-day-refresh.png` | Nutrition after date rollover | Host was Sep 7 while Nutrition remained labeled Sep 6. |
| `30-coach-next-day.png` | Coach after date rollover | Coach shows Sep 7 and calorie praise while `nutrition n/a`; cross-screen contradiction. |

Notes:

- The floating gear in development screenshots is Expo/dev tooling, not counted as production app UI.
- A screenshot proves rendered state, not persistence or backend correctness unless paired with an explicit readback.
- No screenshot represents a completed purchase, restore, sign-out, camera/photo permission, or clean-install auth flow.
