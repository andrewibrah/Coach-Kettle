# RLS Matrix

## Sources Reviewed
- Backend code: `backend/main.py`, `backend/structured_gate.py` — no auth checks or user IDs present.
- No authorization middleware, role definitions, or permission tests found.

## Policies Added (0003_rls_policies.sql)
- `public.workouts`: RLS enabled; policy `workouts_deny_all` (`for all`, `using (false)`, `with check (false)`).
- `public.workout_log`: RLS enabled; policy `workout_log_deny_all` (`for all`, `using (false)`, `with check (false)`).

## Table Coverage
- workouts — Policy: `workouts_deny_all`; Role: n/a; Operations: all; Behavior: deny all (placeholder).
- workout_log — Policy: `workout_log_deny_all`; Role: n/a; Operations: all; Behavior: deny all (placeholder).

## UNKNOWNs
- No user identifier columns exist on either table; cannot scope policies to `auth.uid()`.
- No roles/permissions or access rules defined in backend; desired access model is UNKNOWN.
- Whether any tables should be public or per-user is UNKNOWN.

## Supabase CLI
- `supabase db push` succeeded after authentication; applied `0003_rls_policies.sql` to project EzLifts (`vjfteiuxsdqdozhljxhd`). Notices indicated policies did not previously exist (skip messages) then completed successfully.
