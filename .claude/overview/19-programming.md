# Workout Programming Engine

> Multi-week personalized programs with periodization, week-to-week adaptation, per-exercise prescription, and a next-set suggestion engine.

---

## Tables (migration 0035)

| Table | Purpose |
|---|---|
| `workout_programs` | Top-level container. Unique partial index ensures only ONE row per user has `status='active'`. |
| `program_weeks` | One row per week. `is_deload`, `intensity_pct` (1.0 + 4% per week, capped +16%, 0.7 on deload), `volume_pct`. |
| `program_days` | Per-week day slots (1..days_per_week). |
| `program_exercises` | Prescribed sets × rep-range × % e1RM × target weight (derived from PRs at 70% e1RM × intensity_pct). |
| `program_templates` | Catalog of starter programs (seeded: `ppl-3day`, `pp-sh-l-5day`, `pp-sh-l-6day`). |

## Periodization

Linear (default): intensity ramps +4%/week, deload every 4th week at 70% intensity / 60% volume. Block and undulating placeholder schemes — generator currently treats both as linear; deepen in Phase 2.

## Edge function: `programming`

- `GET` — active program (no body).
- `GET ?action=list` — all user programs.
- `GET ?action=week&program_id=X&week=N` — expanded week with days + exercises.
- `POST { action:'generate', goal_type, split_type, days_per_week, weeks_total?, periodization? }` — instantiates from template, seeds PRs at 70% e1RM target.
- `POST { action:'advance_week', program_id }` — bump `current_week`.
- `POST { action:'archive' | 'reactivate', program_id }`.

## RPC: `suggest_next_set(p_user_id, p_exercise)` (migration 0037)

Looks at the most recent prior session for that exercise for that user and returns:
- `last_workout_date`, `last_top_weight_lbs`, `last_top_reps`, `last_top_e1rm`
- `suggested_weight_lbs`, `suggested_reps_low`, `suggested_reps_high`
- `strategy` ∈ {`no_history`, `hold`, `increase_weight`, `micro_load`, `deload_set`}
- `rationale` — one-sentence explanation

Heuristics (in plpgsql):
- Hit 12+ reps with clean drop-off < 20 lb → +5 / +10 lb, drop rep target by ~3.
- Hit 10+ reps with clean drop-off → +2.5 / +5 lb.
- Any working set ≤ 4 reps → back off by 5 / 10 lb.
- Otherwise → hold weight, hold rep range.

Surfaced in the workout flow via `components/workout/NextSetSuggestion.tsx` — a per-row pill that re-fetches on exercise change.

## Default templates

`seed_default_templates_for_user(p_user_id, p_goal)` RPC (migration 0038) — idempotent (no-op if user already has templates). Goals: `muscle_building`, `leaning_out`, `weight_loss`. Each populates 3 templates with `workout_templates` + `workout_template_items` rows. Surfaced in Settings → Nutrition preferences (button reuses the goal selection).

## Client API

`lib/programming.ts` — `fetchActiveProgram`, `fetchAllPrograms`, `fetchProgramWeek`, `generateProgram`, `advanceProgramWeek`, `archiveProgram`, `fetchNextSetSuggestion`, `seedDefaultTemplates`.

## State

`contexts/ProgramContext.tsx` exposes `program`, `currentWeek`, `refresh()`, `loadWeek(n)`, `create(input)`, `advance()`.
