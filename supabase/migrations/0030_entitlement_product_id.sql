-- supabase/migrations/0030_entitlement_product_id.sql
-- Update get_entitlement RPC to also return apple_product_id from subscriptions table.
-- This allows the client to display the correct plan price without a UUID string-match hack.

CREATE OR REPLACE FUNCTION public.get_entitlement(p_user_id UUID)
RETURNS TABLE(
    entitlement_status TEXT,
    entitlement_source TEXT,
    expires_at TIMESTAMPTZ,
    trial_days_remaining INTEGER,
    subscription_id UUID,
    paywall_dismissed BOOLEAN,
    apple_product_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row user_entitlements%ROWTYPE;
    v_days_remaining INTEGER;
    v_apple_product_id TEXT;
BEGIN
    SELECT * INTO v_row FROM user_entitlements WHERE user_id = p_user_id;

    IF v_row IS NULL THEN
        -- No entitlement exists; caller should bootstrap
        RETURN QUERY SELECT
            NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ,
            NULL::INTEGER, NULL::UUID, FALSE, NULL::TEXT;
        RETURN;
    END IF;

    -- Lazy expiry: if trial_active but expired, flip status
    IF v_row.status = 'trial_active' AND v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
        UPDATE user_entitlements
        SET status = 'trial_expired', updated_at = NOW()
        WHERE user_id = p_user_id AND status = 'trial_active';
        v_row.status := 'trial_expired';
    END IF;

    -- Lazy expiry: if sub_active but expired, flip status
    IF v_row.status = 'sub_active' AND v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
        UPDATE user_entitlements
        SET status = 'sub_expired', updated_at = NOW()
        WHERE user_id = p_user_id AND status = 'sub_active';
        v_row.status := 'sub_expired';
    END IF;

    -- Calculate trial days remaining
    IF v_row.source = 'trial' AND v_row.expires_at IS NOT NULL AND v_row.expires_at > NOW() THEN
        v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_row.expires_at - NOW()))::INTEGER);
    ELSE
        v_days_remaining := 0;
    END IF;

    -- Fetch apple_product_id from subscriptions if linked
    IF v_row.subscription_id IS NOT NULL THEN
        SELECT s.apple_product_id INTO v_apple_product_id
        FROM subscriptions s
        WHERE s.id = v_row.subscription_id;
    END IF;

    RETURN QUERY SELECT
        v_row.status,
        v_row.source,
        v_row.expires_at,
        v_days_remaining,
        v_row.subscription_id,
        v_row.paywall_dismissed,
        v_apple_product_id;
END;
$$;
