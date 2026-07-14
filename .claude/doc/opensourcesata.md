# Integration Plan: Open-Source Exercise Dataset → `public.exercises`

> Deliverable: an **integration plan only**. No source, migrations, or edge functions are
> modified by this document. Exploration was driven through GitNexus (repo indexed as
> **WorkoutTracker**); blast-radius citations are inline.

## Summary

Import the 1,324-record open-source dataset (`github.com/hasaneyldrm/exercises-dataset`,
`data/exercises.json`) **additively into the existing `public.exercises` table** that
migration `0032_exercise_library.sql` already created. `public.exercises` is the correct
home because it is already the canonical, RLS-protected, service-role-written exercise
catalog — the `exercise-library` edge function reads it, the two library screens render
it, and the `programming` edge function resolves template exercise slugs against it. We do
**not** create a parallel table; that would fork the catalog and orphan existing consumers.
The change is intentionally backward-compatible: existing curated slugs win via
`ON CONFLICT (slug) DO NOTHING`; new columns (`instructions`, `media_id`, `target`,
`source`) are additive and nullable/defaulted; and the `body_part` CHECK is widened just
enough to admit the dataset's body-part vocabulary so no constraint aborts the import.
Media (GIFs) are **not** bundled — only `media_id` is stored; the CDN URL is constructed at
render time behind a flag defaulting off, because the media licensing is contested. To keep
the client cache sane, the edge function's `list` action stops returning full 6-language
instructions; instructions ship only on the detail screen via the existing `get` action.

---

## Current state (GitNexus findings)

Consumer graph confirmed via `query`, `context`, and `impact`.

### Consumers of the exercise library

| Symbol | File | Role | Couples to `exercises` by… |
|---|---|---|---|
| `fetchExerciseLibrary` | `lib/exerciseLibrary.ts:14` | list + 24h cache (`exercise_library_v1`) | edge `action=list` |
| `getExerciseBySlug` | `lib/exerciseLibrary.ts:37` | detail fetch | edge `action=get&slug=` |
| `searchExercises` | `lib/exerciseLibrary.ts:45` | name search | edge `action=search&q=` |
| `ExerciseLibraryScreen` | `app/exercise-library/index.tsx:15` | list UI (uses `id, slug, name, category, body_part, cues[0]`; filters on `body_part`) | via lib |
| `ExerciseDetailScreen` | `app/exercise-library/[slug].tsx:13` | detail UI (uses `name, body_part, category, difficulty, equipment, description, cues, common_mistakes, primary/secondary_muscles`) | via lib |
| `generateProgramFromTemplate` | `supabase/functions/programming/index.ts:57` | resolves `program_templates.structure[].exercises[].slug` → name via `exercises` table (`.in("slug", …)`, lines 78-82) | **by slug** |

### GitNexus `impact` blast radius

- `impact(fetchExerciseLibrary, upstream)` → **impactedCount 2, risk LOW**. Only
  `ExerciseLibraryScreen` + `handleSearchSubmit` (both `app/exercise-library/index.tsx`).
- `impact(Exercise, upstream)` (interface, `types/exercise.ts`) → **impactedCount 12, risk
  LOW**. Depth-1 real consumers are only `lib/exerciseLibrary.ts`,
  `app/exercise-library/index.tsx`, `app/exercise-library/[slug].tsx` (IMPORTS). Depth 2–3
  are transitive file imports through `lib/api.ts`, not structural users of the interface.
  **Adding optional fields to `Exercise` is non-breaking** — no consumer requires the new fields.
- `impact` on the edge-function file returned "not found" (Deno edge files aren't in the
  call-graph the same way). Consumer confirmed by grep instead: only `lib/exerciseLibrary.ts`
  calls its four actions.

### Is importing 1,324 rows safe? — Yes, with two guardrails

1. **Slug collisions with the 18 curated seeds.** The dataset contains movements that
   slugify to existing slugs (e.g. "Barbell Bench Press" → `barbell-bench-press`). Because
   the import uses `ON CONFLICT (slug) DO NOTHING`, **the curated row always wins** and the
   dataset duplicate is dropped, preserving the hand-written cues/mistakes/descriptions the
   detail screen and program templates depend on. This is the desired outcome.
2. **Programming coupling is by slug, and only for template slugs.** `program_templates.structure`
   references the ~18 curated slugs. Those are untouched by an additive import, and the
   lookup falls back to `ex.slug` as the display name if a slug is missing
   (`programming/index.ts:158`), so the engine cannot break. New dataset slugs are never
   referenced by any template — inert until surfaced in the library UI.
3. **No name-based coupling breaks.** `lib/restTimer.ts` `COMPOUND_NAMES` / `isCompoundExercise`
   (lines 81-96) is a hardcoded name set independent of the table. `lib/prTracking.ts` has
   **no** coupling to the `exercises` table (grep confirmed); PR normalization keys off
   `lift_name` strings, not slugs.

**Net:** blast radius is contained to the two library screens (LOW) plus the additive schema
and edge-function payload trimming. No refactor of programming, PR, or rest-timer code is
required or proposed.

---

## Field mapping table

Dataset record → `public.exercises` column.

| `exercises` column | Source in dataset | Transform |
|---|---|---|
| `slug` | `name` | slugify + de-dupe (see below) |
| `name` | `name` | as-is |
| `aliases` | — | `[]` (dataset has no aliases) |
| `category` | `body_part` + `secondary_muscles` + `equipment` | **heuristic → `compound`/`isolation`/`cardio`** (see below) |
| `primary_muscles` | `target` ∪ `muscle_group` | lowercase, snake-case, dedupe |
| `secondary_muscles` | `secondary_muscles[]` | lowercase, snake-case |
| `equipment` | `equipment` | `[equipment]` (single → 1-element array), snake-case |
| `difficulty` | — | column default `'intermediate'` (dataset has none) |
| `body_part` | `body_part`/`category` | **enum mapping table below** |
| `description` | — | `NULL` (avoid duplicating instructions) |
| `cues` | — | `[]` (dataset ships steps, not cues) |
| `common_mistakes` | — | `[]` |
| `demo_video_url` / `demo_image_url` | — | `NULL` (see Media) |
| **`instructions`** (NEW) | `instructions` `{en,es,it,tr,ru,zh}` | whole object as JSONB |
| **`media_id`** (NEW) | `media_id` | string as-is |
| **`target`** (NEW) | `target` | string as-is |
| **`source`** (NEW) | — | `'exercisedb_oss'` constant (provenance → clean re-import/purge) |

### `body_part` enum mapping (dataset → table `body_part` CHECK)

Dataset uses 10 lowercase anatomical labels; the table CHECK is a fixed 12-value push/pull
taxonomy. Preferred 1:1 maps where obvious; **widen the CHECK** for the rest so nothing aborts.

| Dataset value (count) | Table `body_part` |
|---|---|
| `chest` (163) | `Chest` |
| `back` (203) | `Back` |
| `shoulders` (143) | `Shoulders` |
| `upper legs` (227) | `Legs` |
| `lower legs` (59) | `Legs` |
| `waist` (169) | `Abs` |
| `cardio` (29) | `Cardio` |
| `upper arms` (292) | `Bis` if `target`~biceps, `Tris` if `target`~triceps, else widened `Upper Arms` |
| `lower arms` (37) | widened `Lower Arms` (forearms; no dedicated enum) |
| `neck` (2) | widened `Neck` (or `Full Body`) |

**Decision:** do the clean 1:1 maps in the generator, and **relax the `body_part` CHECK** to
also admit the raw dataset labels (`Upper Arms`,`Lower Arms`,`Upper Legs`,`Lower Legs`,`Waist`,
`Neck`) so any fall-through row imports without a CHECK violation. The list-screen `BODY_PARTS`
filter array (`app/exercise-library/index.tsx:13`) simply won't render a pill for a widened
label — rows stay reachable via unfiltered list + search (non-fatal).

### `category` heuristic (compound vs isolation vs cardio vs mobility)

Dataset has **no** compound/isolation field. Derive it:

1. dataset body part == `cardio` → `cardio`.
2. else `secondary_muscles.length >= 2` OR equipment ∈ {`barbell`,`smith machine`,`leverage machine`} → `compound`.
3. else → `isolation` (conservative default; most single-target dumbbell/machine moves).

The existing `category` CHECK (`compound`/`isolation`/`cardio`/`mobility`) is **kept as-is** —
the heuristic always yields one of the four, so no widening needed there. `mobility` is unused
(dataset has none).

---

## Schema changes

New migration, timestamp-named to match the repo's current convention (latest existing is
`20260703060000_*`). Split DDL from data so ordering is deterministic and review is manageable.

**File 1 — `supabase/migrations/20260708000000_exercise_dataset_columns.sql`:**

```sql
-- ============================================================
-- Additive columns + relaxed body_part CHECK for the
-- open-source exercise dataset import (ExerciseDB OSS, 1,324 rows).
-- Backward-compatible with the 18 curated rows from 0032.
-- ============================================================

-- 1. Additive columns (all nullable / defaulted → existing rows unaffected)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS instructions JSONB,          -- {en,es,it,tr,ru,zh} step arrays/strings
  ADD COLUMN IF NOT EXISTS media_id     TEXT,           -- ExerciseDB CDN ref e.g. "2gPfomN"
  ADD COLUMN IF NOT EXISTS target       TEXT,           -- primary target muscle (dataset `target`)
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'curated';  -- provenance

-- 2. Widen body_part CHECK to admit the dataset's anatomical labels (superset of the 12).
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_body_part_check;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_body_part_check
  CHECK (body_part IN (
    'Push','Pull','Legs','Abs','Chest','Back','Bis','Tris','Shoulders','Cardio','Mobility','Full Body',
    'Upper Arms','Lower Arms','Upper Legs','Lower Legs','Waist','Neck'
  ));

-- category CHECK is unchanged — the import heuristic only emits
-- compound/isolation/cardio, so 0032's constraint still holds.

-- 3. Provenance index so OSS rows can be bulk-managed / purged cleanly.
CREATE INDEX IF NOT EXISTS idx_exercises_source ON public.exercises (source);
```

> Note on the CHECK constraint name: `0032` did not name the constraint explicitly, so Postgres
> auto-named it `exercises_body_part_check`. Confirm the exact name with `\d public.exercises`
> before running (adjust the `DROP CONSTRAINT` if it differs).

**Rationale for JSONB `instructions`** (vs 6 text columns): the dataset ships all 6 languages as
one object; JSONB keeps the row schema stable regardless of locale count, matches the table's
existing JSONB idiom (`aliases`, `cues`, …), and lets the client pluck `instructions.en` today
and add locales later with no migration. `media_id`/`target` are scalar → `TEXT`. `source`
defaults to `'curated'` so the 18 existing rows are labeled correctly with no `UPDATE`; the import
sets `'exercisedb_oss'`.

---

## Import approach

**Chosen: a generated SQL data-migration** committed to `supabase/migrations/`, applied by the
user's existing `supabase db push`. Rejected the one-off Node/Deno service-role seed script.

**Why the SQL migration:**
- **Fits the repo workflow verbatim** — CLAUDE.md: "User runs `supabase db push`". Zero new
  tooling, no service-role key on a dev machine, no separate run-this-script step.
- **Idempotent** via `ON CONFLICT (slug) DO NOTHING` — re-running `db push` is safe; curated
  rows always win.
- **Reviewable + version-controlled** — diffable in git, travels with the schema.
- **File size acceptable** — 1,324 rows with multilingual instructions is large but within
  Postgres/migration limits. Keep it as its own data migration, separate from the DDL, ordered
  by timestamp: **`supabase/migrations/20260708000100_exercise_dataset_seed.sql`**.

**Fallback:** if the generated `.sql` is unwieldy in review (multi-MB), run a Deno seed script
once with the service-role key (still `ON CONFLICT DO NOTHING`). Default to the migration.

### Transform script (build-time generator; run once, output committed)

Pseudocode (Node or Deno; reads `data/exercises.json`, writes the seed `.sql`):

```
seen = new Set()
function slugify(name):
  s = name.toLowerCase().normalize('NFKD').stripAccents()
       .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
  base = s; i = 2
  while seen.has(s): s = base + '-' + i; i++     // de-dupe repeated names
  seen.add(s); return s

BODY_PART_MAP = {
  chest:'Chest', back:'Back', shoulders:'Shoulders',
  'upper legs':'Legs','lower legs':'Legs', waist:'Abs', cardio:'Cardio',
  'upper arms': byTarget, 'lower arms':'Lower Arms', neck:'Neck'
}   // byTarget: target~biceps→'Bis', target~triceps→'Tris', else 'Upper Arms'

function category(rec):
  if rec.body_part == 'cardio': return 'cardio'
  if rec.secondary_muscles.length >= 2 or rec.equipment in COMPOUND_EQUIP: return 'compound'
  return 'isolation'

for rec in exercises.json:
  slug  = slugify(rec.name)
  bp    = resolve(BODY_PART_MAP[rec.body_part]) ?? titleCase(rec.body_part)
  cat   = category(rec)
  prim  = uniq([snake(rec.target), snake(rec.muscle_group)].filter(Boolean))
  sec   = rec.secondary_muscles.map(snake)
  equip = [snake(rec.equipment)]
  instr = JSON.stringify(rec.instructions)     // {en,es,it,tr,ru,zh}
  emit row(slug, name=rec.name, aliases='[]', category=cat,
           primary_muscles=prim, secondary_muscles=sec, equipment=equip,
           body_part=bp, description=NULL, cues='[]', common_mistakes='[]',
           instructions=instr::jsonb, media_id=rec.media_id, target=rec.target,
           source='exercisedb_oss')            // difficulty omitted → column default

emit ONE statement:
  INSERT INTO public.exercises
    (slug,name,aliases,category,primary_muscles,secondary_muscles,equipment,
     body_part,description,cues,common_mistakes,instructions,media_id,target,source)
  VALUES <all rows> ON CONFLICT (slug) DO NOTHING;
```

The generator itself is a build artifact (put in a new `scripts/` dir or run ad-hoc) — only its
`.sql` output is committed. Properly escape single quotes in `instructions` (JSON strings) when
emitting SQL literals.

---

## Edge function + client changes

### Edge function `supabase/functions/exercise-library/index.ts`

**Problem:** `action=list` does `.select("*")` (lines 55-59). With 1,324 rows each carrying a
6-language `instructions` blob, the `list` response — and the 24h AsyncStorage cache — becomes
multi-MB. The list screen only needs `id, slug, name, category, body_part, cues` (+ `equipment`
nice-to-have).

**Change (surgical):** narrow the `list` projection so instructions never ship in the list:

```ts
// action === "list"
.select("id, slug, name, category, body_part, equipment, cues, difficulty")
```

Leave `get` at `.select("*")` (detail needs everything incl. instructions/media_id/target).
Leave `search` as-is or mirror the light projection. `by_body_part` unchanged. Blast radius
**LOW** — only `lib/exerciseLibrary.ts` calls these actions, and the list screen reads only the
retained columns.

### Client `lib/exerciseLibrary.ts` + `types/exercise.ts`

1. **`types/exercise.ts`** — add optional fields to `Exercise` (all optional → non-breaking,
   confirmed LOW by `impact`):
   ```ts
   instructions?: Record<string, string[] | string> | null; // {en,es,it,tr,ru,zh}
   media_id?: string | null;
   target?: string | null;
   source?: string;
   ```
   List rows (trimmed projection) leave these `undefined`; every field the list screen reads is
   still present. Detail rows (from `get`) populate them.

2. **Bump the cache key** `exercise_library_v1` → `exercise_library_v2` in
   `lib/exerciseLibrary.ts:9`. The list payload shape changes (trimmed columns), so a version
   bump forces a clean re-fetch and avoids serving a stale `*`-shaped cache.
   (`exercise_library_*` is a **public catalog**, not user data — intentionally **not** in
   `clearAllCaches()` in `contexts/AuthProvider.tsx`; no change needed there.)

3. **Optional detail-screen "Instructions" card** (`app/exercise-library/[slug].tsx`): render
   `exercise.instructions?.en` when present. **English only for now** (see i18n). Purely additive.

### Media at render (behind a flag)

```ts
const SHOW_EXERCISE_MEDIA = false; // licensing contested — default OFF
const gifUrl = SHOW_EXERCISE_MEDIA && ex.media_id
  ? `https://static.exercisedb.dev/media/${ex.media_id}.gif` : null;
```

Default off → the app ships without hotlinking contested media.

---

## Media & licensing

- The GIF/image assets are **NOT redistributable** and their licensing is **contested**. **Do
  not bundle GIFs** in the app, the repo, or Supabase storage.
- Store only the opaque `media_id`. Constructing `static.exercisedb.dev/media/{media_id}.gif` is
  **hotlinking a third-party CDN** with unclear terms — a legal + availability risk (link rot,
  rate-limiting, takedown).
- **Safe default: `SHOW_EXERCISE_MEDIA = false`.** `demo_video_url`/`demo_image_url` stay null.
  Ship text-only (name, muscles, equipment, English instructions). Revisit media only after a
  licensing review or after sourcing a properly-licensed media set.

---

## Step-by-step execution checklist

1. **DDL migration** — create `supabase/migrations/20260708000000_exercise_dataset_columns.sql`
   (additive columns + widened `body_part` CHECK + `source` index). Verify the existing CHECK
   constraint name via `\d public.exercises` first.
2. **Generator** — write a one-off transform script that reads `data/exercises.json` and emits
   `supabase/migrations/20260708000100_exercise_dataset_seed.sql` as a single
   `INSERT … ON CONFLICT (slug) DO NOTHING`. Commit the `.sql`; script is a build artifact.
3. **Edge function** — narrow the `list` projection in
   `supabase/functions/exercise-library/index.ts` to exclude `instructions`.
4. **Types** — add optional `instructions`/`media_id`/`target`/`source` to `Exercise` in
   `types/exercise.ts`.
5. **Client cache** — bump `CACHE_KEY` to `exercise_library_v2` in `lib/exerciseLibrary.ts`.
6. **Detail UI (optional)** — add an English "Instructions" card + flag-gated media block in
   `app/exercise-library/[slug].tsx`.
7. **Pre-commit** — run GitNexus `detect_changes({scope:"compare", base_ref:"main"})`; expect only
   `exerciseLibrary.ts`, the two screens, and the edge fn — all LOW.
8. **Lint** — `npx expo lint`.
9. **— MANUAL USER STEPS —**
   - `supabase db push`  (applies both migrations; DDL before seed by timestamp order)
   - `supabase functions deploy exercise-library`
   - Reload the app (cache re-fetches under `_v2`; verify list loads fast and detail shows
     instructions).

---

## Risks & open questions

1. **Seed migration file size.** 1,324 rows × 6-language instructions may produce a multi-MB
   `.sql`, heavy in git/PR review. If unacceptable, fall back to a Deno service-role seed script
   (still `ON CONFLICT DO NOTHING`). **Open: confirm generated file size before committing.**
2. **Slug collisions the user may NOT want dropped.** `ON CONFLICT DO NOTHING` keeps the curated
   18 and drops dataset duplicates — even if a dataset row is richer than a curated stub. This is
   the intended, safe default; flag if any curated row should instead be enriched.
3. **`body_part` CHECK widening vs UI filter.** The `BODY_PARTS` pill array
   (`app/exercise-library/index.tsx:13`) lacks `Upper Arms`/`Lower Arms`/`Waist`/etc., so rows on
   widened labels aren't reachable via a filter pill (still visible unfiltered + via search).
   **Open: add pills for new buckets, or remap arms→`Bis`/`Tris` and waist→`Abs` in the generator.**
   Recommend remapping the obvious ones and widening only genuinely unmappable labels (`neck`,
   forearms).
4. **`category` heuristic accuracy.** compound/isolation is inferred, not authoritative — some
   rows will be mislabeled. Low stakes (display only; rest-timer heuristic is name-based and
   independent).
5. **Muscle vocabulary mismatch.** Curated rows use tokens like `front_delts`; the dataset uses
   `target`/`muscle_group` strings (e.g. `pectorals`). The plan snake-cases dataset values but
   does not reconcile the two vocabularies. Cosmetic only (no consumer keys off muscle strings).
   **Open: normalize later if a muscle-based filter is added.**
6. **CDN dependency / licensing.** Even flag-gated, storing `media_id` implies intent to use a
   contested CDN. Confirm legal comfort before enabling `SHOW_EXERCISE_MEDIA`.
7. **i18n.** All 6 languages are stored (future-proof) but only `en` is surfaced. When locales are
   added, the detail screen picks `instructions[locale] ?? instructions.en` — no schema change
   needed.
