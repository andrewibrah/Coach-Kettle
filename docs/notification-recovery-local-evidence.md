# Loaded-preference Retry recovery — local evidence

## Bounded repair

Timer and Notifications Settings previously rendered the provider's read-error alert but hid Retry whenever confirmed preferences were populated. Both error blocks now render the existing `reloadPrefs` Retry for a provider error, irrespective of whether preferences are loaded. Native `disabled` and accessibility disabled state use `loading || saving`. Confirmed values, manual timer behavior, duration editing, provider contracts and API/Edge/persistence behavior are unchanged. Timer's local Save error remains separate; a provider error supplies refresh recovery, not an automatic resubmission of a failed mutation.

Changes for this repair only:
- `app/(tabs)/timer.tsx`: one Retry condition/disabled-state line.
- `app/settings/notifications.tsx`: one Retry condition/disabled-state line.
- New `lib/__tests__/notificationRecoveryScreens.test.ts`.
- This evidence document.

Pre-existing unrelated dirty files were left intact; no commit, push, deployment or remote writes.

## Production-screen regressions

The new 12-test suite mounts complete production Timer/Settings screens with React test renderer. Four recovery cases use the actual `NotificationsProvider`, with only notification IO and unrelated app/native boundaries doubled. Eight busy-state cases supply controlled hook values to exercise error+loading/error+saving, with both populated and absent preferences, asserting native/accessibility disabled props and zero reloads through disabled-aware press dispatch. The same button becomes actionable after returning idle. These busy cases do not claim native-device event dispatch evidence.

For each screen, real-provider tests cover:
- Loaded prefs, failed refresh, retained confirmed values, visible alert and actionable Retry.
- Retry issues exactly one new preference read; successful confirmation clears the provider error, removes Retry/alert, and updates prefs and permission.
- Timer retains the confirmed duration and allows independent manual 90-second Start while refresh recovery is needed; confirmed 180-second auto duration appears after recovery.
- Settings retains confirmed reminder hour; successful recovery updates its hour and permission-dependent test-push affordance.
- Absent prefs after failed bootstrap retain Retry recovery and confirm prefs after a successful read.

RED was executed before production edits. Initial `red.log` included a Timer fixture issue: the synthetic Modal displayed hidden content and counted a second alert. Native Modal's `visible` behavior was corrected without weakening the recovery assertions. Preserved `red-corrected.log` then reports **0 passed / 2 failed**, both at `Retry must remain visible with populated preferences`. The two loaded-preference tests passed immediately after the bounded repair. Busy/absent-state compatibility coverage was then added.

## Executed verification

Working directory: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.

- `node --test lib/__tests__/notificationRecoveryScreens.test.ts lib/__tests__/notificationOwnership.test.ts lib/__tests__/autoRest.test.ts lib/__tests__/autoRestRepairs.test.ts`: **79 passed / 0 failed**, exit 0; includes all **12** new screen tests.
- `node --test 'lib/__tests__/*.test.ts'`: **3735 passed / 0 failed**, exit 0.
- `npm run lint`: exit 0, no lint warnings.
- `npx tsc --noEmit`: exit 0, no diagnostics.
- `git diff --check`: exit 0.
- `npx expo export --platform ios --output-dir /Users/me/.hermes/profiles/telegramlite/cache/scratch/notification-recovery/ios-export`: exit 0, Hermes iOS bundle and metadata produced.

Receipts: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/notification-recovery/` contains `red.log`, `red-corrected.log`, `focused.log`, `full.log`, `lint.log`, `tsc.log`, `export.log`, and `ios-export/`.

Known test-run notices: Node's existing package module-type warning and React test renderer deprecation warning. No failing tests. The renderer uses native host doubles, not a simulator/device or screenshot. Export proves bundle generation, not native layout/accessibility, live permissions, or deployed-service correctness. No provider/API changes or database verification was required in this UI-only repair. Awaiting final independent review; native/device release gates remain open.
