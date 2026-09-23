# Coach Kettle 1.0.2

Release branch `1.0.2` → `main`. This covers the 1.0.2 feature work and the patch-audit sections A–F (plan: `.hermes/plans/2026-09-08_222459-1.0.2-full-repo-patch-audit.md`, not committed). Sections G–J are **not** in this PR.

## What's in it

**Feature work (earlier 1.0.2 lanes)**
- Food barcode scanner: an expo-camera scanner, a new `food-barcode` Edge Function backed by OpenFoodFacts, and a barcode cache and quota migration.
- Rest timer: auto-start prompt and a new timer dial. The old `RestTimerBar` is removed.
- Programs: full-body and upper/lower templates, closest-match template fallback, program source and start date on workouts (with a backfill), and planned-start scheduling.
- Exercise library: pagination and a virtualized list. Old clients still get the unpaginated list.
- Large-text layout and accessibility or theme work on shared headers and screens.
- Paywall, legal and form copy. `react-native-purchases` goes from 10.0.1 to 10.9.0. **Sentry is removed.**
- The Coach chat system prompt is rewritten.

**Audit sections**
- **A**, onboarding navigation: a typed route table, `dismissTo` Back, resume that waits for the draft to hydrate, and PR reconciliation (F01, F02, F05, F06).
- **B**, onboarding integrity:
  - Strict parsing on every input screen, and unit conversions that don't lose values (F03, F04, N03).
  - An owner-scoped, serialized draft (N04, N05).
  - **Atomic, idempotent completion.** The `complete_onboarding_atomic` RPC is called through the profile function's new action. A persisted request ID covers retries and restarts, and a lost acknowledgement is recovered (N01, N02).
  - The legacy `batch_onboarding` action is unchanged for 1.0.1.
- **C**, nutrition:
  - The backend resolves approved targets.
  - Atomic RPCs for target sets, meal-plan replacement and Coach persistence, plus coherent reads.
  - No more placeholder meal plans.
  - An explicit import for weekly goals kept only on the device.
  - Workout-only Coach reports and a "Set targets" prompt when targets are missing (N06, N07, N08).
- **D**, body metrics: strict client ranges, a sparse-merge contract, and a migration that only updates the table comment (F17, F23, F26). F24/R4 is FIXED-UNVERIFIED.
- **E**, progress and reflection: loading, error and empty states; refresh on focus; the reflection save and cancel fix; and a Pro marker (F14, F15, F16). F18 is FIXED-UNVERIFIED.
- **F**, display formatting for exercise and nutrition preferences (F07–F10). `SHOW_EXERCISE_MEDIA` stays false.

**Release-review fixes**
- Nutrition target saves no longer break during deploy (the service_role table REVOKE is deferred to §I).
- The 1.0.1 exercise list keeps its full length.
- Coach "today" uses the server's date.
- Barcode scanner colors now come from the theme.

## Backend
There are 11 additive migrations. `20260904000200` includes a backfill, and `20260914000100` narrows write privileges for PUBLIC/anon/authenticated only.

Deploy these 10 functions: nutrition-targets, meal-plan, daily-feedback, profile, body-metrics, food-barcode, notifications, programming, exercise-library, coach.

See `docs/releases/1.0.2/DEPLOY_RUNBOOK.md`. Deploy the backend **before** the 1.0.2 build ships. The live 1.0.1 app stays compatible with it.

## Verification (committed HEAD)
- lint clean
- tsc clean
- `node --test "lib/__tests__/*.test.ts"`: 538/538
- Edge handler and unit tests: 226/226
- Deno check: 4 errors, all present on the base commit (iap, notifications, programming, terms-acceptance); none were introduced here
- `expo export --platform ios` succeeds
- expo-doctor reports 17 Expo SDK patch-version mismatches (reported, not changed)

## Still open
- **G–J:** accessibility and theme, commerce and legal copy, least privilege, and full qualification with device evidence.
- **R4:** the real two-user Edge→PostgREST run on a disposable stack.
- **B, C, D:** the real database gates for replay, rollback and concurrency.
- **Device checks:** largest text size, VoiceOver, and reading a reflection back after navigating away and relaunching (G07).
- **Deferred nits:**
  - `save_set` accepts calorie-only targets, but the resolver needs all four macros.
  - `pr-lifts` has a redundant write queue.
  - Busy guards differ across the onboarding input screens.
  - `coach/history.tsx` still calls `useDotColors()` without using the result.
  - The Coach migration isn't wrapped in BEGIN/COMMIT.
  - 4 seed rows contain mojibake.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
