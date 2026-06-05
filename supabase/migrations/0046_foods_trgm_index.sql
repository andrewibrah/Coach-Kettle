-- Migration 0046: Add pg_trgm extension and GIN indexes for fuzzy food search.
-- Also creates search_foods_fuzzy RPC used by food-log Edge Function.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_foods_name_trgm ON public.foods
  USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foods_name_lower_trgm ON public.foods
  USING gin (LOWER(name) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_foods_fuzzy(p_q TEXT, p_user_id UUID)
RETURNS SETOF public.foods
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT * FROM foods
  WHERE (is_global = TRUE OR user_id = p_user_id)
    AND (name % p_q OR LOWER(name) % LOWER(p_q))
  ORDER BY is_global DESC, similarity(LOWER(name), LOWER(p_q)) DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_foods_fuzzy(TEXT, UUID) TO authenticated;
