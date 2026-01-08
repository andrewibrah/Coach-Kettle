# History / Audit Mapping

## Sources Reviewed
- Backend: `backend/main.py`, `backend/structured_gate.py`.
- Database schema: SQLite `workouts`, `workout_log`; no audit/event tables or triggers.
- No audit logging, activity feeds, or analytics pipelines found.

## Target Migration
- `supabase/migrations/0005_history_pipeline.sql` contains `-- UNKNOWN: history pipeline not found` because no history/audit sources exist in the codebase.

## UNKNOWNs
- No audit/event sources to map (creation, updates, deletes, parsing events).
- No immutable history tables or triggers identified in source.
- No timestamp/order semantics beyond `createdAt` on `workouts` and `created_at` text on `workout_log`.

## Supabase CLI
- `supabase db push` not run for 0005 in this task; previous CLI attempts require authentication (`supabase login` or `SUPABASE_ACCESS_TOKEN`). Re-run after authenticating to apply or keep placeholder as-is.
