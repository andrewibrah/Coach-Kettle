# Coach Kettle 1.0.2

Release branch `1.0.2` → `main`. This covers the 1.0.2 feature work, the patch-audit sections A–F, and now sections **G–J** (plan: `.hermes/plans/2026-09-08_222459-1.0.2-full-repo-patch-audit.md`, not committed).

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

## Backend (through G–J)
14 additive/narrowing migrations total. `20260904000200` includes a backfill, `20260914000100` and `20260924000100` narrow write privileges, and `20260924000400` is an idempotent data backfill (4 seed rows).

Deploy set for the G–J functions (diff vs the last deployed commit `667e8d1`): body-metrics, chat, coach, daily-feedback, delete-account (**NEW**), meal-plan, nutrition-analyze, revenuecat-webhook, terms-acceptance. `terms-acceptance` must go out before the 1.0.2 build is submitted, or new installs loop at the privacy gate.

See `docs/releases/1.0.2/DEPLOY_RUNBOOK.md`. Deploy the backend **before** the 1.0.2 build ships. The live 1.0.1 app stays compatible with it.

## G–J: what changed, per package

- **G, accessibility/theme (`63cf555`):** 44pt tap targets and `dangerFill` wired into every filled-danger surface (16 sites: delete modals, swipe-delete, active End pill, template delete, Coach/Nutrition error banners, 5 Progress error cards, onboarding error icon, media-picker error badge/button) — fixes low-contrast white-on-`#EF4444` text. Unconditional color-scheme hooks.
- **H, legal/paywall/Form Check (`54ecb24`):** `lib/legalMode.ts` splits the terms/privacy screen into a non-dismissible **gate** mode (no Close, no swipe, no Android back) and a dismissible **reader** mode (44pt Close, deep-link-safe). Paywall now renders the real `PRO_FEATURES` list (dropped a stale local array); the Advanced Analytics description was corrected to match what ships (e1RM + volume per session, no fatigue/1RM-projection claim). Form Check shows an honest "coming soon" everywhere, with a Pro-upsell CTA for free users. More-screen gained a 44pt Settings gear.
- **I1–I4, security/least-privilege (`5014755`):** body-metrics now runs entirely on the caller's JWT (no service-role client); a new `nutrition_target_sets`/`nutrition_target_day_overrides` service_role write REVOKE (migration `20260924000100`, gated on `nutrition-targets` already being at RPC-only v6); an I2 write audit of coach/meal-plan found every multi-write path already atomic and added fault-injection tests rather than code changes; I3 wires the Home program-hero "Start" to actually start the day's assigned exercises on a scheduled training day (falls back to blank-start on rest days / no program) — this is QA-06; I4 classifies nutrition text/photo analysis failures into distinct messages (unavailable / unreadable / not-deployed / other) instead of one generic string, and does the same for the confirm step (expired / invalid / conflict / unavailable / not-deployed).
- **L, leftovers (`c851cc5`):** the 1.0.2 targets screen blocks calorie-only targets before sending. The server still accepts calorie-only saves so the live 1.0.1 app keeps working (no server-side macro check, and no RPC or migration change: the draft `20260924000300` was deleted before it was pushed). The resolver treats calorie-only targets as incomplete, so Coach gives a workout-only report and meal plans ask for targets; removed the redundant `pr-lifts` local write queue (the draft's own write queue already serializes); added busy guards to 5 onboarding input screens that previously allowed concurrent writes; removed a dead `useDotColors()` call in Coach history; fixed 4 seed exercise names with degree-sign mojibake (`в°` → `°`).
- **Final-review fixes (the commit after `0856001`):** offline, fetch-timeout and abort failures in nutrition analyze/confirm now read "temporarily unavailable, check your connection" instead of "update the app"; only the platform's own 404 means not deployed. `delete_user_data` now returns a `skipped` list (tables that exist without `user_id`), and `delete-account` logs `delete-account: purge_skipped tables=<names>` when it's non-empty; the deletion still completes. The runbook's rollback section is now a roll-forward policy (never roll back `terms-acceptance` or remove `delete-account`). Release docs corrected to match the code.
- **G11a/G11b, privacy/account deletion (`dc91335`):** new `delete-account` Edge Function + `delete_user_data` SECURITY DEFINER purge RPC — requires a re-authentication within 5 minutes (amr-claim check), RevenueCat subscriber deletion, best-effort Apple token revocation, a bounded storage sweep (capped at 200 list calls), the DB purge, then `auth.admin.deleteUser`. Privacy bumped to 1.1.0 with a new in-app AI-disclosure consent card; the version check now gates on what the client *declares* (not just the latest row), so a live 1.0.1 user is never trapped and a 1.0.2 user is re-prompted exactly once.

## QA pack and docs (this package)
`docs/releases/1.0.2/QA_PACK.md` (new): every gate G01–G12 with numbered steps, account-type requirements, expected results, and a persistence readback, plus the new device checks from this pass (44pt targets, danger contrast, legal gate non-dismissibility, Settings gear, Form Check containment, QA-06 planned-day start, nutrition error classes, account deletion DA-01–DA-06, privacy 1.1.0 re-prompt) and a "Disposable-stack runs" section with copy-pasteable commands for a **local** `supabase start` stack. `DEPLOY_RUNBOOK.md` updated with the 3 new migrations, the new function deploy set, the CLI ≥2.117 and paused-project notes, and an expanded read-back including `delete-account` and `food-barcode`.

## Verification (controller-verified on final source HEAD `dc91335`)
- lint: 0 warnings
- tsc: 0 errors
- `node --test "lib/__tests__/*.test.ts"`: 677/677
- Edge handler and unit tests: 298/298
- Deno check: 4 errors, all pre-existing on the base commit (iap, notifications, programming, terms-acceptance); none introduced by G–J
- `expo export --platform ios` succeeds
- expo-doctor reports 17 Expo SDK patch-version mismatches (reported, not changed)

Per-commit counts (lib / functions), tsc 0 at every commit:
- `63cf555` (G, a11y): 569/226
- `54ecb24` (H, legal/paywall/Form Check): 590/226
- `5014755` (I1–I4, security): 616/264
- `c851cc5` (L, leftovers): 630/266
- `dc91335` (G11a+G11b, privacy/deletion): 677/298
- final-review fixes: 680/300 (fixer-verified; deno check still only the 4 pre-existing errors)

This docs package (J) itself changes no app or Edge code; see its own report for the sanity-check verification run against the docs-only diff.

## Still open (BLOCKED — no device evidence)
- **No simulator available in this environment** (no Xcode installed) — every G01–G12 device gate in `QA_PACK.md` is a written procedure with an empty Result/Evidence field, not a pass.
- **All disposable-stack SQL/script runs** in `QA_PACK.md` are BLOCKED-until-run: `onboarding_completion*`, `nutrition_target_*`, `meal_plan_*`, `coach_*`, the 4 new `.sql` tests (`body_metrics_isolation`, `nutrition_target_service_role_revoke`, `exercise_mojibake`, `delete_user_data` + its disposable script), and `scripts/verify-body-metrics-persistence.mjs`.
- **G02 upgrade path** (1.0.1 → 1.0.2, data/entitlement preservation) — needs a real device/account.
- **Pre-release read-only production check (BEFORE release):** the g11-inventory §0 queries in `DEPLOY_RUNBOOK.md`. (1) The FK-to-`auth.users` query rules out a `NO ACTION`/`RESTRICT` FK outside the purged tables, which would make deletion return `AUTH_DELETE_FAILED`. (2) The `user_id` query must return `workouts`, `workout_log` and `chats`; any table it doesn't return is skipped by the purge (logged as `purge_skipped`).
- **Legal/product sign-off:** confirm live 1.0.1 users are genuinely never re-prompted for privacy 1.1.0 (server-side logic is tested; this is a business confirmation, not a code gate).
- **Secrets:** `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY` are not yet set — without them, deletion still succeeds but Apple tokens aren't revoked (logged as `apple_revoke_failed reason=missing_secret`).
- **Deferred nits (unchanged from before G–J):**
  - The Coach migration isn't wrapped in BEGIN/COMMIT.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
