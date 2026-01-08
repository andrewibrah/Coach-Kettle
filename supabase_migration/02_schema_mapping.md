# Schema Mapping (Initial)

## Sources Reviewed
- `backend/workouts.db` schema via `.schema` (tables: `workouts`, `workout_log`).
- Backend usage in `backend/main.py` (uses `workouts` table).
- No other migrations or ORM models found.

## Target Migration
- `supabase/migrations/0001_initial_schema.sql` creates:
  - `public.workouts`
  - `public.workout_log`
  - Indexes: `idx_workout_log_workout_id`, `idx_workout_log_workout_date`.

## Table Mapping

### workouts
- Source: SQLite `workouts` (id TEXT PK, dateISO TEXT, part TEXT, createdAt INTEGER, rows_json TEXT).
- Target: `public.workouts` (id text PK, "dateISO" text, part text, "createdAt" bigint, rows_json text).
- Notes: Column casing preserved with quotes to match source naming. `createdAt` kept as bigint to reflect epoch millis stored in source.
- Constraints: Primary key on `id`. No FKs present in source; none added.

### workout_log
- Source: SQLite `workout_log` (id INTEGER PK AUTOINCREMENT, workout_id TEXT, workout_date TEXT, exercise TEXT, set_number REAL, weight_lbs TEXT, reps TEXT, notes TEXT, created_at TEXT). Indexes on `workout_id`, `workout_date`.
- Target: `public.workout_log` (id bigserial PK, workout_id text not null, workout_date text not null, exercise text not null, set_number double precision not null, weight_lbs text, reps text, notes text, created_at text not null). Indexes replicated.
- Notes: No foreign key defined in source; none added. `created_at` remains text because source format is unspecified.

## UNKNOWNs
- Whether `workout_log` is still used by the application; no live code references found.
- Expected timestamp format for `workout_log.created_at` (stored as TEXT in source).
- Desired referential integrity between `workout_log.workout_id` and `workouts.id` (none present in source).
- Any additional tables beyond the SQLite schema (none discovered).

## Supabase CLI
- `supabase db push` not run. Reason: CLI not invoked within task scope; no project link/config established for execution.
