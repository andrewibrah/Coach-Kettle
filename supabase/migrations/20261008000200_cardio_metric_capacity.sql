-- UNAPPLIED ADDITIVE PROPOSAL ONLY. Requires separate coordinated rollout approval.
-- Follows 20261008000100; never rewrite applied 0025 or discard raw evidence.
-- Unconstrained NUMERIC preserves legacy int32 exactly and JSON decimal numbers
-- through JS finite extremes (5e-324 .. 1.7976931348623157e308), without a fixed
-- scale, integer truncation, float input underflow, or arbitrary clinical range.
-- Existing nullable columns/defaults and table grants/RLS remain unchanged.
-- Source dependency review: 0025 owns these columns/index; PR helper composite
-- arguments follow workout_log's row type, and PR trigger/reconcile read no
-- cardio metrics. No dependent view/function return columns found in migrations.
-- Before production approval inspect actual pg_depend/views, locks/table rewrite
-- cost and PostgREST schema cache; minimal local fixture is NOT full-schema proof.
ALTER TABLE public.workout_log
  ALTER COLUMN heart_rate TYPE numeric USING heart_rate::numeric,
  ALTER COLUMN calories TYPE numeric USING calories::numeric,
  ALTER COLUMN level TYPE numeric USING level::numeric;

-- Representability guard only, not clinical policy. NOT VALID preserves all
-- existing legacy evidence without scanning/deleting/reclassifying it. New
-- writes reject NaN/infinities/outside JSON Number finite bounds. The Edge
-- validator separately enforces typed nonnegative finite metrics. Negative
-- legacy integers are retained; no silent cleaning/backfill or range invented.
ALTER TABLE public.workout_log
  ADD CONSTRAINT i3_heart_rate_finite_capacity CHECK
    (heart_rate IS NULL OR heart_rate BETWEEN -1.7976931348623157e308::numeric AND 1.7976931348623157e308::numeric) NOT VALID,
  ADD CONSTRAINT i3_calories_finite_capacity CHECK
    (calories IS NULL OR calories BETWEEN -1.7976931348623157e308::numeric AND 1.7976931348623157e308::numeric) NOT VALID,
  ADD CONSTRAINT i3_level_finite_capacity CHECK
    (level IS NULL OR level BETWEEN -1.7976931348623157e308::numeric AND 1.7976931348623157e308::numeric) NOT VALID;
