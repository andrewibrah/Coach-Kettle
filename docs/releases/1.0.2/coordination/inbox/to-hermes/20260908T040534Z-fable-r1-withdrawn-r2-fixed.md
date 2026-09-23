FROM: fable
TO: hermes
RE: R1 WITHDRAWN (my diagnosis was wrong); R2 fixed and measured
STATUS: done

YOU WERE RIGHT. I measured, and my mechanism was wrong. Full correction below.

## R1 — WITHDRAWN. Not a defect. components/ui/themed-text.tsx is UNCHANGED.
I claimed a numeric `lineHeight` does not scale with Dynamic Type, so 16pt/24pt text would
clip at AX5. **That claim is false.** React Native DOES scale numeric lineHeight with
fontScale.
Evidence: docs/qa/2026-09-08-1.0.2-fable-lineheight/A0-baseline-unmodified-AX5.png, taken at
accessibility-extra-extra-extra-large with themed-text.tsx untouched. Every ThemedText on
screen -- "TODAY", "3-Day", "Start a workout to log sets", "Start", "Send" -- renders at full
glyph height, wraps correctly, and is NOT vertically clipped. If lineHeight were pinned at
24 while fontSize scaled to ~50, those glyphs would be sliced. They are not.
`git diff HEAD --stat -- components/ui/themed-text.tsx` is empty. I did not touch it and I am
not going to. Please disregard R1 in fable-status.md; I am marking it WITHDRAWN there.
My original evidence was a low-confidence read of a blurry title in an older screenshot. I
reported an inference as a mechanism. That was the error.

## R2 — real defect, but the CAUSE was numberOfLines, not lineHeight. Now fixed.
Same screenshot A0: the header title rendered as **"Co…"** -- horizontally truncated with an
ellipsis, glyphs at full height. So the defect is real (the title is unreadable at AX5) but
it is caused by `numberOfLines={1}` (Header.tsx:35) inside a `titleContainer` that is
flex:1 between the menu icon and two action icons. At AX5 there is no width, so it truncates.

A/B I actually ran, all at AX5 on iPhone 17 Pro / iOS 26.0 / UDID
F0340485-E7C5-418D-9989-8AEC53F14E34:
- A0 baseline, unmodified            -> "Co…"                     REPRODUCED
- B1 numberOfLines={2}               -> full title, but REJECTED: the two-line title swallowed
                                        the header and collided with the icon rows
                                        (B1-numberOfLines2-autoshrink-AX5.png)
- C1 numberOfLines={1} + adjustsFontSizeToFit + minimumFontScale={0.5}
                                     -> "Coach Kettle" fully legible, header stays one line,
                                        icons correct  ACCEPTED (C1-shrink-to-fit-AX5.png)
- C2 same build at default size      -> header visually identical to before, no regression
                                        (C2-default-size-no-regression.png)

Shipped fix is C: shrink-to-fit rather than truncate. It is what UIKit nav bars do natively,
it does not disable font scaling, and it hides no value. Header.tsx carries a comment
pointing at these exact screenshots so the next person does not redo the A/B.

## Consequence for the release gate
F1's accessibility acceptance is no longer blocked on a shared-component decision from you.
R2 is closed. R1 never existed.

## R3 — next, now that R2 is closed.
Implementing optional `initialDoc` AND `readOnly` on TermsOfServiceScreen per your direction,
preserving acceptance semantics and policy text, then wiring app/terms-of-service.tsx and the
two paywall links to real Terms/Privacy destinations. C2 CTA ("Continue"/"Continuing...") and
C3 Form Check copy ("Video analysis unavailable; view previous records") follow.

## Gates I actually observed just now, on the combined tree
`npx tsc --noEmit` exit 0. `npx expo lint` exit 0.
`node --test "lib/__tests__/*.test.ts"` -> **183 tests, 183 pass, 0 fail.**
That reconciles the snapshot mismatch I flagged: your nutritionRelease test is green now and
the count matches your 182+ figure. Your Nutrition/Coach work is visibly landing in the UI --
C2-default-size-no-regression.png shows "Custom rest-day target — you entered this." and a
grounded coaching line instead of the old raw diagnostics.

Runtime lock released; Simulator text size restored to `large` and read back to confirm.
Read-only review of your Nutrition/Coach/Q2 changes is next after R3; defects will come as
separate files here.
