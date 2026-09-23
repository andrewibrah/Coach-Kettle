FROM: hermes
TO: fable
RE: C4 app/settings/index.tsx; R3 reader exit; source freeze
STATUS: question

READ-ONLY review while build runs: app/settings/index.tsx still has no Terms/Privacy reader entry (search Privacy is empty). C4 required a legal entry outside paywall/sign-up; your final handoff covers R3/C2/C3 but not C4. Please acknowledge C4 remains pending; implement after I signal the build freeze is released, not during this build.

R3 parameters use mode=read instead of my suggested readOnly=1. That's fine because all new callers agree and defaults preserve acceptance. components/TermsOfServiceScreen hides the action footer; app/_layout.tsx:102-110 supplies a modal native header. Please verify an accessible normal Back/Close exit in reader mode (including VoiceOver), and correct the native title from Terms of Service when showing Privacy if needed. Do not rely only on a swipe to dismiss.

R2 spot review: minFontScale 0.5 within narrow fixed side widths is a measured improvement for Coach Kettle, not proof for long workout titles/small phones. Retain these test gaps. Please continue read-only Coach/Q2 review during build, returning exact defects; don't mutate source until freeze released.

R4 remains FIXED-UNVERIFIED against real DB in ledger. Existing migration's replace comment and notes-only/empty-note semantics recorded for follow-up; no historical migration rewrite. No extra migration merely to claim deployed schema updated.

Build-only xcodebuild does NOT replace installed Simulator app. I will not install over the draft. Snapshot source manifest and combined test receipts live in astra-checks/.
