# ASTRA integration record

Session: astra-1db7a717-e931-412c-b91b-7a668595b722
Baseline: 7efd492ce4fa9379add765504e5c22c5abd2de4e on dirty b65/66.

## Ownership decision A1
Allocate previously frozen lib/nutritionTargets.ts and lib/__tests__/nutritionTargets.test.ts to ASTRA for extending the existing single target resolver with legacy-row and local weekly-goal compatibility. No dependency/shared type change.
Declare new ASTRA paths: lib/nutritionDay.ts, lib/__tests__/nutritionDay.test.ts, lib/__tests__/nutritionRelease.test.ts.
HomeDashboard retains public props; it will consume the context's resolved todayTarget directly. FABLE must not duplicate resolution in the Home route. No workout-start contract change yet.

## Expected behavior before implementation
- Provider represents live today only: no selected-date setter or historical browsing exists in its current public interface. Do not invent historical-date navigation.
- Check local date while active at least once per minute, immediately on foreground and Nutrition route focus. Stop timer/listener on unmount; never change device clock.
- Clear old-day totals when rolling over. Do not accept a late old-day response after the date advances.
- Home and Nutrition consume the same resolved target and explanation for provider date. Explicit training_days honored. Legacy weekly overrides preserve their current priority, merging only fields provided; saved hybrid targets remain durable base, legacy row is compatibility fallback before unsaved suggestion/draft.
- Existing resolver unit tests remain passing; add weekly override and legacy target regressions and controlled-clock lifecycle tests.

## Baseline receipts
ASTRA-scoped eslint exit 0; app tsc --noEmit exit 0. See coordination/astra-checks/baseline-results.json. Not final combined checks.
GitNexus CLI query/context/impact available with -r WorkoutTracker. Index HEAD matches baseline; graph may omit dirty changes, so current-source callers must also be reviewed. NutritionProvider upstream risk LOW, RootLayout direct caller. No index rebuild performed.

## Integration state
Initial snapshot superseded. Hermes is ASTRA; FABLE acknowledged this identity and the shared-file allocations through inbox/to-hermes. See RELEASE_CHECKLIST.md for the complete gate ledger and astra-status.md for ownership. Both lanes are QUIESCENT for the current build snapshot. No deployment or build-number change authorized.

## Current integration checkpoint
- A1/A2 and Q2 local logic fixes exercised; R4 sparse measurement payload/validation and C1 localized display added.
- R1 withdrawn after peer measurement; themed-text unchanged. R2 Header fix peer-reported and source-reviewed, not a full accessibility sign-off.
- R3/C2/C3 code-complete per peer; mode=read is the agreed URL spelling (defaults preserve acceptance). C4 Settings legal entry still missing at ASTRA review and returned to FABLE.
- User approved isolated Deno/local build in this harness. Deno Edge check passes for body-metrics and daily-feedback, 7 rule/handler tests pass under Deno. Current combined snapshot: lint/typecheck exit 0, 184 library tests and 7 backend Node tests pass. These are not live-database tests.
- Local unsigned iOS Simulator Release build is running in /tmp/coach-kettle-astra-release; it does not install over the existing app. Source fingerprint manifest: coordination/astra-checks/release-source-manifest.json.
- The R4 schema comment still describes replace semantics; record a future migration/documentation correction rather than rewrite a deployed historical migration. Notes-only writes are not supported by this client. Blank metrics now mean leave unchanged, not clear.
- Privacy/account-deletion/commerce, authorized persistence, complete accessibility, upgrade and candidate provenance remain blocked or not run. No claims about TestFlight containing these fixes.


## 2026-09-08T04:29:07Z — build and peer-review closure

- First local Release xcodebuild passed; source hashes unchanged during build. Product has executable and embedded main.jsbundle. Version 1.0.2, local CFBundleVersion 1; no claim of remote build number or TestFlight readiness.
- FABLE found workout-query failures being interpreted as no workout. Reproduced with two semantic test failures; fail-closed patch now passes. Real generateFeedback fixture confirms no report/summary/behavior writes on missing evidence.
- Latest Deno: both changed handlers check; 10 tests pass. App combined baseline: 184 lib tests, lint and tsc pass.
- Source QUIESCENT on ASTRA side after this patch; runtime lock released with ownership checked. No server/install/purchase/deploy.
- FABLE authorized to finish accepted C4; pending final handoff and a refreshed app build for subsequent UI edits.
- Full 12-gate / original 14-issue ledger: RELEASE_CHECKLIST.md. Verdict HOLD; no required gate disappears merely because some tests pass.

## Final integration receipt — 2026-09-08T04:33:11Z

Both lanes QUIESCENT. FABLE C4/R3 handoff read and acknowledged. Latest app checks: 184 passed / 0 failed, tsc 0, lint 0 (post-review-results.json). Latest backend Deno: both handlers check; 10 passed / 0 failed (final-backend-results.json). Final post-C4 local Release rebuild PASS: 240-file manifest unchanged during build, executable and embedded main.jsbundle verified; see release-final-verification.json.

Artifact: /tmp/coach-kettle-astra-release/Build/Products/Release-iphonesimulator/CoachKettle.app
Version 1.0.2, local build 1. No install, launch, remote build, upload, deploy or account transaction. ASTRA runtime lock released after exact ownership check; no ASTRA runtime process left running. C4 device navigation and acceptance-gate regression remain unverified.

Release HOLD. Next human-dependent action: approve a disposable test account/session and handle authentication. Real persistence, purchase/restore, upgrade, complete device/accessibility, onboarding fixes and privacy/submission gates are not closed. Source-freeze release notice sent to FABLE; this does not authorize unscheduled edits to the verified candidate.
