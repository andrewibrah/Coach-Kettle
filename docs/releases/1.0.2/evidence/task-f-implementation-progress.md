# Package F implementation checkpoint

Status: local implementation and full local checks complete. F07, F08, F09 and F10 are **FIXED**. Formatting is display-only: no slug, raw name, database record, search identity or workout matching changed. No deployment, live database, simulator or device claim was made. No Edge Function, migration or `package.json` change was made by this package.

Most of §F already existed as uncommitted work (`lib/exerciseFormat.ts`, its tests, both library screens, nutrition preferences). This pass audited each plan step against the code, then filled the gaps it found, with a task review and a final review.

## Dispositions
| ID | Disposition | Where |
|---|---|---|
| F07 | FIXED | `formatExerciseName` formats the card text, the card accessibility label, the detail title and the media accessibility label. Search, the body-part filter, list keys and `router.push` still use the raw `name` and `slug`. This is proven by render tests that execute the real screens. |
| F08 | FIXED | `formatTerm('leverage_machine')` returns `Leverage Machine`. It is tested. |
| F09 | FIXED | Equipment fixtures now cover stepmill, elliptical, assisted, weighted, hammer and tire, plus the real seed values `stepmill_machine` and `elliptical_machine`. The name and metadata formatters are tested separately. |
| F10 | FIXED | `app/settings/nutrition-preferences.tsx` uses its own typed label map, so `tsc` fails if a value has no label. It does not import from `lib/exerciseFormat.ts`, and a test asserts that. |

## Changes
- `lib/exerciseFormat.ts`:
  - `formatExerciseName` is separate from `formatTerm`. It trims and collapses whitespace, and returns `—` for empty input.
  - It title-cases each word and handles apostrophes.
  - Acronym casing is per whole word, via `NAME_TOKENS`: EZ, BOSU, SkiErg, TRX, JM, SZ, POV. It never rewrites a whole name with an equipment label, so "ez barbell curl" becomes `EZ Barbell Curl`, not "EZ Bar Curl".
  - This pass added JM, SZ and POV. All three occur in the real seed: "barbell jm bench press", "(sz-bar)", "(back pov)" and "(side pov)".
  - `formatTerm` has an override map that includes `leverage_machine → Leverage Machine`.
- `lib/__tests__/exerciseFormat.test.ts`:
  - Required cases: `air bike`, `ez barbell curl`, `3/4 sit-up → 3/4 Sit-Up`, BOSU, apostrophes, hyphens, parentheses, mixed case, whitespace and empty input.
  - Tests that JM and SZ are only capitalised as whole words, and the real seed JM/SZ/POV names.
  - Tests for the equipment terms and the real seed equipment values.
  - Four render tests. They load the real `app/exercise-library/index.tsx` and `[slug].tsx` through `react-test-renderer` (the harness pattern from `progressRelease.test.ts`), with the router and data mocked. They cover:
    - search on the raw name, including the JM record;
    - the body-part filter combining with search;
    - a card showing the formatted name but pushing `/exercise-library/<raw slug>`;
    - the detail title using the formatted name.
  - The harness transpiles with target ES2017. The default ES3 target broke `[...new Set()]` inside the test harness only; the app build is unaffected.
- `app/exercise-library/index.tsx`, `app/exercise-library/[slug].tsx` and `app/settings/nutrition-preferences.tsx`: no changes in this pass. Their formatter wiring predates it and was verified.
- `SHOW_EXERCISE_MEDIA` stays `false` (`[slug].tsx:15`).

## Seed inspection
- Seed file: `supabase/migrations/20260708000100_exercise_dataset_seed.sql`, 1,324 names.
- BOSU occurs in names. SkiErg and TRX do not: the seed says "ski ergometer" and has no TRX. Their rules stay for curated names, and are tested.
- Every short or vowel-less token was reviewed: up, on, v, y, to, jm, of, a, ab, sz, in, t, w, ez, l. Single-letter shape prefixes render correctly: `T-Bar`, `Y-Raise`, `W-Press`, `L-Sit`.
- The final reviewer ran every seed name through the formatter. Each formatted name matches its raw name when case is ignored, so search results are identical.

## Verification
- RED was captured before GREEN for the JM/SZ/POV cases (the formatter gave "Jm" and "Sz"). The final reviewer also broke the code on purpose in a scratch copy: 7 of 7 breaks were caught by at least one test.
- Commands, all exit 0 on the final tree:
  - `EXPO_NO_DOTENV=1 npm run lint -- --no-cache`
  - `./node_modules/.bin/tsc --noEmit --incremental false`
  - `node --test "lib/__tests__/*.test.ts"`: 490/490 pass (the baseline before Package F was 483).
  - `git diff --check`
- The render tests depend on `react-test-renderer`. It is the uncommitted `package.json` / `package-lock.json` devDependency added during Package E.
- The GitNexus impact check was attempted and returned UNKNOWN, because the index is version 43 and the engine is version 42. There is no graph-pass claim. A grep found only two callers of `formatExerciseName`, both display-only: `app/exercise-library/index.tsx` and `[slug].tsx`. Risk judged LOW.

## Open
- Device gate (G/J): check the library list and detail screens at the largest accessibility text size, including long names such as "Cable Reverse Grip Triceps Pushdown (SZ-Bar) (With Arm Blaster)".
- Deliberately not changed (final review Minors, none affect current data):
  - non-ASCII letters, and names like McGill or O'Brien, get plain title case;
  - `formatTerm` would render "farmer's" as "Farmer'S";
  - the body-part pill and count show the raw value;
  - the search test cannot tell raw-name search from lowercased formatted-name search (a source check covers that).
- Pre-existing, outside §F:
  - Nutrition preferences hide stored values that aren't in the local lists; they are kept, not lost.
  - The multi-select pills use `accessibilityRole="radio"`. This moves to §G.
- Data, outside §F: 4 seed rows contain the mojibake `в°` where `°` was meant. Fixing them needs a data migration, which the user would deploy.
- Follow-up: move the duplicated render-harness helper into a shared module with the ES2017 target. `progressRelease.test.ts` still uses the default target.
