# Verification Plan

## Existing Tests
- No automated tests found for auth, data, storage, or offline flows.

## Artifacts Added
- `supabase_migration/verification/parity_checks.sql`: row counts, checksums, orphan detection, RLS enabled check for `workouts`, `workout_log`, `event_logs`.
- `supabase_migration/verification/api_parity_checklist.md`: enumerates endpoints and parity status (UNKNOWN for AI/parsing endpoints).

## How to Run
1. Set Supabase access (`supabase login` or `SUPABASE_ACCESS_TOKEN`).
2. Run `supabase db push` to ensure migrations are applied.
3. Execute `psql` against source and target, run `parity_checks.sql`, and compare outputs.
4. Manually exercise checklist endpoints (or scripts) to confirm behaviors match expectations.

## Invariants
- Row counts and checksums for `workouts`, `workout_log`, `event_logs` match between source and target after migration.
- No orphan rows in `workout_log` (workout_id should exist in `workouts`).
- RLS is enabled on `workouts`, `workout_log`, `event_logs` (policies configured separately).

## UNKNOWNs / Gaps
- No tests cover AI endpoints (`/chat`, `/coach`, `/parse`); parity cannot be validated.
- No storage usage to verify.
- Offline flows not covered by automated checks.

## Supabase Changes
- No Supabase changes executed in this step; artifacts are documentation/scripts only.
