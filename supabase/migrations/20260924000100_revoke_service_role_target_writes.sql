-- Class: privilege narrowing (no data change, no schema change).
-- Follow-up to 20260914000100, which revoked direct target-table writes from
-- PUBLIC/anon/authenticated but deliberately kept service_role so the old
-- nutrition-targets v5 (direct DML) kept working (release ruling X1).
-- Safe now because nutrition-targets v6, which writes only through
-- save_nutrition_target_set_atomic, is live in production, and no Edge Function
-- or SQL function writes these tables directly (docs/security/1.0.2-permission-matrix.md).
-- The RPC keeps working: it is SECURITY DEFINER (20260914000100:13) and owned
-- by the migration role (postgres), which owns both tables and keeps every privilege.
-- SELECT stays granted; FK ON DELETE CASCADE from auth.users still removes rows.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nutrition_target_sets, public.nutrition_target_day_overrides FROM service_role;
COMMIT;
