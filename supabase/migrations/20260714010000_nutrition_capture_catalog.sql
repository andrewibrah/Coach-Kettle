-- Release 6 N01: private transient nutrition analysis and service-only catalog candidates.
-- Raw text, image bytes, image URLs, and user identifiers never enter candidate/global tables.

CREATE OR REPLACE FUNCTION public.is_valid_nutrition_analysis_items(p_items JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    item JSONB;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN FALSE;
    END IF;
    IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
        RETURN FALSE;
    END IF;

    FOR item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(item) <> 'object' THEN
            RETURN FALSE;
        END IF;
        IF jsonb_typeof(item->'food_type') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'estimated_weight_g') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'estimated_calories') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'protein_g') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'carbs_g') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'fat_g') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'confidence') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'catalog_match') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'reason') IS DISTINCT FROM 'string'
        THEN
            RETURN FALSE;
        END IF;
        IF length(btrim(item->>'food_type')) NOT BETWEEN 1 AND 120
            OR (item->>'estimated_weight_g')::NUMERIC NOT BETWEEN 0.1 AND 5000
            OR (item->>'estimated_calories')::NUMERIC NOT BETWEEN 0 AND 10000
            OR (item->>'protein_g')::NUMERIC NOT BETWEEN 0 AND 500
            OR (item->>'carbs_g')::NUMERIC NOT BETWEEN 0 AND 1000
            OR (item->>'fat_g')::NUMERIC NOT BETWEEN 0 AND 500
            OR (item->>'confidence')::NUMERIC NOT BETWEEN 0 AND 1
            OR item->>'catalog_match' NOT IN ('exact', 'none')
            OR length(btrim(item->>'reason')) NOT BETWEEN 1 AND 160
        THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_nutrition_analysis_items(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_nutrition_analysis_items(JSONB) TO service_role;

CREATE TABLE public.food_analysis_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL CHECK (mode IN ('text', 'photo')),
    items       JSONB NOT NULL CHECK (public.is_valid_nutrition_analysis_items(items)),
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT food_analysis_sessions_valid_expiry CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.food_analysis_sessions IS
    'Short-lived private service-only structured analyses; never stores original text, image bytes, image URLs, or source input.';
COMMENT ON COLUMN public.food_analysis_sessions.items IS
    'Bounded structured estimates used to protect shared candidate facts from client edits.';

ALTER TABLE public.food_analysis_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_analysis_sessions FROM anon, authenticated;
GRANT ALL ON public.food_analysis_sessions TO service_role;

CREATE INDEX idx_food_analysis_sessions_expires_at
    ON public.food_analysis_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_nutrition_analysis_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.food_analysis_sessions WHERE expires_at <= NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_nutrition_analysis_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_nutrition_analysis_sessions() TO service_role;

-- Private durable rate-limit events. This table is never exposed through client roles.
CREATE TABLE public.nutrition_analysis_rate_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nutrition_analysis_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nutrition_analysis_rate_events FROM anon, authenticated;
GRANT ALL ON public.nutrition_analysis_rate_events TO service_role;

CREATE INDEX idx_nutrition_analysis_rate_user_created
    ON public.nutrition_analysis_rate_events (user_id, created_at);

CREATE OR REPLACE FUNCTION public.consume_nutrition_analysis_rate_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Serialize checks for one user so concurrent requests cannot exceed ten slots.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
    DELETE FROM public.nutrition_analysis_rate_events
    WHERE user_id = p_user_id AND created_at <= NOW() - INTERVAL '1 hour';

    SELECT count(*) INTO recent_count
    FROM public.nutrition_analysis_rate_events
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '1 hour';

    IF recent_count >= 10 THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.nutrition_analysis_rate_events (user_id) VALUES (p_user_id);
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_nutrition_analysis_rate_limit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_nutrition_analysis_rate_limit(UUID) TO service_role;

CREATE TABLE public.food_catalog_candidates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name      TEXT NOT NULL UNIQUE,
    serving_size_g      NUMERIC(8,2) NOT NULL CHECK (serving_size_g BETWEEN 0.1 AND 5000),
    calories            NUMERIC(8,2) NOT NULL CHECK (calories BETWEEN 0 AND 10000),
    protein_g           NUMERIC(7,2) NOT NULL CHECK (protein_g BETWEEN 0 AND 500),
    carbs_g             NUMERIC(7,2) NOT NULL CHECK (carbs_g BETWEEN 0 AND 1000),
    fat_g               NUMERIC(7,2) NOT NULL CHECK (fat_g BETWEEN 0 AND 500),
    confidence          NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0.85 AND 1),
    confirmation_count  BIGINT NOT NULL DEFAULT 1 CHECK (confirmation_count > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.food_catalog_candidates IS
    'Service-only aggregate candidates containing validated generic facts only. A separate later service-only review/promotion process may write public.foods; confirmation never does.';

ALTER TABLE public.food_catalog_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_catalog_candidates FROM anon, authenticated;
GRANT ALL ON public.food_catalog_candidates TO service_role;

CREATE OR REPLACE FUNCTION public.is_safe_generic_food_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = public, pg_temp
AS $$
    SELECT length(p_name) BETWEEN 2 AND 60
       AND p_name = lower(p_name)
       AND p_name ~ '^(apple|banana|orange|berries|strawberry|blueberry|avocado|tomato|potato|rice|pasta|bread|oats|oatmeal|cereal|quinoa|beans|lentils|chickpeas|chicken|breast|turkey|beef|steak|pork|bacon|fish|salmon|tuna|shrimp|egg|eggs|milk|yogurt|cheese|whey|tofu|tempeh|nuts|almonds|peanut|butter|oil|salad|soup|sandwich|burger|pizza|taco|burrito|vegetables|broccoli|spinach|carrot|corn|peas|mushroom|sauce|water|coffee|tea|juice|smoothie|white|brown|green|protein|bar)([ -](apple|banana|orange|berries|strawberry|blueberry|avocado|tomato|potato|rice|pasta|bread|oats|oatmeal|cereal|quinoa|beans|lentils|chickpeas|chicken|breast|turkey|beef|steak|pork|bacon|fish|salmon|tuna|shrimp|egg|eggs|milk|yogurt|cheese|whey|tofu|tempeh|nuts|almonds|peanut|butter|oil|salad|soup|sandwich|burger|pizza|taco|burrito|vegetables|broccoli|spinach|carrot|corn|peas|mushroom|sauce|water|coffee|tea|juice|smoothie|white|brown|green|protein|bar))*$';
$$;

REVOKE ALL ON FUNCTION public.is_safe_generic_food_name(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_safe_generic_food_name(TEXT) TO service_role;

CREATE INDEX idx_foods_global_normalized_name
    ON public.foods ((lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))))
    WHERE is_global = TRUE;

CREATE OR REPLACE FUNCTION public.lookup_global_food_exact(p_name TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN food.id IS NULL THEN NULL ELSE jsonb_build_object(
        'food_type', food.name,
        'estimated_weight_g', food.serving_size_g,
        'estimated_calories', food.calories,
        'protein_g', food.protein_g,
        'carbs_g', food.carbs_g,
        'fat_g', food.fat_g,
        'confidence', 1,
        'catalog_match', 'exact',
        'reason', 'Exact global catalog match.'
    ) END
    FROM (SELECT 1) AS seed
    LEFT JOIN LATERAL (
        SELECT name, serving_size_g, calories, protein_g, carbs_g, fat_g, id
        FROM public.foods
        WHERE is_global = TRUE
          AND lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g'))
        ORDER BY id
        LIMIT 1
    ) AS food ON TRUE;
$$;

REVOKE ALL ON FUNCTION public.lookup_global_food_exact(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_global_food_exact(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_nutrition_analysis(
    p_user_id UUID,
    p_analysis_id UUID,
    p_date DATE,
    p_meal_slot TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    session_row public.food_analysis_sessions%ROWTYPE;
    edited_item JSONB;
    stored_item JSONB;
    item_index INTEGER;
    edited_name TEXT;
    candidate_name TEXT;
    inserted_log public.food_logs%ROWTYPE;
    inserted_entries JSONB := '[]'::JSONB;
BEGIN
    IF p_user_id IS NULL OR p_analysis_id IS NULL OR p_date IS NULL
        OR p_meal_slot NOT IN ('breakfast', 'lunch', 'dinner', 'snack')
        OR NOT public.is_valid_nutrition_analysis_items(p_items)
    THEN
        RAISE EXCEPTION 'invalid analysis confirmation';
    END IF;

    SELECT * INTO session_row
    FROM public.food_analysis_sessions
    WHERE id = p_analysis_id
    FOR UPDATE;

    IF NOT FOUND OR session_row.user_id <> p_user_id THEN
        RAISE EXCEPTION 'analysis not found';
    END IF;
    IF session_row.expires_at <= NOW() THEN
        RAISE EXCEPTION 'analysis expired';
    END IF;
    IF jsonb_array_length(session_row.items) <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'item count mismatch';
    END IF;

    FOR edited_item, item_index IN
        SELECT value, (ordinality - 1)::INTEGER
        FROM jsonb_array_elements(p_items) WITH ORDINALITY
    LOOP
        stored_item := session_row.items->item_index;
        edited_name := regexp_replace(btrim(edited_item->>'food_type'), '[[:space:]]+', ' ', 'g');

        -- Only immutable server-stored facts may enter the shared candidate aggregate.
        candidate_name := lower(regexp_replace(btrim(stored_item->>'food_type'), '[[:space:]]+', ' ', 'g'));
        IF (stored_item->>'catalog_match') = 'none'
            AND (stored_item->>'confidence')::NUMERIC >= 0.85
            AND public.is_safe_generic_food_name(candidate_name)
        THEN
            INSERT INTO public.food_catalog_candidates (
                canonical_name, serving_size_g, calories, protein_g, carbs_g, fat_g, confidence
            ) VALUES (
                candidate_name,
                (stored_item->>'estimated_weight_g')::NUMERIC,
                (stored_item->>'estimated_calories')::NUMERIC,
                (stored_item->>'protein_g')::NUMERIC,
                (stored_item->>'carbs_g')::NUMERIC,
                (stored_item->>'fat_g')::NUMERIC,
                (stored_item->>'confidence')::NUMERIC
            )
            ON CONFLICT (canonical_name) DO UPDATE
            SET confirmation_count = public.food_catalog_candidates.confirmation_count + 1;
        END IF;

        INSERT INTO public.food_logs (
            user_id, food_id, log_date, meal_slot, consumed_at, food_name,
            servings, calories, protein_g, carbs_g, fat_g, fiber_g,
            saturated_fat_g, notes
        ) VALUES (
            p_user_id, NULL, p_date, p_meal_slot, NOW(), edited_name,
            1, (edited_item->>'estimated_calories')::NUMERIC,
            (edited_item->>'protein_g')::NUMERIC, (edited_item->>'carbs_g')::NUMERIC,
            (edited_item->>'fat_g')::NUMERIC, 0, 0, NULL
        )
        RETURNING * INTO inserted_log;

        inserted_entries := inserted_entries || to_jsonb(inserted_log);
    END LOOP;

    DELETE FROM public.food_analysis_sessions WHERE id = p_analysis_id;

    RETURN jsonb_build_object('analysis_id', p_analysis_id, 'entries', inserted_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_nutrition_analysis(UUID, UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_nutrition_analysis(UUID, UUID, DATE, TEXT, JSONB) TO service_role;
