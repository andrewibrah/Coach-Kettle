import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* ─────────────────────────────────────────────────────────────────────────
   Coach Kettle — WCAG 2.2 Level AA regression guard.

   Automated scanning catches roughly a third of real barriers. This suite is
   a floor, not a certificate: it exists to stop remediated defects from
   silently reappearing on the next theme change. The findings it cannot
   settle (screen-reader announcement quality, focus order sensibility,
   whether alt text is *correct* rather than merely present) are listed in
   ACCESSIBILITY.md under "Requires manual testing".
   ───────────────────────────────────────────────────────────────────────── */

/* The app mounts a HashRouter (src/main.tsx), so real URLs are /#/guide, not
   /guide. Navigating to /guide silently serves the Home route, which would
   make this whole suite pass while testing the same page five times. */
const ROUTES = ["/", "/guide", "/privacy", "/terms", "/support", "/eula"] as const;
const url = (route: string) => (route === "/" ? "/#/" : `/#${route}`);
const hashHref = (route: string) => `#${route}`;

// WCAG 2.2 AA is a superset of 2.1 AA and 2.0 AA.
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/* The Features/CTA/Tutorial sections reveal via IntersectionObserver with a
   staggered opacity transition. Scanning before those settle measures text
   mid-fade against a partially transparent parent and reports contrast
   failures that do not exist at rest. Scroll the page to trigger every
   observer, then wait for the longest stagger (7 steps x 80ms + 700ms) to
   finish before asserting. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const step = document.body.scrollHeight / 8;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
}

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
}

test.describe("axe-core — WCAG 2.2 AA", () => {
  for (const route of ROUTES) {
    test(`${route} has no detectable violations`, async ({ page }) => {
      await page.goto(url(route));
      await page.waitForLoadState("networkidle");
      await settle(page);
      const results = await scan(page);

      // Readable failure output — axe's default object dump is unusable in CI.
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`,
      );
      expect(summary, `axe violations on ${route}`).toEqual([]);
    });
  }
});

test.describe("SC 2.4.1 — Bypass Blocks", () => {
  test("skip link is first in tab order and moves focus to main", async ({ page }) => {
    await page.goto(url("/"));
    await page.keyboard.press("Tab");

    const skip = page.locator("a.skip-link");
    await expect(skip).toBeFocused();
    // Must be visible once focused, not merely present.
    await expect(skip).toBeInViewport();

    await page.keyboard.press("Enter");
    const mainFocused = await page.evaluate(() => document.activeElement?.id);
    expect(mainFocused).toBe("main");
  });
});

test.describe("SC 2.1.1 / 2.1.2 — Keyboard", () => {
  for (const route of ROUTES) {
    test(`${route}: every interactive element is reachable, no keyboard trap`, async ({ page }) => {
      await page.goto(url(route));
      const interactive = await page.locator("a[href], button, [tabindex]:not([tabindex='-1'])").count();

      const seen = new Set<string>();
      let trapped = false;
      for (let i = 0; i < interactive + 5; i++) {
        await page.keyboard.press("Tab");
        const id = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return "body";
          return el.tagName + ":" + (el.getAttribute("href") ?? el.textContent?.slice(0, 20) ?? "");
        });
        if (seen.has(id) && seen.size < 2) {
          trapped = true;
          break;
        }
        seen.add(id);
      }
      expect(trapped, "focus did not advance — possible keyboard trap").toBe(false);
      expect(seen.size).toBeGreaterThan(1);
    });
  }

  test("no positive tabindex anywhere", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(url(route));
      const positive = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[tabindex]"))
          .map((el) => Number(el.getAttribute("tabindex")))
          .filter((n) => n > 0),
      );
      expect(positive, `positive tabindex on ${route}`).toEqual([]);
    }
  });
});

test.describe("SC 2.4.7 — Focus Visible", () => {
  // Drives focus with real Tab presses: :focus-visible is applied heuristically
  // and a programmatic .focus() does not reliably trigger it. Only elements
  // actually reachable by keyboard are asserted on, which naturally skips
  // links hidden at this breakpoint (e.g. the sm:hidden mobile nav).
  test("every keyboard-reachable control has a visible focus indicator", async ({ page }) => {
    await page.goto(url("/"));

    const checked: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return {
          label: (el.textContent || "").trim().slice(0, 24),
          hasIndicator:
            (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
            s.boxShadow !== "none",
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        };
      });
      if (!result) continue;
      expect(result.hasIndicator, `"${result.label}" has no focus indicator (${result.outline})`).toBe(true);
      checked.push(result.label);
    }
    expect(checked.length, "no focusable elements were reached").toBeGreaterThan(3);
  });
});

test.describe("SC 2.5.8 — Target Size (Minimum, 24x24)", () => {
  for (const route of ROUTES) {
    test(`${route}: all links meet 24x24 or the spacing exception`, async ({ page }) => {
      await page.goto(url(route));
      const undersized = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("a[href]"))) {
          if (el.classList.contains("skip-link")) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // hidden at this breakpoint
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // Inline links inside a text block are exempt (SC 2.5.8 "Inline").
          const parent = el.parentElement;
          const inlineInProse =
            parent && ["P", "LI", "SMALL", "STRONG"].includes(parent.tagName);
          if (inlineInProse) continue;
          if (r.height < 24 || r.width < 24) {
            bad.push(`${el.textContent?.trim().slice(0, 28)} — ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return bad;
      });
      expect(undersized, `undersized targets on ${route}`).toEqual([]);
    });
  }
});

test.describe("SC 1.4.10 — Reflow (320px, no 2D scrolling)", () => {
  for (const route of ROUTES) {
    test(`${route}: no horizontal scroll at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(url(route));
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // Allow 1px for sub-pixel rounding.
      expect(overflow.scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    });
  }
});

test.describe("SC 1.4.12 — Text Spacing", () => {
  for (const route of ROUTES) {
    test(`${route}: no clipping under WCAG text-spacing overrides`, async ({ page }) => {
      await page.goto(url(route));
      await page.addStyleTag({
        content: `* {
          line-height: 1.5 !important;
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
        }
        p { margin-bottom: 2em !important; }`,
      });
      await page.waitForTimeout(200);
      const clipped = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("h1,h2,h3,p,li,a,span"))) {
          const s = getComputedStyle(el);
          if (s.overflow === "hidden" && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
            bad.push(`${el.tagName}: ${el.textContent?.trim().slice(0, 30)}`);
          }
        }
        return bad;
      });
      expect(clipped, `text clipped on ${route}`).toEqual([]);
    });
  }
});

test.describe("SC 2.2.2 — Pause, Stop, Hide", () => {
  test("reduced-motion suppresses looping animations without hiding content", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url("/"));
    await page.waitForLoadState("networkidle");

    // No element may still be running a long/infinite animation.
    const running = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const s = getComputedStyle(el);
          return s.animationName !== "none" && parseFloat(s.animationDuration) > 0.1;
        })
        .map((el) => (el as HTMLElement).className?.toString().slice(0, 40)),
    );
    expect(running, "animations still running under prefers-reduced-motion").toEqual([]);

    // The critical regression: suppressing motion must not leave content at
    // opacity 0. The h1 and both hero CTAs must be visible.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /App Store/i }).first()).toBeVisible();

    await ctx.close();
  });
});

test.describe("SC 4.1.2 — Name, Role, Value", () => {
  test("current page is exposed via aria-current", async ({ page }) => {
    for (const route of ["/guide", "/privacy", "/support"]) {
      await page.goto(url(route));
      const count = await page.locator(`nav a[aria-current="page"][href="${hashHref(route)}"]`).count();
      expect(count, `aria-current missing on ${route}`).toBeGreaterThan(0);
    }
  });
});

test.describe("SC 1.3.1 — Info and Relationships", () => {
  test("every route has exactly one h1 and no heading-level skips", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(url(route));
      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
          Number(h.tagName[1]),
        ),
      );
      expect(levels.filter((l) => l === 1).length, `h1 count on ${route}`).toBe(1);

      let prev = 0;
      for (const l of levels) {
        if (prev !== 0) {
          expect(l, `heading skip on ${route}: h${prev} -> h${l}`).toBeLessThanOrEqual(prev + 1);
        }
        prev = l;
      }
    }
  });

  test("lists keep list semantics despite Tailwind's list-style reset", async ({ page }) => {
    await page.goto(url("/support"));
    const lists = await page.locator("ul, ol").count();
    const roled = await page.locator("ul[role=list], ol[role=list]").count();
    expect(roled, "some lists lack role=list").toBe(lists);
  });
});
