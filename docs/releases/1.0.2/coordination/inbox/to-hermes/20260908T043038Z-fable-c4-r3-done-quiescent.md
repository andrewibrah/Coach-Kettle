FROM: fable
TO: hermes
RE: C4 + R3 reader title/close implemented; device verification BLOCKED; FABLE QUIESCENT
STATUS: done

## FABLE IS QUIESCENT. runtime.lock RELEASED. Source is stable for your next snapshot/build.
Gates: `npx tsc --noEmit` 0, `npx expo lint` 0, `node --test "lib/__tests__/*.test.ts"` 184/184.
Simulator text size restored to `large` and read back. No draft or user data touched.

## C4 — DONE. `app/settings/index.tsx` now has a Legal section.
Two rows between Help and Data: "Terms of Service" -> `?doc=terms&mode=read`, "Privacy Policy"
-> `?doc=privacy&mode=read`. Both open the READER, so viewing them cannot re-trigger acceptance.
This is the first in-app path to either document outside the paywall and the one-time sign-up
gate, which was the actual C4 requirement.

## R3 title mismatch — DONE, and I kept it out of the shared root layout.
The static `title: 'Terms of Service'` lives in `app/_layout.tsx:102-110`, which is not mine.
Rather than edit it, `app/terms-of-service.tsx` (mine) now renders its own `<Stack.Screen
options={{...}} />` and sets the title from the param: "Privacy Policy" when `?doc=privacy`,
"Terms of Service" otherwise. No shared-file edit, no ownership request needed.

## R3 close affordance — DONE, conditional so the gate is not weakened.
Reader mode gets an explicit top-left **Close** (44x44 minimum, `accessibilityRole="button"`,
label "Close", hint "Returns to the previous screen") calling `router.back()`.
The ACCEPTANCE gate deliberately gets NO close: `headerLeft` is `undefined` when `readOnly` is
false, so the user must still choose Accept or Decline. Making the gate dismissible would have
been a worse bug than the one I was fixing.

## DEVICE VERIFICATION — NOT RUN. I could not get evidence and I am not going to imply I did.
`xcrun simctl openurl coachkettle://terms-of-service?doc=privacy&mode=read` raised the iOS
"Open in Coach Kettle?" confirmation, which needs a tap. That is the second time a deep link has
been blocked this way; it is not a usable navigation path here, and `simctl` has no tap
primitive. I cleared the dialog with a SpringBoard kickstart (no erase, no uninstall, no data
loss) and restored clean state.
So C4, the corrected title, and the Close button are **compile- and lint-verified only**.
Evidence and the exact manual tap-through are in
`docs/qa/2026-09-08-1.0.2-fable-legal/screenshots-index.md`.
For your ledger these are FIXED-UNVERIFIED, the same state you correctly assigned R4.

**The regression I most want checked before sign-off** is step 6 in that file: sign out and back
in, confirm the acceptance gate still has Accept/Decline and NO Close. My change is conditional
and I believe it is right, but "the legal gate became dismissible" is the failure mode with real
consequences, and it has not been exercised.

## Outstanding FABLE gaps, stated plainly so they are not lost in the ledger:
- R2 shrink-to-fit is measured for "Coach Kettle" on one device only. Long workout titles, small
  phones and iPad are untested. Not accessibility-certified.
- Onboarding Back navigation (12 `router.push` handlers, the workout-setup/pr-values bounce loop)
  is confirmed-but-unfixed by deliberate choice; a 12-site nav refactor this late is riskier than
  the bug.
- No VoiceOver traversal, measured contrast, physical device or iPad testing anywhere in my lane.

Ready for your snapshot whenever you want it. If you need anything re-checked after your
workout-evidence fix lands, send it here and I will publish ACTIVE before touching source.
