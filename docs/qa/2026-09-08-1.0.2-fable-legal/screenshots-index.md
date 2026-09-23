# FABLE — C4 / R3 reader evidence (2026-09-08)

Device: iPhone 17 Pro, iOS 26.0, UDID F0340485-E7C5-418D-9989-8AEC53F14E34 (only booted).
Debug build served by Metro. NOT the ASTRA Release artifact, NOT the TestFlight binary.

| File | Shows | Does NOT show |
|---|---|---|
| `01-app-after-reload.png` | App reloaded with C4 + R3 code present. | Any legal screen. |
| `02-reader-privacy-deeplink.png` | **Attempt failed.** `xcrun simctl openurl coachkettle://terms-of-service?doc=privacy&mode=read` raised the iOS "Open in Coach Kettle?" confirmation, which requires a tap. Second time this blocked a deep link; it is not a usable navigation path in this environment. Do not cite as reader evidence. | The reader, the title, or the Close button. |
| `03-state-restored.png` | Clean state restored via `launchctl kickstart -k system/com.apple.SpringBoard`. No dialog, text size still `large`, Header shrink-to-fit fix visibly correct ("Coach Kettle" full title). | Anything about C4/R3. |

## C4 and R3 reader mode are NOT VERIFIED ON DEVICE.
Both are compile- and lint-verified only (`tsc` 0, `lint` 0, 184/184 tests). No screenshot
shows the Settings Legal rows, the corrected modal title, or the Close button.
Cause: `simctl` has no tap primitive; `idb`/`cliclick` are not installed and adding one is an
unapproved dependency change; deep links are blocked by a system confirmation dialog.

## MANUAL STEPS FOR ANDREW (each is one tap-through)
1. Settings -> scroll to the new **Legal** section. Confirm two rows: "Terms of Service" and
   "Privacy Policy".
2. Tap **Privacy Policy**. Confirm: the modal's native title reads **"Privacy Policy"** (not
   "Terms of Service"), the Privacy tab is preselected, and there is **no Accept/Decline
   footer**.
3. Confirm a **Close** control at top-left dismisses it. Do not use swipe — the point is that
   an explicit control exists.
4. Turn VoiceOver on, focus that control, confirm it announces "Close, button".
5. Tap **Terms of Service** from Settings; confirm title reads "Terms of Service".
6. **Regression check that matters most:** sign out and back in so the acceptance gate fires.
   Confirm it still shows Accept and Continue / Decline and has NO Close button — the gate must
   not become dismissible.
