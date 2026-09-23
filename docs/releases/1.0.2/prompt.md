# Coach Kettle 1.0.2 — Two-model execution prompt

Prepared 2026-09-07 for Master Andrew. Give this entire file to both coding sessions.

## Launch instructions

Prepend exactly one role line when starting each session:

- `ROLE=ASTRA — Execute the ASTRA lane in this document. FABLE is working concurrently.`
- `ROLE=FABLE — Execute the FABLE lane in this document. ASTRA is working concurrently.`

ASTRA is Andrew's ChatGPT 6 Astra session. FABLE is Andrew's Fable 5 session. These are assignment labels, not claims about vendor capabilities or API model identifiers. Do not guess a CLI model flag, substitute another model, launch extra agents, or assume the other session shares your conversation. If no role line is supplied, ask only which lane to execute.

When Andrew supplies this prompt for execution, implement the assigned local fixes, not merely another plan. The creation of this prompt itself does not launch either lane or authorize deployment.

## Overall goal

Turn the existing TestFlight 1.0.2 candidate into a trustworthy, accessible, verified App Store update from public version 1.0.1. This is a reliability and polish release, not a redesign or feature expansion.

The product promise: users can start and finish a workout, log food, reopen correct records, see consistent dates and targets, and receive coaching supported by their actual data.

Andrew confirms public App Store = 1.0.1 and TestFlight = 1.0.2. Preserve marketing version 1.0.2 unless live release-state evidence requires discussion. A new binary needs an appropriate unused build number; inspect the actual EAS version source and latest authorized build records rather than guessing. Do not confuse package.json version with the iOS marketing version. Do not claim local source equals the installed/TestFlight binary without provenance.

## Repository and evidence

Root: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`
Bundle: `com.coachkettle.coachkettle`
Stack: Expo Router / React Native / TypeScript / Supabase Edge Functions / RevenueCat.

Read first:
1. `AGENTS.md`, `CLAUDE.md`, and the technical brief referenced there (resolve actual filename/case).
2. `package.json`, `app.json`, `eas.json`, `tsconfig.json`.
3. `docs/qa/2026-09-06-uiux/QA_REPORT.md` and `screenshots-index.md`.
4. Relevant files and existing tests for your lane. Trace definitions/callers; paths below are starting points, not permission to invent symbols.
5. The peer's status file if present.

Run `pwd`, `date`, `git branch --show-current`, `git status --short`, and read-only baseline checks. At prompt preparation, branch was `b65/66` with substantial tracked and untracked work. Re-check; never clean this up as a prerequisite. Some desired fixes may already exist: reproduce before changing.

Historical QA: real Simulator screenshots and lint/TypeScript passes exist. Several routes were reached by deep links. This is NOT evidence of clean onboarding, complete workout/meal persistence, sandbox commerce, or current release-build correctness. Reproduce observed symptoms; source explanations in the report are hypotheses until independently traced.

## Hard boundaries

- Preserve all pre-existing changes and user data. No reset, clean, stash, checkout, mass formatting, deletion of user work, or automatic commits/pushes.
- No credentials/password entry, real purchases, restore transactions, sensitive account/payment/permission dialogs, or account deletion without separate explicit authorization. Ask Andrew to perform sensitive authentication steps.
- No simulator erase, uninstall, or destructive test cleanup. Existing QA may have left an unsaved Leg draft; do not overwrite/discard it silently. Use authorized disposable fixtures for persistent mutation tests.
- No production Supabase deployment/migration, EAS cloud build/upload, App Store submission, agreement acceptance, or release button without scoped approval. Local code/tests and documentation are the default scope.
- Never read or print `.env`, credential files, tokens, or private account content. QA screenshots may contain account identifiers; keep internal and redact before external sharing.
- No global dependency upgrade, architecture rewrite, new monetization, new analytics, or full exercise-catalog enrichment.
- Follow repo GitNexus requirements: query/context for exploration, upstream impact before symbol edits, report blast radius and HIGH/CRITICAL warnings. If unavailable, document the exact blocker and seek permission for a manual-analysis substitute; do not pretend the required check ran. Run detect_changes before any separately authorized commit.
- Never fabricate screenshots, test results, app behavior, server responses, or a peer handoff.

## Parallel execution protocol — mandatory

Default: work in the existing shared checkout using exclusive file ownership. This avoids losing uncommitted/untracked TestFlight work by branching from an outdated HEAD. Do not create worktrees automatically. Worktrees are preferred only after Andrew authorizes a reviewed common baseline; they do not automatically carry dirty working-tree content.

Coordination directory: `docs/releases/1.0.2/coordination/`.

1. Each lane atomically creates its own `<role>.lock` directory (lowercase astra/fable) using exclusive directory creation, not check-then-write. If it exists, inspect owner information and stop duplicate execution; never steal a stale-looking lock without Andrew's confirmation.
2. Write only your own `astra-status.md` or `fable-status.md`. Include session identifier, timestamp, baseline revision, exact owned paths, current task, completed work, test receipts, requests to peer, blockers, and READY_FOR_REVIEW/QUIESCENT state. Never overwrite the peer's file. Release only locks you created.
3. ASTRA owns `integration.md`, the release checklist, and final release verdict. Both lanes can read all documents. This prompt and old QA evidence remain immutable during execution.
4. Before changing a file, check ownership and read its current contents. Save a lane-specific baseline diff of owned non-secret source files so pre-existing edits are distinguishable. Preserve those edits. An unexpected concurrent change to an owned file is a stop-and-coordinate event, not a merge invitation.
5. Requests to change peer-owned code go into your status with exact path, proposed contract, reason, and acceptance test. The owner implements it. No drive-by edits, even a one-line import or type correction. The owner acknowledges in their own status.
6. New helper/test files follow the owning feature lane and are listed before creation. Shared types, dependencies, build config, and unlisted product files are frozen until ASTRA records an explicit ownership decision. Ownership transfer requires both acknowledgments and the original owner to stop editing that path.
7. Only one session may drive the Simulator, modify its settings, run builds/bundles, restart Metro, install dependencies, regenerate native files, or rebuild the GitNexus index at a time. Use an atomically acquired `runtime.lock` in the coordination directory with owner/action metadata. Release it after restoring state. FABLE gets first UI-test slot; ASTRA proceeds with pure logic tests while waiting. Final combined tests run only after both lanes are QUIESCENT.
8. A peer status document is a handoff, not a real-time message bus. Read it at task boundaries. If the peer is absent, continue independent work; after one final recheck, report pending dependencies and stop rather than polling forever or assuming completion. Andrew may relay the status to resume the other session.
9. No git merge/cherry-pick in shared-checkout mode. Integration means reviewing the combined diff and exercising the combined code. Do not revert peer changes to obtain a green check.

## File ownership

### ASTRA: data correctness, backend contracts, release integration

Exclusive initial ownership:
- `contexts/NutritionContext.tsx`, `contexts/CoachingContext.tsx`
- `components/home/HomeDashboard.tsx`
- `app/(tabs)/nutrition/**`
- `app/coach/**`
- `lib/nutrition.ts`, `lib/coaching.ts`
- `supabase/functions/daily-feedback/**`
- Feature-specific helpers/tests for these areas, after declaring exact paths.

ASTRA is the coordinator for initially frozen shared types, other backend functions, auth/privacy/commerce implementation, app/EAS/package config, and new dependencies. Coordinator status is not permission for broad edits: inspect, scope, allocate, and satisfy approval boundaries first.

### FABLE: workout usability, accessibility, navigation and presentation

Exclusive initial ownership:
- `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`
- `components/workout/**`
- `app/onboarding/**`
- `app/(tabs)/history.tsx`, `app/history/[id].tsx`
- `app/(tabs)/progress/**`
- `app/exercise-library/**`, `lib/exerciseFormat.ts`, `lib/__tests__/exerciseFormat.test.ts`
- `app/(tabs)/more.tsx`
- `app/settings/index.tsx`, `app/settings/notifications.tsx`
- `app/paywall.tsx`, `app/terms-of-service.tsx`
- Feature-specific helpers/tests for these areas, after declaring exact paths.

Shared components, workout hooks/storage, timer state, notification providers, and subscription libraries are NOT implicitly FABLE-owned. Request allocation before changing them.

### Critical cross-lane contract

ASTRA resolves the selected day's nutrition target and handles HomeDashboard's consumption. FABLE owns the Home route and workout-start wiring. Preserve public props/types when practical. If ASTRA needs a prop or import changed in `app/(tabs)/index.tsx`, publish the exact proposed shape and fallback semantics; FABLE applies it. FABLE requests HomeDashboard action-label changes from ASTRA. Do not create a second target resolver or duplicate workout-start logic to avoid coordination.

## ASTRA task queue

A1 — Date and target correctness (release gate)
- Reproduce stale Nutrition day; trace selected-date versus live-today semantics, AppState/focus/timer behavior, and data-query keys.
- Implement the smallest correct rollover/foreground/focus behavior with cleanup and no timer leaks. Do not overwrite a deliberately selected historical date.
- Use one resolved target for Home/Nutrition: training/rest/weekly override, correct local day, transparent source.
- Tests: midnight while active, resume next day, explicit past-date browsing, timezone boundary, training/rest/override selection, and matching Home/Nutrition values. Record expected behavior before implementation.

A2 — Grounded Coach output (release gate)
- Trace the contradictory calorie praise and nutrition-unavailable state across request, stored report, regeneration, and rendering.
- Require matching-date evidence for adherence claims; handle absent/partial/stale logs deterministically. Missing data is not proof of failure or success.
- Remove internal diagnostics from user-facing copy; expose understandable freshness/data availability. Fix verified history-key identity issues.
- Tests: no logs, partial logs, full logs, previous-day report, target changes, regeneration failure. Test backend rules separately from app types. Avoid silently rewriting historical records.

A3 — Nutrition end-to-end and trust
- Verify quick entry, text/photo analysis, search/barcode, correction before save, edit/delete, totals, serving units, duplicate-submit prevention, errors/retries, target persistence, and meal-plan constraints.
- Bring Add Food into clear initial-screen hierarchy; explain base target versus optional weekly override fields.
- Reuse existing barcode/food code and tests; do not replace recent uncommitted implementations. Request additional backend ownership if a reproduced failure reaches outside your lane.

A4 — Release/security/commerce audit and integration
- Audit supported sign-in, session recovery, account-deletion path, AI-sharing consent, RLS/account isolation, media privacy, subscription entitlement enforcement, and build provenance. Missing verification is BLOCKED/NOT RUN, not a discovered vulnerability.
- Coordinate necessary scoped fixes rather than silently expanding ownership. Any unresolved release-critical privacy/auth/commerce requirement means HOLD.
- Inspect app/EAS version settings and production configuration; preserve 1.0.2. Record exact candidate build/commit when verifiable. Do not choose an arbitrary build number.
- Own final full checklist, peer review, combined regression, upgrade-from-1.0.1 evidence, and release decision. Public release remains Andrew's action.

## FABLE task queue

F1 — Workout accessibility and primary action (release gate)
- Reproduce normal-size bottom-composer crowding and Accessibility Extra Large clipping.
- Adapt rows to large text, including stacked layouts when needed; remove fixed-height assumptions and reserve measured keyboard/composer/safe-area space. Do not globally disable font scaling or hide essential values to make screenshots pass.
- Make planned/empty/routine starts predictable without redundant choice. Coordinate HomeDashboard changes with ASTRA.
- Verify long exercise names, long workout, keyboard open, last-row editing, weight/reps input, swipe actions, finish/cancel, and draft behavior. Storage-layer fixes require ownership allocation.
- Acceptance: all essential controls/values readable and reachable at default and largest accessibility sizes; complete set-edit flow at both sizes.

F2 — Onboarding, History, Progress
- Verify Continue validation before changing affordances; improve disabled/required-state clarity without inventing new required questions.
- Test Back/Skip/persistence via an authorized disposable session; existing authenticated route inspection is not onboarding completion.
- Fix count pluralization and score labels. Improve empty-state copy, Pro-gate visibility, measurement instructions, and valid-change Save behavior.

F3 — Exercise catalog presentation
- Format human labels without changing persisted IDs/slugs or corrupting acronyms. Reuse the existing formatter/tests.
- Hide genuinely empty sections, deduplicate displayed muscle labels where appropriate, and align More copy with actual cue coverage.
- Verify search/filter/back navigation and representative equipment/muscle/empty-content cases. Do not fabricate coaching cues, images, or licensing assurances.

F4 — Navigation, accessibility, paywall/legal UI
- Correct visible-tab accessibility semantics after verifying the hidden-route cause. Do not remove a functional route to fix a count.
- Use clear contextual labels and comfortable nonoverlapping targets; this release adopts 44×44 pt as a practical target, not a claim that every smaller control violates Apple policy.
- Improve Settings/action discoverability, paywall scrolling, restore/legal reachability, and exact Terms versus Privacy destinations.
- Inspect localized price/benefit/disclosure rendering without transactions. Never modify billing logic or policy text blindly; coordinate with ASTRA.
- Test VoiceOver, contrast, large text, small iPhone and iPad (app.json currently enables tablet support), supported appearances and Reduce Motion. Distinguish actual iOS bounds from scaled desktop screenshot coordinates.

## Verification loop for both lanes

For each task: inspect → reproduce → impact analysis → minimal failing regression test where feasible → smallest fix → rerun test → real UI verification → record receipts. If no suitable automated test harness exists, inspect neighboring tests and available tools; do not invent `npm test` (current manifest only declares lint among checks). Add focused tests using established patterns; coordinate any new harness/dependency.

Required commands on final combined state:
- `npm run lint`
- `npx tsc --noEmit`
- Relevant existing/new tests using their verified runnable command.
- Separate Deno checks/tests for changed Edge Functions; app tsconfig excludes them. Discover installed tooling before claiming execution.
- Approved local production-build verification using actual project configuration; a Metro session alone is insufficient.

Simulator evidence under `docs/qa/<date>-1.0.2-<role>/`:
- `xcrun simctl list devices booted`
- Identify one exact UDID; do not use ambiguous `booted` if multiple devices are running.
- `xcrun simctl launch <UDID> com.coachkettle.coachkettle`
- `xcrun simctl io <UDID> screenshot <evidence-path>.png`
- Fresh screenshot after each meaningful action; maintain filename/screen/claim index.
- Restore changed settings and disclose residual draft/test state.
- Deep links prove screen rendering, not the preceding tap-driven journey. A screenshot proves display, not persistence. A successful tool action is not a successful app operation.

## Full release gate ledger — ASTRA owns aggregation

Create `docs/releases/1.0.2/RELEASE_CHECKLIST.md` with ID, owner, status (PASS/FAIL/BLOCKED/NOT RUN/NOT APPLICABLE), exact evidence, build/commit, and next action. Cover every item below. No unchecked item may disappear from the verdict.

1. Launch: cold/warm launch; production build without Metro; crash/error states.
2. Upgrade: public 1.0.1 → candidate 1.0.2 preserves records, preferences and entitlements.
3. Onboarding/auth: new user completion, skip/back/resume, units/validation, supported login, session recovery.
4. Workout: blank/planned/routine start, edit/add/remove, keyboard, timer/background, finish/cancel, save→History→relaunch, draft recovery, offline/retry without duplicates.
5. Nutrition: manual/text/photo/search/barcode, portions/corrections, save/edit/delete/totals, targets/overrides, midnight/timezone, meal plan, errors and retry.
6. Coach/programming/form check: evidence states and freshness, chat/history, assigned-workout start, included upload/results/error flows, safe advice and entitlement enforcement.
7. History/progress/library: correct values/units/dates, empty/loading/error states, measurements/photos, charts, catalog search/details, content/licensing audit.
8. Settings/notifications: preference persistence, permission-denied alternatives, timer/reminder behavior, contextual accessible labels.
9. Accessibility: default/largest text, keyboard/safe areas, small iPhone, physical iPhone, iPad, actual VoiceOver traversal, measured contrast, supported appearances/Reduce Motion.
10. Commerce: authorized sandbox purchase/cancel/pending/failure, restore, relaunch/second-device entitlement, expiry, localized StoreKit prices, accessible disclosure/legal/manage paths.
11. Privacy/security: third-party AI disclosure/permission before personal-data sharing, privacy answers/policy consistency, account deletion, applicable sign-in requirements, cross-account access tests, private media, secrets/log hygiene, permission strings and SDK privacy declarations.
12. Submission: marketing version/build provenance, final lint/types/tests/Edge checks, production/TestFlight evidence, working support/privacy URLs, screenshots without personal data, accurate What's New and review notes, reviewer access/backend availability, rollout monitoring/recovery plan.

Purchases, credentials, account deletion, production deploys, and App Store interactions remain approval-gated. Document exact manual steps for Andrew where blocked. Do not label the candidate release-ready while a required gate lacks evidence. Existing 1.0.2 TestFlight availability does not prove that the new local fixes are in that binary.

## Handoff, review and completion

Each lane writes `docs/releases/1.0.2/<role>-handoff.md` with:
- task IDs and PASS/FAIL/BLOCKED status;
- reproduced root causes versus remaining hypotheses;
- exact files changed and preserved pre-existing work;
- public contract changes and requests to peer;
- test commands, actual exit codes/results, screenshots and tested build identity;
- unresolved risks and scoped approvals needed;
- READY_FOR_REVIEW plus explicit QUIESCENT declaration when editing stops.

Peer review is read-only: FABLE reviews ASTRA's date/target/Coach UX; ASTRA reviews FABLE's logging accessibility and data-preservation behavior. Send corrections to the owner. Resume edits only after publishing that the lane is active again; invalidate combined test results affected by subsequent changes.

ASTRA runs final combined checks after both lanes are quiescent and produces `RELEASE_VERDICT.md`: READY FOR AUTHORIZED NEXT STEP or HOLD, never an approval guarantee. Include release notes draft, outstanding manual gates, exact build/commit, final commands/results, and rollback/recovery considerations. Do not submit or publish.

Final response from either model: completed IDs, changed files, real verification, peer dependencies, remaining blockers, artifact paths, and one concrete next action. No unsupported 'done', no infinite waiting, no speculative rewrite.

## Research basis (official sources, checked 2026-09-07)

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/ — app completeness/device testing/reviewer access (§2.1), subscriptions (§3.1.2), privacy/account deletion (§5.1.1), explicit permission before third-party AI sharing of personal data (§5.1.2). These are review checks, not proof of an existing violation.
- Apple Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility — support larger text, assess contrast, and provide appropriately sized controls. Current guidance distinguishes default and minimum sizes; the team's 44 pt target is intentionally conservative.
- Apple Typography: https://developer.apple.com/design/human-interface-guidelines/typography — adapt layouts across Dynamic Type sizes; stack constrained columns and minimize truncation instead of suppressing scaling.
- Expo version management: https://docs.expo.dev/build-reference/app-versions/ — user-facing version differs from developer-facing build number; remote/local source and autoIncrement determine actual build versioning. Inspect existing configuration before changing it.
- Git worktrees: https://git-scm.com/docs/git-worktree — separate working trees support parallel branches but do not substitute for capturing this repository's dirty baseline. Exclusive file ownership and the handoff/lock protocol above are this project's engineering design, not a Git guarantee.

## Paste-fast starters

ASTRA: `ROLE=ASTRA. Read /Users/me/Desktop/partner/11_Codebases/Coach-Kettle/docs/releases/1.0.2/prompt.md completely. Execute only your lane and coordination duties. FABLE works concurrently. Preserve dirty work, acquire your lane lock, publish status, and begin independent date/target/Coach work. No deployment or sensitive actions.`

FABLE: `ROLE=FABLE. Read /Users/me/Desktop/partner/11_Codebases/Coach-Kettle/docs/releases/1.0.2/prompt.md completely. Execute only your lane. ASTRA works concurrently. Preserve dirty work, acquire your lane lock, publish status, and begin workout accessibility work. Respect file ownership and runtime lock. No deployment or sensitive actions.`
