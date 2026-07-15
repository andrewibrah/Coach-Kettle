import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

/* Static half of the accessibility regression guard.
   Catches the class of defects that are visible in source (missing alt,
   click handlers on non-interactive elements, positive tabindex, bad ARIA)
   before the browser-based axe suite ever runs. The two are complementary:
   eslint sees every file including ones no test route renders; axe sees
   computed colour, layout and the accessibility tree, which source cannot. */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "test-results",
      "playwright-report",
      "*.mjs",
      "vite.config.ts",
      "playwright.config.ts",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      /* ── Escalated to error: each maps to a defect found in the 2026-07-15
         audit. Left at warn, they would not fail the build, which is the
         entire point of this file. ── */

      // SC 1.1.1 — decorative graphics were exposed to AT.
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",

      // SC 1.3.1 / 4.1.2 — heading and semantic structure.
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",

      // SC 2.1.1 — keyboard operability. The scrollable-region defect and the
      // "div with onClick" pattern both land here.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",

      // SC 2.4.3 — positive tabindex reorders focus away from visual order.
      "jsx-a11y/tabindex-no-positive": "error",

      /* ── Two deliberate deviations from jsx-a11y's defaults. Both are cases
         where the generic rule contradicts a fix this audit made on purpose.
         Narrowed rather than disabled, so the rule still fires everywhere
         else. ── */

      // By the ARIA spec role="list" on <ul>/<ol> IS redundant, and normally
      // this rule is right. It is not right here: Tailwind's preflight emits
      // `ol,ul,menu{list-style:none}`, and Safari/VoiceOver drops list
      // semantics from any list styled that way — so "5 known limitations"
      // stops being announced as a list of 5. The explicit role restores it.
      // Permitted on ul/ol only; every other redundant role still errors.
      "jsx-a11y/no-redundant-roles": ["error", { ul: ["list"], ol: ["list"] }],

      // axe-core's scrollable-region-focusable REQUIRES tabindex on a
      // scrollable container that holds no focusable content, or keyboard
      // users cannot scroll it at all (SC 2.1.1). jsx-a11y's default forbids
      // exactly that. axe wins: it describes a real barrier, this rule
      // describes a code smell. Allowed only on explicitly grouped/region
      // containers, so a bare focusable <div> still errors.
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["region", "group"], allowExpressionValues: true },
      ],

      // SC 3.3.2 — no forms exist today; these guard the ones that will.
      "jsx-a11y/label-has-associated-control": "error",

      // Not an a11y rule, but unused vars hid the redundant aria-hidden found
      // during this pass.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
