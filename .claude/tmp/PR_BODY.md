## Summary

Expands the canonical `public.exercises` catalog from **18 curated seeds → ~1,340 exercises** by additively importing the open-source [ExerciseDB dataset](https://github.com/hasaneyldrm/exercises-dataset) (1,324 rows). The import is **backward-compatible by construction**: curated rows always win via `ON CONFLICT (slug) DO NOTHING`, every new column is nullable/defaulted, and the `body_part` CHECK is *widened* rather than replaced — nothing existing is mutated or dropped.

This lands on top of the existing exercise-library feature (screens, `lib`, edge fn, migration `0032`). Base branch is **`c1.0.1`** — `main` does not yet contain that infrastructure.

## What changed

### Database (additive migrations)
- **`20260708000000_exercise_dataset_columns.sql`** — adds `instructions` (JSONB, 6-locale), `media_id`, `target`, and `source` (`NOT NULL DEFAULT 'curated'`, so the 18 existing rows backfill without an UPDATE). Widens `exercises_body_part_check` to admit the dataset's anatomical labels (`Lower Arms`, `Neck`, …) as a superset of the original 12. Adds `idx_exercises_source` so OSS rows can be bulk-managed/purged. The `category` CHECK is untouched.
- **`20260708000100_exercise_dataset_seed.sql`** — a single generated `INSERT … ON CONFLICT (slug) DO NOTHING` of **1,324 rows**. `body_part` is enum-mapped (`upper arms` → `Bis`/`Tris` by `target`; `waist` → `Abs`; `upper/lower legs` → `Legs`; etc.), `category` is derived by heuristic (compound/isolation/cardio), and slugs are de-duped.

### Edge function
- `exercise-library` — the `list` action projection is trimmed to `id, slug, name, category, body_part, equipment, cues, difficulty`, so the 6-language `instructions` blob **never** ships in the list payload or the 24 h client cache. `get` / `search` / `by_body_part` are unchanged (detail still gets everything).

### Client
- `types/exercise.ts` — adds optional `instructions` / `media_id` / `target` / `source`. All optional → non-breaking (GitNexus `impact` on `Exercise` = LOW).
- `lib/exerciseLibrary.ts` — bumps the cache key `exercise_library_v1` → `_v2` to force a clean re-fetch under the trimmed list shape (this is a public catalog, intentionally **not** in `clearAllCaches()`).
- `app/exercise-library/[slug].tsx` — additive English **"Instructions"** card; demo media is behind `SHOW_EXERCISE_MEDIA` (**default off** — media licensing is contested, so the app ships text-only and stores only the opaque `media_id`).

### Tooling
- `scripts/transform-exercises.mjs` — the one-off generator (build artifact) that reads `exercises.json` and emits the seed `.sql`: slugify + de-dupe, `body_part` map, `category` heuristic, and SQL-safe single-quote escaping.

## Body-part distribution (1,324 imported rows)
`Abs 169 · Legs 286 · Back 203 · Chest 163 · Tris 141 · Bis 151 · Shoulders 143 · Cardio 29 · Lower Arms 37 · Neck 2`
Only `Lower Arms` (37) and `Neck` (2) use widened labels; all 292 "upper arms" rows split cleanly into Bis/Tris.

## Verification
- **GitNexus** blast radius re-confirmed **LOW** before editing: `fetchExerciseLibrary` (2), `Exercise` (12, all additive), `generateProgramFromTemplate` (1). `detect_changes` (working tree) = only the two library screens, `lib`, `types`, and the edge fn.
- `npx tsc --noEmit` — clean. `npx expo lint` — clean.
- Seed validated programmatically: **1,324 rows × 15 fields each, 0 parse errors**; quote-aware field parser confirms SQL literal integrity.
- **Independent review pass** (separate agent, did not author the code): no blocking issues; only LOW/NIT advisories already documented as accepted in the plan.

## Known / accepted trade-offs
- `Lower Arms` (37) and `Neck` (2) have no filter pill on the list screen → reachable via scroll/search only. (Accepted in plan.)
- `category` compound/isolation is heuristic, not authoritative — display-only; the rest-timer heuristic is name-based and independent.
- `search` still `select("*")` — bounded by `.limit(25)`, so payload is not a concern.

## Deploy steps (maintainer runs manually)
```bash
supabase db push                            # applies DDL (…000000) then seed (…000100) in timestamp order
supabase functions deploy exercise-library  # ships the trimmed list projection
# reload app → cache re-fetches under _v2
```

## Test plan
1. Library loads ~1,300+ exercises and loads **fast** (proves instructions excluded from list).
2. Open an imported exercise → **Instructions** card renders, no image (media off).
3. Open **Barbell Bench Press** (curated) → cues / common mistakes / description intact (proves `ON CONFLICT DO NOTHING`).
4. Program → week → tap exercise → still routes to detail by slug (regression).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
