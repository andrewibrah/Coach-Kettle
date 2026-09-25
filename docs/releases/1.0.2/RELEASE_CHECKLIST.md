# Coach Kettle 1.0.2 — Release checklist

Snapshot: 2026-09-08T04:29:07Z
Coordinator: Hermes = ASTRA. Branch b65/66, baseline HEAD 7efd492ce4fa9379add765504e5c22c5abd2de4e plus substantial preserved dirty/untracked work. HEAD alone does NOT identify the candidate.

Verdict: HOLD. Status reflects the whole gate, not a passing subset. No absence-of-evidence item is called a vulnerability. This is a live ledger; FABLE remains active until its next explicit handoff.

## Full gate coverage

| ID | Area | Owner | Status | Evidence/gaps and next action |
|---|---|---|---|---|
| G01 | Launch | ASTRA | BLOCKED | Cold/warm launch, production without Metro, crash/error states. Local iOS Release build PASS against stable manifest, with executable and embedded JS bundle verified; not installed or cold/warm launched. Final post-C4 rebuild also PASS with 240-file source manifest unchanged; final artifact not installed/launched. |
| G02 | Upgrade | ASTRA / Andrew | NOT RUN | 1.0.1 → candidate upgrade preserving records, preferences and entitlements. Requires approved test device/account and exact binaries; do not overwrite existing draft. |
| G03 | Onboarding/auth | FABLE / ASTRA | BLOCKED | New-user completion, skip/back/resume, units/validation, supported sign-in and recovery. Peer reported Back push/bounce, partial PR discard and unit-switch loss; no full journey. User handles authentication. |
| G04 | Workout | FABLE | BLOCKED | Blank/planned/routine start, add/edit/remove, keyboard, timer/background, finish/cancel, save→History→relaunch, draft recovery, offline/retry/no duplicates. Layout evidence and guarded-start code exist; complete mutation journeys need disposable session. Existing Leg draft preserved by reported earlier QA. |
| G05 | Nutrition | ASTRA | BLOCKED (code FIXED; device UNVERIFIED) | Manual/text/photo/search/barcode, portions/corrections, save/edit/delete/totals, targets/overrides, midnight/timezone, meal plan, errors/retry. Resolver/rollover/Add Food logic tests pass; no complete persistence journey or all input modalities proven. G–J pass (task I4): text/photo analysis failures are now classified into distinct messages (unavailable/unreadable/not-deployed/other) instead of one generic string; handler-level tests pass. Confirm-branch (404/409/410) errors still collapse to one generic message — a known, unfixed gap, not a regression. Device confirmation (QA_PACK.md G05) still required. |
| G06 | Coach/programming/Form Check | ASTRA | BLOCKED (code FIXED; device UNVERIFIED) | Evidence/freshness and history local regressions pass. Chat, assigned-workout start, upload/result/error and entitlements not fully verified. Form scoring disabled honestly; preserved historical records hidden metrics; Settings copy handed to FABLE. No actual video analyzer. G–J pass (task H): Form Check copy now consistently says "coming soon" in every surface (feature screen, Settings row and its a11y label), and free users get an explicit Pro-upsell CTA; paywall feature list corrected to match what ships. Device confirmation (QA_PACK.md G06) still required. |
| G07 | History/progress/library | BOTH | PARTIAL: code FIXED for reflection persistence/body-photo signing; device UNVERIFIED | Values/units/dates, empty/loading/error, measurements/photos/charts, search/details/content/licensing. R4 payload tests pass; database persistence/concurrency unrun. Catalog fixes peer-reported, not full content/licensing or device audit. G–J pass (task I1): body-metrics now runs entirely on the caller's JWT (no service-role client) for reads, signed-URL creation and photo removal — code-level change, live signing behavior still device-unverified (flagged explicitly in task-I1-report.md). G–J pass (task L): 4 seed exercise names with degree-sign mojibake corrected (code FIXED; device/library-view UNVERIFIED). Remaining sub-items (measurements/photos/charts persistence journey, search/details/content/licensing, database concurrency) stay BLOCKED. |
| G08 | Settings/notifications | FABLE / ASTRA | BLOCKED (code FIXED; device UNVERIFIED) | Preferences persistence, denied-permission alternatives, timer/reminder behavior, contextual labels. Label/target improvements reported; persistence/background delivery not verified. G–J pass (task H): added a 44pt Settings gear to the More-screen header for discoverability. Device confirmation (QA_PACK.md G08) still required. |
| G09 | Accessibility | FABLE | BLOCKED (code FIXED; device UNVERIFIED) | Default/largest text, keyboard/safe areas, small/physical iPhone/iPad, actual VoiceOver, contrast, appearances/Reduce Motion. Partial Simulator evidence only. R1 withdrawn; R2 peer-reported fixed does not close entire gate. G–J pass (task G): `dangerFill` wired into all 16 filled-danger surfaces found by grep (delete modals, swipe-delete, End pill, template delete, error banners/cards, media-picker badge) — the low-contrast white-on-`#EF4444` issue is code-fixed; measured 44pt targets, VoiceOver traversal, largest Dynamic Type and Reduce Motion remain device-unverified (see QA_PACK.md G09). |
| G10 | Commerce | ASTRA / Andrew | BLOCKED | Sandbox purchase/cancel/pending/failure/restore, relaunch/second-device access/expiry; StoreKit localized prices and disclosure/legal/manage reachability. C1 current-store price local tests pass; C2/R3/C4 implemented locally; legal navigation/acceptance regression device-unverified. No transactions authorized or executed. G–J pass (task H): paywall now renders the real, shipping feature list (no fatigue-monitoring/1RM-projection overclaim). No purchase/entitlement logic changed. |
| G11 | Privacy/security | ASTRA / Andrew | BLOCKED (code FIXED; device UNVERIFIED) | AI-sharing permission and disclosure, privacy/policy consistency, account deletion, applicable sign-in, cross-account tests, private media, secrets/log hygiene, permission strings/SDK declarations. Source scan finds general AI policy disclosure and contact-to-delete copy, not a verified in-app deletion/feature-specific consent journey. No security certification; policy unchanged. Authentication/production tests need scoped approval. G–J pass (tasks G11a/G11b): in-app account deletion shipped (`delete-account` function + `delete_user_data` purge RPC, re-auth required, RevenueCat + best-effort Apple revocation + bounded storage sweep + DB purge + auth delete), privacy bumped to 1.1.0 with an in-app AI-disclosure consent card, and the version gate is fixed so 1.0.1 users are never trapped and 1.0.2 users are re-prompted exactly once. All of this is unit/SQL-tested (handler and migration tests pass) but has **zero device or disposable-stack evidence** — see QA_PACK.md DA-01–DA-06 and G11-1. The g11-inventory §0 FK-to-`auth.users` production check is still outstanding (read-only, for Andrew). |
| G12 | Submission | ASTRA / Andrew | BLOCKED | Marketing version/build provenance; lint/types/tests/Edge checks; production/TestFlight evidence; support/privacy URLs; redacted screenshots; accurate release/review notes; reviewer/backend readiness; rollout/recovery. Version 1.0.2 preserved, EAS remote build numbering not selected. No submission, upload or deploy. Exact candidate provenance still missing. G–J adds a QA pack (`QA_PACK.md`) and an updated deploy runbook, but changes none of the submission blockers above. |

## Historical QA reconciliation

All issue IDs in the original QA prioritized list are retained here. PASS means the specifically described local/code scope, not release acceptance.

| ID | Owner | Status | Disposition |
|---|---|---|---|
| QA-01 | FABLE | BLOCKED | List-overflow fix has peer Simulator A/B evidence. R2 title fix now peer-reported measured; R1 diagnosis withdrawn. Full keyboard/drag/AX flow still unverified. |
| QA-02 | ASTRA | BLOCKED | Rollover, foreground cleanup, clear-old-day and late-response regressions pass locally; live midnight/timezone and explicit historical browsing acceptance not complete. |
| QA-03 | ASTRA | BLOCKED | Evidence-gated Coach changes and tests pass; Deno check/tests pass. Stored/live production reports and full end-to-end verification pending. |
| QA-04 | ASTRA | PASS | Shared resolver consumed by Home/Nutrition; matching target, weekly and legacy regressions pass. Local source only. |
| QA-05 | FABLE | BLOCKED | Detail formatter, empty-section and muscle-dedupe changes reported; actual catalog navigation/device verification pending. |
| QA-06 | BOTH | code FIXED; device UNVERIFIED | Guarded Home start fixed; redundant planned-start naming modal remains. G–J pass (task I3): the Home program-hero "Start" now actually resolves and starts the scheduled day's assigned exercises/sets on a training day, with a safe fallback to blank-start on rest days, no program, or an unresolvable day index (`lib/programSchedule.ts` `resolveHomeStartDecision`/`resolveProgramDayItems`). Pure-function unit tests pass; no device confirmation yet (see QA_PACK.md G04-2). |
| QA-07 | ASTRA | PASS | Add Food moved to initial hierarchy; component-function regression passes; not a device-layout certification. |
| QA-08 | FABLE | NOT RUN | Full Continue validation and Back/Skip/resume onboarding pass not completed; additional navigation/partial-PR/unit-switch risks reported. |
| QA-09 | BOTH | BLOCKED | R4 sparse-write and validation local fix added; actual same-day persistence/concurrency and arm/thigh guidance not verified. |
| QA-10 | ASTRA | PASS | History uses per-user feedback_date identity; client date/failure regressions pass. |
| QA-11 | FABLE | BLOCKED | Visible-tab labels changed; actual VoiceOver count/traversal untested. |
| QA-12 | FABLE | BLOCKED | Notification targets/labels changed; real accessibility interaction pending. |
| QA-13 | FABLE | PASS | Pluralization and review-score labels fixed per peer handoff; compile tested. |
| QA-14 | FABLE | FAIL | Empty-state copy remains; strength Pro gate was already present and should not be falsely counted as a new fix. |

## Cross-lane findings

- R1: WITHDRAWN by FABLE after A/B. Earlier claim that numeric RN lineHeight never scales was an inference, not established fact. Do not edit themed-text to solve an unproven defect.
- R2: Header truncation fix peer-reported, with A0/B1/C1/C2 evidence in docs/qa/2026-09-08-1.0.2-fable-lineheight/. Full keyboard/long-title/VoiceOver coverage still required.
- R3: FABLE reports read-only Terms/Privacy routing and no acceptance mutation in reader mode.
- C4: FABLE final handoff confirms Settings Legal links, matching Terms/Privacy header and explicit 44px reader Close. ASTRA read the changed source. Post-change lint, TypeScript, 184 tests and final Release build pass. Device navigation and acceptance-gate regression remain unverified; no acceptance-policy change authorized.
- R4: local handler sends a single sparse object; blank/null means leave existing measurement unchanged. No read-then-write race. Invalid values and empty submissions return 400/no write. Existing delete-entry behavior unchanged; clearing one field is not supported. Deployed PostgREST version and real sequential/concurrent same-day persistence are unverified. No schema change or deployment made.
- C1: settings reads existing IAP localized product price matched by ID; label Current store price distinguishes it from actual renewal charge; missing product directs user to Manage Subscription. No purchase logic changed.
- C2: FABLE reports dismissal-only CTA now says Continue/Continuing..., not a trial-start claim. No purchase/entitlement behavior changed.
- C3/Q2: preset Form Check scoring and camera/save flow disabled; history data untouched, unverified metrics/cues withheld. FABLE reports Settings-copy correction completed. Never describe this as implemented video analysis.

## Test receipts

- coordination/astra-checks/summary-results.json: preceding snapshot full lint + app tsc exit 0, 182 library tests pass, 4 backend rules pass. Superseded for final counts after R4/C1 and peer changes.
- coordination/astra-checks/deno-check.txt: both changed Edge functions pass Deno check after concrete-client type correction.
- coordination/astra-checks/deno-tests.txt: 7 tests pass under Deno (same isolated real-handler/rule harness, not a live DB).
- Existing Node MODULE_TYPELESS_PACKAGE_JSON warnings are not test failures. No package-type change made solely to suppress them.
- Latest combined app receipt: 184 library tests passed; full app lint and tsc exit 0. See combined-results.json.
- Latest backend receipt: final-backend-results.json and deno-tests-final.txt: both changed Edge handlers typecheck; 10 tests pass (7 Coach, 3 body-metrics).
- Local Release build: xcodebuild exit 0 and BUILD SUCCEEDED; release-build-verification.json confirms no source drift against the saved manifest. The app contains executable and main.jsbundle. Artifact plist: com.coachkettle.coachkettle, version 1.0.2, local build 1. This is not an App Store/TestFlight build-number claim.
- Backend workout-evidence patch followed that build: unavailable query/count now aborts before summary/report/behavior-state writes. Two regression cases observed red, then green. Not deployed.
- Deno installed only in /tmp/coach-kettle-astra-tools; isolated cache /tmp/coach-kettle-astra-deno. Runtime lock used and explicitly released after checks.
- Local libpq client tools exist, but sibling postgres server binary and postgrest executable were not found. No local database stack was installed or started.

## Approvals and residual state

Authorized in this Hermes session: isolated Deno install and local production-build verification; Q2 honest containment. This does not authorize gated actions in a different harness.
Not authorized: credentials entry, purchases/restore transactions, existing-account data mutation/deletion, production deployments/migrations, cloud builds/uploads, App Store submission. Disposable test-session request had no answer.
Do not erase/uninstall the Simulator or discard its pre-existing Leg draft. A build-only xcodebuild command does not install over the Simulator.

## Completion rule

Both lanes must publish QUIESCENT before final combined checks and stable source provenance. All gate rows remain in the final verdict. Local fixes are not in TestFlight merely because the marketing version matches.

## Final integration receipt — 2026-09-08T04:33:11Z

Both lanes QUIESCENT. FABLE C4/R3 handoff read and acknowledged. Latest app checks: 184 passed / 0 failed, tsc 0, lint 0 (post-review-results.json). Latest backend Deno: both handlers check; 10 passed / 0 failed (final-backend-results.json). Final post-C4 local Release rebuild PASS: 240-file manifest unchanged during build, executable and embedded main.jsbundle verified; see release-final-verification.json.

Artifact: /tmp/coach-kettle-astra-release/Build/Products/Release-iphonesimulator/CoachKettle.app
Version 1.0.2, local build 1. No install, launch, remote build, upload, deploy or account transaction. ASTRA runtime lock released after exact ownership check; no ASTRA runtime process left running. C4 device navigation and acceptance-gate regression remain unverified.

Release HOLD. Next human-dependent action: approve a disposable test account/session and handle authentication. Real persistence, purchase/restore, upgrade, complete device/accessibility, onboarding fixes and privacy/submission gates are not closed. Source-freeze release notice sent to FABLE; this does not authorize unscheduled edits to the verified candidate.
