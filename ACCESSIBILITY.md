# Accessibility — coachkettle.com

**Document version:** 1.0
**Date:** 2026-07-15
**Scope:** the coachkettle.com marketing site (`landing-page` branch). Does **not** cover the Coach Kettle iOS application, which is native and assessed against Apple's accessibility APIs, not WCAG.
**Standard targeted:** WCAG 2.2 Level AA (a superset of 2.1 AA and 2.0 AA; maps closely to EN 301 549 for EU exposure).

---

## 1. Accessibility Statement (DRAFT — requires owner sign-off before publishing)

> Dates in §1.3 are proposed, not committed. They need Andrew's confirmation before this statement goes public. A statement that misses its own published dates is worse than one that never made the promise.

Coach Kettle is committed to making coachkettle.com usable by everyone, including people who use screen readers, keyboard-only navigation, screen magnification, or who have low vision, colour vision deficiency, or vestibular sensitivity.

### 1.1 Conformance status, stated per user flow

Conformance under WCAG is **per page and per flow** — never a property of "the site". We do not claim "coachkettle.com is compliant". The status of each flow is stated separately below.

| User flow | Pages | Status | Basis |
|---|---|---|---|
| **Discover → Download** (core conversion) | `/` → App Store | **Partially conformant** | 0 automated violations at 1280px and 320px. Manual screen-reader and zoom verification **not yet performed**. |
| **Learn how it works** | `/` → `/guide` | **Partially conformant** | 0 automated violations. Manual verification **not yet performed**. |
| **Get help / contact** | `/support` → `mailto:` | **Partially conformant** | 0 automated violations. Manual verification **not yet performed**. |
| **Review legal terms** | `/privacy`, `/eula` | **Partially conformant** | 0 automated violations. Manual verification **not yet performed**. The `/privacy` GDPR table is keyboard-scrollable as of 2026-07-15. |

**"Partially conformant" is the honest label and is used deliberately.** Automated tooling detects roughly a third of real accessibility barriers. Every flow above passes automated testing with zero violations and zero rule exclusions, but none has yet been verified by a human using assistive technology. Claiming full conformance on automated evidence alone would be a claim we could not support.

### 1.2 What has been remediated

As of 2026-07-15, the following were found and fixed (full detail in `docs/a11y-audit-2026-07-15.md`):

- Ten looping animations with no way to stop them (a vestibular trigger) now honour `prefers-reduced-motion`.
- The homepage hero announced 14 decorative labels ("BENCH 225×8"…) to screen readers ahead of the headline. They are now correctly marked decorative.
- No skip link existed; keyboard users traversed the full nav on every page load.
- The Support FAQ's section headings were not headings, breaking heading navigation. `/guide` had no `h1`.
- Six text elements failed contrast, the worst at 1.16:1.
- Every navigation link failed to expose which page you were on.
- Link targets throughout were under the 24×24px minimum.
- At 320px, keyboard users could not scroll the privacy policy's GDPR table and never reached the "Legal Basis" column.

### 1.3 Known exceptions and target dates

| # | Exception | Impact | Proposed date |
|---|---|---|---|
| 1 | Manual assistive-technology verification not yet performed (NVDA+Firefox, VoiceOver+Safari, keyboard-only, 200% zoom). Until done, no flow can move beyond "partially conformant". | Unknown — this is the gap automated testing cannot close. | 2026-08-15 |
| 2 | No accessibility feedback channel had been published before this statement. | Users had no route to report barriers. | Closed by this statement. |
| 3 | The hero "NEW PR" decorative label sits adjacent to the `h1` and can read as part of the headline. Cosmetic; a layout/copy judgement, not a WCAG defect. | Low — possible confusion for sighted users. | 2026-08-01 |

### 1.4 Feedback

If you encounter a barrier on coachkettle.com, email **support@coachkettle.app**. We respond within **1–3 business days**. Please include the page URL, what you were trying to do, and the assistive technology and browser you were using.

This channel is monitored. If we cannot fix something quickly, we will tell you what the workaround is and when we expect the fix.

### 1.5 Assessment approach

Self-assessed by the engineering team using axe-core 4.12 (Playwright/Chromium), `eslint-plugin-jsx-a11y` 6.10, and manual contrast computation against composited colour values. No third-party audit has been commissioned. Both automated layers gate deployment (`.github/workflows/deploy.yml`).

---

## 2. Requires manual testing — what automation cannot settle

Automated tooling catches roughly a third of real barriers. It verifies that alt text *exists*, never that it is *correct*. It verifies focus order is *reachable*, never that it is *sensible*. The following are **open** and must be settled by a human:

### 2.1 Screen readers
- **NVDA + Firefox (Windows)** — the most common real-world pairing. Verify: the hero reads as headline-first with no decorative noise; the seven Tutorial steps announce in order; the Support FAQ is navigable by heading.
- **VoiceOver + Safari (macOS/iOS)** — the pairing that matters most for an iOS product's marketing site. **Specifically verify the `role="list"` fix**: Tailwind's `list-style:none` reset is exactly what causes Safari to drop list semantics, and the fix is the whole reason those attributes exist. Automation confirms the attribute is present; only VoiceOver confirms "5 known limitations" actually announces as a list of 5.
- Verify `aria-current="page"` announces as "current page" and is not merely present in the DOM.
- Verify the four `tabindex=0` scrollable regions announce comprehensibly on focus rather than as an unlabelled focus stop.

### 2.2 Keyboard-only
- Traverse each of the four flows with no mouse. Automation proves focus *advances*; only a human can judge whether the order is *logical*.
- Confirm the skip link visibly lands you in main content, not merely that `document.activeElement.id === "main"`.
- Confirm the sticky navbar never obscures a focused element mid-page (SC 2.4.11). `scroll-mt-24` handles the skip-link case; other entry points are unverified.

### 2.3 Zoom and magnification
- **200% browser zoom** on all five routes (SC 1.4.4). Not covered: the suite tests 320px reflow, which is related but not the same criterion.
- 400% zoom / screen magnifier: confirm the hero's absolutely-positioned decoration does not cover content.

### 2.4 Judgement calls no tool can make
- Whether the hero's now-legible decorative labels read as intentional design or as clutter.
- Whether "Guide", used as a link name in three places, is unambiguous out of context (SC 2.4.4).
- Whether the Caveat cursive font in the `h1` ("plain English.") is legible to users with dyslexia. It passes contrast; legibility of a script face is a separate, human question.

### 2.5 Not applicable to this site (stated so the gap is not mistaken for an oversight)
- **1.2.2 / 1.2.5 Captions, audio description** — the site contains no audio or video. No media assets exist to caption. This becomes live the moment a demo video is added to the hero.
- **1.3.5 Autocomplete, 3.3.1–3.3.8 form errors/labels/redundant entry/accessible auth** — the site contains **no forms, inputs, or authentication of any kind**. Every conversion is an `<a href>` to the App Store or a `mailto:`. Confirmed by source scan.
- **2.5.7 Dragging movements** — no draggable UI.
- **4.1.3 Status messages** — no toasts, async results, or validation.
- **Modals, menus, carousels** — none exist. No focus trap, focus restore, `Escape` handling, `aria-modal`, or background inert is required. The nav is a flat list of links, not a disclosure menu.

---

## 3. Colour palette

**The palette required no correction.** It is worth stating why, because the usual output of this section — a "corrected colourblind-safe palette" — would be dishonest here.

Coach Kettle's brand palette is **entirely achromatic**. Every token is a pure grey with R=G=B. Colour vision deficiency simulation is therefore a mathematical no-op: protanopia, deuteranopia, tritanopia and achromatopsia all return the identical hex, because there is no hue to lose.

| Token | Hex | Protanopia | Deuteranopia | Tritanopia | Achromatopsia |
|---|---|---|---|---|---|
| `brand.bg` | `#060606` | `#060606` | `#060606` | `#060606` | `#060606` |
| `brand.card` | `#0e0e0e` | `#0e0e0e` | `#0e0e0e` | `#0e0e0e` | `#0e0e0e` |
| `brand.surface` | `#141414` | `#141414` | `#141414` | `#141414` | `#141414` |
| `brand.subtle` | `#333333` | `#333333` | `#333333` | `#333333` | `#333333` |
| `brand.muted` | `#9a9a9a` | `#9a9a9a` | `#9a9a9a` | `#9a9a9a` | `#9a9a9a` |
| `brand.text` | `#f0f0f0` | `#f0f0f0` | `#f0f0f0` | `#f0f0f0` | `#f0f0f0` |
| `brand.accent` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |

`brand.muted` on `brand.bg` holds at **7.20:1 under every simulation** (7.21:1 under tritanopia, from rounding). No pair collapses, because no pair is distinguished by hue in the first place.

**Consequence for SC 1.4.1 (Use of Colour):** the site cannot fail by "colour alone carrying meaning" in the usual sense — there is no colour. The one place it did fail was structurally identical: the mobile nav marked the current page by *lightness* alone (`#9a9a9a` → `#f0f0f0`). Lightness is a single channel just as hue is. Fixed by adding an underline as a redundant channel.

### 3.1 Before / after — every value changed

All corrections were **opacity**, not hue. The seven brand tokens above are untouched.

| Element | Before | Ratio | After | Ratio | Threshold |
|---|---|---|---|---|---|
| Hero eyebrow | `white/35` `#5d5d5d` | 3.08:1 | `brand-muted` `#9a9a9a` | **7.20:1** | 4.5:1 |
| Tutorial eyebrow | `white/35` `#5d5d5d` | 3.08:1 | `brand-muted` `#9a9a9a` | **7.20:1** | 4.5:1 |
| Hero "SCROLL" | `white/20` `#383838` | 1.72:1 | `white/50` `#838383` | **5.31:1** | 4.5:1 |
| Feature numbers 01–06 | `white/20` `#3e3e3e` | 1.81:1 | `white/50` `#878787` | **5.34:1** | 4.5:1 |
| Tutorial steps 01–07 | `white/[0.18]` `#333333` | 1.60:1 | `white/40` `#6a6a6a` | **3.72:1** | 3:1 (40px) |
| App Store subtitle | `black@50%` `#808080` | 3.98:1 | `black@60%` `#666666` | **5.74:1** | 4.5:1 |
| Hero stat labels ×14 | `white/[0.08]` `#1a1a1a` | 1.16:1 | `white/50` `#838383` | **5.31:1** | 4.5:1 |
| Guide button border | `white/20` `#383838` | 1.72:1 | `white/40` `#6a6a6a` | **3.72:1** | 3:1 (non-text) |
| Focus ring | UA `1px #005fcc` | ~1.3:1 | `2px #f0f0f0` | **17.78:1** | 3:1 |

Two of the nine reuse the existing `brand-muted` token rather than introducing a new value.

> `white/45` computes to `#767676` = **4.46:1** and does **not** pass 4.5:1. It fails by 0.04. This is why every value above was computed against the composited background rather than estimated.

---

## 4. Maintaining this

Run locally before pushing:

```bash
npm run lint       # eslint-plugin-jsx-a11y — source-visible defects
npm run test:a11y  # axe-core + Playwright, 5 routes x 2 viewports
```

Both gate `deploy.yml`. A WCAG regression fails the pipeline before the Pages artifact is uploaded, so coachkettle.com keeps serving the last conforming build.

**If you add a form, a video, or a modal, the "Not applicable" list in §2.5 stops being true.** Those criteria were excluded because the surface does not exist — not because they were assessed and passed.
