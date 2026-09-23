-- ============================================================
-- Barcode food lookup: shared Open Food Facts cache + abuse gate.
--
-- Design notes:
--   • This table holds PUBLIC food facts, not user data. It is a shared cache
--     so one OFF fetch serves every user who ever scans that product.
--   • It is deliberately NOT `public.foods`: scanning must not create catalog
--     rows (orphans when the user cancels) and must not collide with
--     uq_foods_global_name. Scanned items are logged as snapshot-only
--     food_logs rows with food_id = NULL, exactly like quick log.
--   • RLS is enabled with NO policies: only the service role (the
--     food-barcode Edge Function) can read or write it. Clients never touch
--     it directly, per the "mutations via Edge Functions only" rule.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.barcode_foods (
    -- Normalized GTIN-13, but 8..14 is allowed so an odd-length source code
    -- can still be cached rather than refetched forever.
    barcode         TEXT PRIMARY KEY CHECK (barcode ~ '^[0-9]{8,14}$'),

    -- 'found'      → complete, loggable nutrition below
    -- 'incomplete' → product exists but lacks a name or any energy value
    -- 'not_found'  → the source has no such product (cached to stop refetching)
    status          TEXT NOT NULL CHECK (status IN ('found', 'incomplete', 'not_found')),

    name            TEXT,
    brand           TEXT,

    -- Per ONE serving of serving_size_g. Bounds mirror public.foods (0033) so a
    -- cached row can never carry a value that would fail a foods CHECK.
    serving_size_g  NUMERIC(8,2) CHECK (serving_size_g IS NULL OR serving_size_g > 0),
    serving_label   TEXT,
    calories        NUMERIC(7,2) CHECK (calories        IS NULL OR (calories        >= 0 AND calories        <= 10000)),
    protein_g       NUMERIC(7,2) CHECK (protein_g       IS NULL OR (protein_g       >= 0 AND protein_g       <= 500)),
    carbs_g         NUMERIC(7,2) CHECK (carbs_g         IS NULL OR (carbs_g         >= 0 AND carbs_g         <= 1000)),
    fat_g           NUMERIC(7,2) CHECK (fat_g           IS NULL OR (fat_g           >= 0 AND fat_g           <= 500)),
    fiber_g         NUMERIC(7,2) CHECK (fiber_g         IS NULL OR (fiber_g         >= 0 AND fiber_g         <= 200)),
    saturated_fat_g NUMERIC(7,2) CHECK (saturated_fat_g IS NULL OR (saturated_fat_g >= 0 AND saturated_fat_g <= 300)),
    sugar_g         NUMERIC(7,2) CHECK (sugar_g         IS NULL OR (sugar_g         >= 0 AND sugar_g         <= 500)),
    sodium_mg       NUMERIC(8,2) CHECK (sodium_mg       IS NULL OR (sodium_mg       >= 0 AND sodium_mg       <= 20000)),

    -- '100g' | '100ml' | 'serving' — what the source values were expressed per.
    basis           TEXT,
    source          TEXT NOT NULL DEFAULT 'openfoodfacts',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A 'found' row must actually be loggable, or the client would render a
    -- food with no name / no calories and log silently wrong macros.
    CONSTRAINT barcode_foods_found_is_complete CHECK (
        status <> 'found' OR (
            name IS NOT NULL
            AND serving_size_g IS NOT NULL AND serving_size_g > 0
            AND calories IS NOT NULL
        )
    )
);

COMMENT ON TABLE public.barcode_foods IS
    'Shared Open Food Facts lookup cache keyed by normalized GTIN. Public food facts, no user data. Service-role only.';
COMMENT ON COLUMN public.barcode_foods.status IS
    'found = loggable; incomplete = exists but unusable nutrition; not_found = absent upstream (cached to avoid refetch storms).';
COMMENT ON COLUMN public.barcode_foods.serving_size_g IS
    'Grams in one serving. Never 0 — toServings() in the log screen treats 0 as "1 serving" and would mis-scale every entry.';

-- Refresh sweeps read this (found rows age out slower than misses).
CREATE INDEX IF NOT EXISTS idx_barcode_foods_fetched_at
    ON public.barcode_foods (fetched_at);

ALTER TABLE public.barcode_foods ENABLE ROW LEVEL SECURITY;
-- No policies: RLS-enabled with zero policies denies anon/authenticated
-- entirely. The service role bypasses RLS and is the only writer/reader.
REVOKE ALL ON public.barcode_foods FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_barcode_foods_updated_at ON public.barcode_foods;
CREATE TRIGGER trg_barcode_foods_updated_at
    BEFORE UPDATE ON public.barcode_foods
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Abuse gate for upstream fetches.
--
-- Only CACHE MISSES are counted: a user re-scanning cached products is free.
-- This exists so one account cannot enumerate barcodes and get Coach Kettle's
-- egress IP throttled or banned by Open Food Facts. It is deliberately NOT the
-- AI quota (ai_usage) — barcode lookup involves no model call, and charging it
-- against the free tier's 5 AI messages/day would be a bug.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.barcode_lookup_usage (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    lookup_count INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, usage_date)
);

COMMENT ON TABLE public.barcode_lookup_usage IS
    'Per-user daily count of barcode lookups that missed the cache and hit Open Food Facts. Abuse gate, not a billing quota.';

ALTER TABLE public.barcode_lookup_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barcode_lookup_usage FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_barcode_lookup_usage_updated_at ON public.barcode_lookup_usage;
CREATE TRIGGER trg_barcode_lookup_usage_updated_at
    BEFORE UPDATE ON public.barcode_lookup_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Increment-first, then compare — same pattern as check_and_increment_ai_usage
-- (migration 0048), so two concurrent lookups cannot both slip under the cap.
CREATE OR REPLACE FUNCTION public.check_and_increment_barcode_lookups(
    p_user_id UUID,
    p_limit   INTEGER
)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO barcode_lookup_usage (user_id, usage_date, lookup_count)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET lookup_count = barcode_lookup_usage.lookup_count + 1, updated_at = NOW()
    RETURNING lookup_count INTO v_count;

    RETURN QUERY SELECT v_count <= p_limit, v_count;
END;
$$;

-- SECURITY DEFINER + arbitrary p_user_id ⇒ service-role only. Default EXECUTE
-- is granted to PUBLIC, so PUBLIC must be revoked explicitly (not just
-- anon/authenticated).
REVOKE ALL ON FUNCTION public.check_and_increment_barcode_lookups(UUID, INTEGER)
    FROM PUBLIC, anon, authenticated;
