# Auto-rest controls — local implementation evidence

## Scope and receipts

Implemented the Timer-header native Auto rest switch and independent tappable duration, accessible bottom-sheet editor with 60/90/120/180-second presets, existing Dial reuse (15–600 seconds / 5-second steps), explicit Save, and cancel/backdrop/back dismissal without preference writes. Off dims duration but leaves it editable. Manual selection and live timer lifecycle remain separate.

The shared NotificationsProvider supplies both Timer and Settings; updates are confirmed rather than optimistic, concurrent writes reject immediately, and account changes fence late responses. Loading/saving controls and readable errors/retry are wired. The API rejects missing or mismatched auto-rest confirmations (including an undeployed old server). The Edge handler defaults the duration to `null` (classifier), allowlists it, accepts `null` or 15–600 s in 5-s steps, and no longer turns DB read errors into default preferences.[^s2]

Strength ingestion starts/restarts the shared timer only after successful durable local log intent, using the saved fixed duration when there is one; a `null` duration runs the committed classifier exactly as at HEAD.[^s2] It filters performed/valid strength evidence, deduplicates a guarded submission's batch/reprocessing, and fences stale ownership/generation. Existing once-per-render submission guard remains unchanged. Cardio, rejected input, failed local persistence and stale results do not start rest. Auto off keeps the existing idle Start Rest prompt, and so do unconfirmed prefs (loading, offline/failed fetch, or another account's).[^s2] Remote sync remains offline-first; server acknowledgement is not required for a locally logged set.

Migration `20261013000100_auto_rest_duration.sql` is additive: a NULLABLE integer with no default, with a CHECK (15..600, modulo 5) that applies only when non-null. Existing boolean/default false untouched.[^s2]

## Tests / executed commands

Working directory: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.

- `node --test lib/__tests__/autoRest.test.ts`: **13 passed / 0 failed**. Real production TS/TSX executed using existing source/VM harness, synthetic hook/JSX runtime and IO doubles; this is not a device renderer. Covers save/cancel/custom/manual independence, failed Save, loading/saving gates, Settings shared switch, concurrent writes/account switch, remount/account-scoped preference loading/read errors, failed durable log/cardio/reprocessing, saved-duration trigger independent of permission/alerts, auto-off prompt, actual handler duration bounds, and API acknowledgement mismatch/missing responses.
- `node --test 'lib/__tests__/*.test.ts'`: **3669 passed / 0 failed**, exit 0.
- `node --test 'supabase/functions/_shared/*.test.ts'`: **113 passed / 0 failed**, exit 0.
- `npm run lint`: exit 0, no lint warnings reported.
- `npx tsc --noEmit`: exit 0. App tsc excludes Edge functions/tests per repository configuration.
- `git diff --check`: exit 0.
- `npx expo export --platform ios --output-dir /Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/ios-export-verified`: exit 0, **2164 modules**, Hermes bundle produced. Build/bundle evidence only, not native UI verification.
- `python3 /Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/verify_pg.py`: exit 0 using local PostgreSQL 15.14. Runs `supabase/tests/auto_rest_duration.sql` against an empty disposable minimal-schema DB, applies the actual migration, verifies prior opt-in/out values, defaults, new-account defaults, accepted custom boundaries and rejected out-of-range/off-step values, and reads back rows.[^s2] UTF8 and `listen_addresses=''` verified, scratch Unix socket only. Rolled back and server stopped; PID absence verified. First attempt hit client-only libpq initdb; retried with installed PG15 binaries. Not full-schema/RLS or deployed API-to-DB evidence.

RED receipts: before production edits the new tests failed on duration 14 returning 200, automatic trigger omitting saved duration, missing API preference acknowledgement not rejecting, missing Timer controls, concurrent write staying pending, ingestion starting before durable intent, Settings switch missing saving gate, old server silently ignoring duration, and DB-read failure returning defaults. Harness import/export extraction errors were corrected before interpreting behavioral RED.

Scratch logs and baseline diff: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/` (`focused-final.log`, `lib-suite-verified.log`, `edge-suite.log`, `pg-proof-final.log`, `deno-check.log`, `deno-baseline.log`, `ios-export-verified.log`, `baseline.diff`).

## Blockers and open gates

- `xcode-select -p` returned `/Library/Developer/CommandLineTools`; `xcrun simctl list devices booted` failed because simctl is absent. No simulator/device interaction, VoiceOver check, background notification check, or UI screenshot was captured. No browser UI claim.
- `npx --yes deno check supabase/functions/notifications/index.ts`: exit 1, existing TS2538 at `enabledKey` symbol indexing in the unrelated send branch. Checked the exact original `6772246230965d7af937479746f14d227fd0c0e2` source in scratch with the same Deno command: identical TS2538 at original line 218. Left baseline failure untouched; Edge behavior tested through production-source handler IO doubles.
- Real authenticated relaunch, cross-account/device preference readback, native layout/accessibility, active-timer continuation, background/pause/resume/alerts, full DB migration/RLS and deployment remain release gates. No production services were written, migration applied remotely, function deployed, or release configuration changed.

## Ownership / concurrent checkout note

Initial HEAD `6772246230965d7af937479746f14d227fd0c0e2`, branch `deps/audit-2026-09-25`; initial dirty diff captured before edits. During this worker the checkout HEAD changed externally to `d46c90465f9d9dead4a2ea4dab7eef92524a1b8d` and unrelated reliability edits appeared/changed. This worker made no commit/push/reset and retained unrelated content through targeted patches. In index.tsx the unrelated `saveWorkoutLocalFirst(... owner: endOwner)` hunk is not this worker's change.

This worker's changed paths: `app/(tabs)/timer.tsx`, `app/(tabs)/index.tsx` (trigger/ingestion only), `app/settings/notifications.tsx`, `contexts/NotificationsProvider.tsx`, `types/notifications.ts`, `lib/notifications.ts`, `supabase/functions/notifications/index.ts`, new migration/test above, `lib/__tests__/autoRest.test.ts`, this evidence file and `doc.md`.

## Independent SPEC repair receipts

The prior 13-test receipt was insufficient: independent SPEC reproduced two real gaps. Original `sendMessage` retained a render-time `triggerRestTimer` after awaited AI/local persistence, so acknowledged OFF still started 60 and acknowledged 180 started 60. Inline/modal edits durably logged newly performed rows without calling rest, as at HEAD; edit-triggered rest was added as a new trigger source, kept pending product decision Q3.[^s2] RED command `node --test lib/__tests__/autoRestRepairs.test.ts` returned **8 passed / 5 failed**, including exact `1 !== 0`, `60 !== 180`, and three missing-transition `0 !== 1` failures before production repair.

Fix scope: `app/(tabs)/index.tsx` trigger and edit-delivery paths; `contexts/NotificationsProvider.tsx` acknowledgement-time account-scoped `getConfirmedPrefs`; new `lib/__tests__/autoRestRepairs.test.ts`; getter/ref fixture updates in `lib/__tests__/autoRest.test.ts`, `lib/__tests__/coachingFeedback.test.ts`, `lib/__tests__/p4AuthRecovery.test.ts`; this file and `doc.md`. No changes to `lib/performedSets.ts` (read and retained its transition semantics), timer UI, manual timer, duration presets, permission, notifications or migrations in this repair dispatch.

### Boundary matrix

| Boundary | Executed result |
| --- | --- |
| Actual fast/fill/AI `sendMessage`, deferred durable success, confirmed OFF | No auto start; one idle manual prompt |
| Actual fast/fill/AI `sendMessage`, deferred durable success, confirmed 180 | One start at exactly 180 seconds |
| Actual inline edit (real `applyPendingEdit`), modal save (real transition), pending-edit commit | No rest before durability; confirmed OFF prompts once / 180 starts exactly once |
| Already-performed correction and original-transition replay | No additional start or prompt |
| Duplicated/new identity via edit delivery | No rest effect |
| Invalid/cardio edit delivery | No rest effect |
| Failed durable edit, owner or draft generation changed while pending | No rest effect |
| Foreign-account preference getter | No start; one manual prompt (unconfirmed = auto OFF, as HEAD)[^s2] |
| OFF on running timer | No start/prompt; original tests also cover paused/done |
| Provider confirmed update before consumer rerender; account change | Getter returns exact new 180 immediately; old getter returns null after account switch |
| Existing cardio/failure/reprocessing and numeric/routine/auth suites | Retained, complete lib suite passes |

`queueLiveRows` receives the pre-edit snapshot only from edit delivery. It compares old eligibility and existing ID after durable success, validates strength evidence and policy, deduplicates effects by owner/session/generation/row, then invokes the same latest-confirmed trigger used by ingestion. Request/ownership/generation fences remain. A preference change alone never restarts an active timer.

### Commands and final verdicts

All commands ran in `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`:

- `node --test lib/__tests__/autoRest.test.ts lib/__tests__/autoRestRepairs.test.ts`: **35 passed / 0 failed**, exit 0 (13 retained plus 22 new).
- `node --test 'lib/__tests__/*.test.ts'`: **3691 passed / 0 failed**, exit 0. Log: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/repair-lib-final.log`.
- `node --test 'supabase/functions/_shared/*.test.ts'`: **113 passed / 0 failed**, exit 0. Log: same scratch directory, `repair-edge-final.log`.
- `npm run lint`: exit 0, no lint warnings.
- `npx tsc --noEmit`: exit 0 (existing app tsconfig excludes Edge/tests).
- `git diff --check`: exit 0.

Intermediate retained focused tests failed with missing `getConfirmedPrefs` after the closure dependency changed; first full lib run returned 3686/3688 with two analogous missing-boundary dependencies in coaching/auth fixtures. Added explicit getter/current-state and forbidden-effect dependencies while preserving all assertions, then reran successfully. Node emits the existing MODULE_TYPELESS_PACKAGE_JSON warning; offline-fixture logs are expected. Do not treat the intermediate run as passing.

These are actual production closures/modules with synthetic hooks and durable/API IO doubles, not native renderer/device or remote persistence verification. Existing native, deployment and Deno baseline gates above remain unchanged. No deploy, commit, reset, migration application or production write. Targeted patches preserved the concurrent dirty checkout.

## Independent QUALITY transport/permission repair receipts

QUALITY reproduced two additional defects after the SPEC pass: response fencing alone allowed A's pending preference save to authenticate and write under B; `reloadPrefs` returned while busy and lost the refresh following permission grant. Both are repaired locally, **awaiting independent SPEC then QUALITY re-review**, not approved or released.

Changed in this repair only: `contexts/NotificationsProvider.tsx`, `lib/notifications.ts`, new `lib/__tests__/notificationOwnership.test.ts`, `doc.md`, and this evidence file. No auth overhaul: `lib/auth.ts` is executed unchanged. Provider captures the user ID and supplies it through preference GET/POST, permission bootstrap and token registration to existing `fetchWithAuth(..., 1, expectedOwner)`. This boundary validates authentication after async session acquisition/refresh and preserves expectedOwner recursively through 401 retries. Permission callbacks from stale account renders do not initiate new registration. Other notification APIs remain out of scope.

Busy reload requests set an owner-local `refreshPending` flag. Save `finally` releases busy/saving and drains one coalesced refresh only for the still-mounted exact owner scope, on success or failure. The refreshed confirmed prefs preserve durable auto-rest settings and permission grant; failed GET is visible and retryable. Account changes replace the entire owner scope, so neither old cleanup nor its deferred refresh affects B. Existing revision/response guards remain.

### RED receipts

- `node --test lib/__tests__/notificationOwnership.test.ts` before owner propagation: **0 passed / 1 failed**, exact forbidden-B-write assertion `1 !== 0`, despite provider save rejecting. Log `quality-owner-red.log`.
- After owner repair, adding the held-save permission success/failure regressions produced **1 passed / 2 failed**, exact permission assertion `false !== true`. Log `quality-permission-red.log`.
- Expanded matrix first run was **21 passed / 1 failed**: fixture incorrectly expected stable `getConfirmedPrefs()` to remain null after B had completed its own bootstrap. Corrected to require B's confirmed prefs (and no stale deferred IO), matching the getter's existing current-owner contract; no production change for that fixture. Original log retained as `quality-matrix.log`.

### Executed boundary matrix

| Boundary | Result |
| --- | --- |
| Save / reload / permission registration × held getSession, missing-session refresh, proactive refresh, 401 refresh, retry getSession (15 schedules) | Zero B writes; exactly B's own bootstrap GET, no old-owner GET; B prefs/token/permission untouched |
| A saves 180, awaits authentication, B renders, B session released | Save rejects, zero B update_prefs, B remains 60 |
| Grant during successful save with held old permission-false response | Deferred GET confirms permission true and saved 180; real reconciliation schedules a local reminder |
| Grant during failed save | Deferred GET confirms permission true and prior durable 60; busy clears and subsequent 125 save succeeds |
| Deferred refresh requested, then switch/unmount before save settles | No stale deferred GET or preference delivery |
| Deferred GET fails / account switches while GET is pending | Loading/saving clear; error retry restores grant / B stays unchanged |
| Native permission prompt resolves after switch | No B token registration |
| Same-owner 401 retry | Legitimate save succeeds at 180; permission refresh succeeds |
| Retained auto-rest UI/ingestion/edit suites | Native switch/duration independence, saved defaults/bounds, effect-time confirmed preferences, post-durability deduplication, OFF prompt and active timer rules remain passing |

### Final executed commands

Working directory `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`:

- `node --test lib/__tests__/autoRest.test.ts lib/__tests__/autoRestRepairs.test.ts lib/__tests__/notificationOwnership.test.ts`: **59 passed / 0 failed**, exit 0 (24 new transport/race tests).
- `node --test 'lib/__tests__/*.test.ts'`: **3715 passed / 0 failed**, exit 0.
- `node --test 'supabase/functions/_shared/*.test.ts'`: **113 passed / 0 failed**, exit 0.
- `npm run lint`: exit 0.
- `npx tsc --noEmit`: exit 0 (app configuration; Edge/tests excluded).
- `git diff --check`: exit 0.

Logs under `/Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/`: `quality-focused-final.log`, `quality-lib-final.log`, `quality-edge-final.log`, `quality-lint-final.log`, `quality-tsc-final.log`, `quality-diff-final.log`. Existing Node typeless-package warnings and expected permission-owner rejection warnings are visible, not suppressed.

These tests execute complete production provider/API/auth modules using synthetic React hooks and explicit Supabase auth/native-notification/fetch IO doubles. Fake transport storage is read back to prove forbidden writes did not occur; this is not live auth, remote DB, native renderer or device evidence. Earlier native/deployment/Deno baseline gates remain unchanged. No commits, deployment, migration application, production writes or unrelated file edits in this repair.

## Overlapping save/deferred-refresh state-machine repair

### Confirmed defect and scope

Final QUALITY's remaining source-derived hypothesis was reproduced against the real provider/API/auth modules before production repair. Schedule: capture ready callback (`loading=false`), hold save A, register permission, release A into a held deferred GET, invoke retained callback for save B, let B settle, then release GET. The prior save-only busy flag had already been released; B advanced the revision and GET's finally skipped `setLoading(false)`. Both GET success/failure cases actually remained loading, rather than merely allowing a theoretical race.

RED: `node --test --test-name-pattern='retained ready callback' lib/__tests__/notificationOwnership.test.ts` → **0 passed / 2 failed**, exit 1, exact assertion `settled GET must not leave controls permanently disabled`, `true !== false`. Log: `overlap-red.log`. After the production fix the ownership file returned **26 passed / 0 failed** (`overlap-green.log`), then six additional boundary tests expanded the matrix.

This dispatch modifies only `contexts/NotificationsProvider.tsx`, `lib/__tests__/notificationOwnership.test.ts`, `doc.md`, and this evidence file. It does not change timer/ingestion/auth/API/Edge/schema code. GitNexus impact lookup for `NotificationsProvider` returned target-not-found / UNKNOWN (not low risk); text fallback confirmed root layout mounting and the Timer, notification Settings and workout-ingestion consumers. Unrelated initial dirty changes were preserved, without commit/reset/deploy/production writes.

### Structural lane and boundary matrix

The exact rendered owner scope holds current `ready`, `phase` (`idle` / `saving` / `refreshing`), `revision` and `refreshPending`. Rendered loading/saving remain display state, not concurrency locks. Only lane admission advances revision, so a rejected retained save cannot obsolete a refresh. Callbacks capture scope identity, not just account ID, including an A→B→A return. Successful load marks readiness at acknowledgement time. Refresh failure preserves previously confirmed readiness; initial failure still requires a successful reload before saving.

| Current boundary / event | Enforced transition and executed evidence |
| --- | --- |
| Initial bootstrap / save attempt | Refreshing/not ready rejects before mutation IO. A callback retained from loading=true becomes usable once current readiness is confirmed, without requiring rerender. |
| Idle ready / save | Enters saving synchronously; duplicate callback invocation rejects before second mutation IO. Success/failure finally releases its own lane. |
| Saving / permission or reload | Coalesces pending intent; success/failure cleanup starts deferred refresh synchronously before another save can enter (retained held-save tests). |
| Deferred refreshing / stale ready save callback | Rejects before IO; both successful and failed GET settle loading/saving, preserve permission intent, and allow a subsequent save/retry. This is the original RED schedule. |
| Refreshing / permission registration and multiple reloads | One held GET, then exactly one coalesced follow-up GET; no parallel GETs. First GET success or failure both drain the grant. Lane stays refreshing across follow-up, then error/loading clear and later save succeeds. |
| Refresh failure / explicit retry | Visible error, loading false; retained reload retries, confirms permission, clears error; retained save then confirms 125. |
| Old refresh with pending follow-up / switch, unmount or A→B→A | Stale save/reload/permission callbacks initiate zero IO, old completion drains no queued GET and cannot unlock replacement bootstrap or deliver old prefs. New owner/current epoch remains independently usable. |
| Save/reload/permission / auth session or retry boundaries | All original 15 owner-transport schedules retained: zero B writes and only B bootstrap GET. |
| Existing Timer, Settings, ingestion and edit effects | Both retained auto-rest suites pass unchanged: custom duration/manual independence, durable-effect ordering, latest confirmed prefs, OFF prompt, active timer and transition deduplication remain intact. |

Refresh uses a try/finally covering its entire coalesced drain; each iteration validates response owner/revision and catches failures. Cleanup changes only its own owner phase and delivers loading=false only for the still-mounted exact scope. This avoids both revision-dependent stuck cleanup and lost registration intent arriving during an in-flight GET.

The first expanded focused/full runs returned **66/67** and **3722/3723**: the new A→B→A fixture incorrectly supplied one consumable `Response` instance to two simultaneous bootstrap fetches. Separate deferred B/current responses fixed that IO double while preserving every behavioral assertion; no production change was needed. Original receipts are retained as `overlap-focused-first-matrix.log` and `overlap-lib-first-matrix.log`, not reported as passing.

### Final actual checks

All commands ran in `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`:

- `node --test lib/__tests__/autoRest.test.ts lib/__tests__/autoRestRepairs.test.ts lib/__tests__/notificationOwnership.test.ts`: **67 passed / 0 failed**, exit 0.
- `node --test 'lib/__tests__/*.test.ts'`: **3723 passed / 0 failed**, exit 0.
- `node --test 'supabase/functions/_shared/*.test.ts'`: **113 passed / 0 failed**, exit 0.
- `npm run lint`: exit 0, no lint warnings reported.
- `npx tsc --noEmit`: exit 0 (app config excludes Edge/tests).
- `git diff --check`: exit 0.
- `npx expo export --platform ios --output-dir /Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/overlap-ios-export`: exit 0; **2164 modules**, Hermes bundle `_expo/static/js/ios/entry-769aff5375d680ccbe8e929ae6e66188.hbc` produced. Build evidence only, not native UI execution.

Logs under `/Users/me/.hermes/profiles/telegramlite/cache/scratch/auto-rest/`: `overlap-focused-final.log`, `overlap-lib-final.log`, `overlap-edge-final.log`, `overlap-lint-final.log`, `overlap-tsc-final.log`, `overlap-diff-final.log`, `overlap-ios-export.log`. Existing Node typeless-package warnings and intentional permission-owner errors remain visible. Production module execution uses synthetic hooks and explicit auth/native/fetch doubles, not independent approval, device rendering or remote persistence proof. Independent final review and the earlier native/deployment/Deno baseline gates remain open.


## Independent SPEC repair 2 — classifier default, unconfirmed prefs, edit-path guard

Independent SPEC reproduced two HIGH regressions against HEAD; both are repaired locally, **awaiting re-review**, not approved or released.

1. **NULL means classifier.** Migration rewritten: `auto_rest_duration_sec integer` NULLABLE, no default, `CHECK (IS NULL OR (BETWEEN 15 AND 600 AND % 5 = 0))`. Type is `number | null`. `triggerRestTimer` passes `undefined` for null, so `useRestTimer.start` runs `suggestRestSeconds` exactly as HEAD. The Edge `getPrefs` no-row default is `null`; `update_prefs` accepts `null` (reset to Auto) or a bounded value. `updatePreferences` still rejects an old server that drops the field. The Timer header shows **Auto (suggested)** for null; the sheet adds an Auto option next to the presets, so the user can pick a fixed duration or go back to Auto. The dial keeps its own position, so selecting Auto never scrolls it (a programmatic scroll could re-fire `onChange` and overwrite Auto).
2. **Unconfirmed prefs behave as auto-start OFF.** `getConfirmedPrefs()` null (loading, offline/failed fetch) or another account's prefs no longer return early; the manual Start Rest prompt appears exactly as at HEAD (still suppressed while a timer is active).
3. **Planned→performed edits still trigger rest** (new trigger source; policy recorded under Q3). Tests now pin the `restWorkSetsOnly` guard on that path.
4. **Edge bounds** tests add 10 (below min, %5-valid), 605 (above max, %5-valid), 0, -5 and `null` acceptance (asserts the upsert actually carries `null`).
5. **Known pre-existing deviation (not changed):** `supabase/functions/notifications/index.ts` reads and writes user preferences through the service-role `admin` client (scoped by the verified JWT user id), not the anon-key + bearer pattern in `.claude/CLAUDE.md`. That predates this work; RLS is bypassed for these calls.

### RED / GREEN receipts

- `node --test lib/__tests__/autoRest.test.ts` before production edits: **13 passed / 6 failed**: handler `null` 400≠200; real trigger + real `useRestTimer.start` at compound 5 reps `60 !== 180`; loading and offline (real provider) prompt `0 !== 1`; Timer label `'Auto-rest duration 1:00'` ≠ `'… Auto (suggested)'`; `getPrefs` default `60 !== null`.
- `node --test lib/__tests__/autoRestRepairs.test.ts`: **23 passed / 1 failed** (foreign-prefs prompt `0 !== 1`). The `restWorkSetsOnly` edit-path tests pass on current code, because the guard already existed. Mutation-RED: with the guard clause removed from `queueLiveRows`, **23 passed / 4 failed** (warmup/backoff/drop `1 !== 0`, plus foreign-prefs). The file was restored byte-identical (`cmp`).
- Edge bounds 10/605 were already rejected. Mutation check: removing `< 15` fails at `10`; removing `> 600` fails at `605`. The file was restored byte-identical.
- SQL fixture `supabase/tests/auto_rest_duration.sql` rewritten to run inside `BEGIN … ROLLBACK` on either an empty DB (creates a minimal table) or the existing local stack (real uuid/FK table plus throwaway `auth.users` rows). It applies the migration only when the column is absent. Against `postgresql://postgres:postgres@127.0.0.1:55122/postgres`, with the old NOT NULL DEFAULT 60 migration it fails `auto_rest_duration_sec must be nullable with no default`. With the new migration it exits 0: existing and new rows are NULL, opt-in/out are unchanged, 15…600 round-trip, -5/0/10/14/16/599/601/605 are rejected, and the NULL reset is accepted. It also exits 0 when the migration is pre-applied in the same transaction. Empty-DB mode was also run in a temporary `ar_fixture_tmp` database on the same server (no `auth` schema, so the minimal table was created) and exited 0; the database was dropped afterwards. Afterwards the column count is 0 (nothing persisted).

### Gates (all in the repo root)

- 4 auto-rest/notification test files: **90 passed / 0 failed**.
- `node --test "lib/__tests__/*.test.ts"`: **3747 passed / 0 failed**.
- `node --test "supabase/functions/_shared/*.test.ts" supabase/functions/next-set/*.test.ts supabase/functions/chat/handler.test.ts supabase/functions/coach/*.test.ts`: **203 passed / 0 failed**. There is no test file under `supabase/functions/notifications/`; its handler is executed by `lib/__tests__/autoRest.test.ts`.
- `npx tsc --noEmit` exit 0; `npx expo lint --max-warnings 0` exit 0; `git diff --check` exit 0.
- Direct `eslint` on the changed files: app/context/type/test files are clean. Pre-existing findings at HEAD remain: `import/no-unresolved` on the Deno URL imports in `supabase/functions/notifications/index.ts`, and the unused `e` in `lib/notifications.ts:35`.

Still open: native/device verification, deployment, and `supabase db push` (run by the user).

### QUALITY follow-up (after SPEC PASS)

- Provider exposes `prefs` only when `prefs.user_id` matches the current account (`loadedOwner` removed); `isMounted` is declared before `getConfirmedPrefs`; `fetchPreferences` returns `Promise<NotificationPreferences>` and the dead `!p` check is gone.
- `triggerRestTimer` no longer re-checks `user_id`: `getConfirmedPrefs()` is already account-fenced. The account-switch case is now tested through the real provider (`unconfirmed prefs (switched)`), replacing the closure-level foreign-prefs test.
- Tests use the shared harness (`sourceClosure` for index.tsx closures, `sourceModule` for `lib/notifications.ts` and the real `useRestTimer` hook); the Edge module is loaded whole and driven through its served handler (`getPrefs` now via `GET ?action=prefs`). The 50 ms race became a deterministic flush plus `assert.rejects`.
- Edge validator reads `const d = body.auto_rest_duration_sec` (same semantics). The SQL fixture inserts its rows once, before the migration switch.
- **Not done:** the shared `isRestEligible` predicate (QUALITY item 1). Extracting it as a module-level helper in index.tsx breaks 56 committed tests: their `sourceClosure` VM contexts in `lib/__tests__/workoutIdentityHarness.ts` don't define it. That harness is outside this repair's file scope.

[^s2]: Superseded (SPEC repair 2): the original text claimed NOT NULL DEFAULT 60 (which silently replaced the classifier for every existing auto-start user: compound at 5 reps went from 180 s to 60 s), an Edge default of 60, rejection of `null`, no prompt for unconfirmed or foreign prefs, and a fixture that asserted those. It also described edit-triggered rest as a fix for a gap. All of these were contradicted by independent SPEC review and are corrected above.
