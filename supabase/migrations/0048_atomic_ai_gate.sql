-- ============================================================
-- Migration 0048: Atomic AI usage gate
-- Replaces the read-then-increment pattern (get_ai_usage +
-- increment_ai_usage) used by chat/coach with a single
-- increment-first check, so two concurrent requests can never
-- both sneak under the daily cap.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(p_user_id UUID, p_limit INTEGER)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO ai_usage (user_id, usage_date, message_count)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET message_count = ai_usage.message_count + 1, updated_at = NOW()
    RETURNING message_count INTO v_count;

    -- Increment-first: the counter is bumped, then compared. Rejected
    -- requests still count, which is intentional — the counter is a gate,
    -- not an analytics metric.
    RETURN QUERY SELECT v_count <= p_limit, v_count;
END;
$$;

-- Default EXECUTE is granted to PUBLIC; revoking only anon/authenticated leaves
-- that grant intact. Revoke from PUBLIC too so ONLY service-role can call this
-- SECURITY DEFINER function (it takes an arbitrary p_user_id and bypasses RLS).
REVOKE ALL ON FUNCTION public.check_and_increment_ai_usage(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
