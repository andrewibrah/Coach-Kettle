-- ============================================================
-- Migration 0028: Subscription & Trial System
-- Architecture B: Edge-Function Verification + Webhook-Driven
-- ============================================================

-- 1. TABLES
-- ------------------------------------------------------------

-- Trial grants (immutable, one per user)
CREATE TABLE IF NOT EXISTS public.trial_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.trial_grants IS 'Immutable record of one-time trial grant per user. UNIQUE on user_id ensures exactly one trial.';

-- Subscriptions (App Store authoritative records)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    apple_original_transaction_id TEXT,
    apple_product_id        TEXT,
    status                  TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'billing_retry', 'revoked'))
                            DEFAULT 'active',
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    auto_renew_enabled      BOOLEAN DEFAULT TRUE,
    receipt_data            TEXT,
    environment             TEXT CHECK (environment IN ('sandbox', 'production')) DEFAULT 'production',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, apple_original_transaction_id)
);

COMMENT ON TABLE public.subscriptions IS 'Authoritative subscription records from App Store. Only writable by service-role.';

-- User entitlements (materialized derived state — single source of truth)
CREATE TABLE IF NOT EXISTS public.user_entitlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('trial_active', 'trial_expired', 'sub_active', 'sub_expired'))
                    DEFAULT 'trial_active',
    source          TEXT NOT NULL CHECK (source IN ('trial', 'subscription', 'manual'))
                    DEFAULT 'trial',
    expires_at      TIMESTAMPTZ,
    paywall_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_entitlements IS 'Materialized entitlement state. Single source of truth for access gating. Only writable by service-role.';
COMMENT ON COLUMN public.user_entitlements.paywall_dismissed IS 'Whether user has seen and dismissed the initial post-signup paywall offer.';

-- Subscription events (audit log)
CREATE TABLE IF NOT EXISTS public.subscription_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    event_subtype   TEXT,
    raw_payload     JSONB,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT UNIQUE
);

COMMENT ON TABLE public.subscription_events IS 'Audit trail for all subscription lifecycle events.';

-- AI usage tracking for free-tier daily limits
CREATE TABLE IF NOT EXISTS public.ai_usage (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, usage_date)
);

COMMENT ON TABLE public.ai_usage IS 'Daily AI message counter for free-tier gating (5 messages/day).';

-- 2. INDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trial_grants_user_id ON public.trial_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_txn ON public.subscriptions (apple_original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON public.user_entitlements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_status ON public.user_entitlements (status);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_idempotency ON public.subscription_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON public.subscription_events (event_type, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON public.ai_usage (user_id, usage_date);

-- 3. ENABLE RLS
-- ------------------------------------------------------------

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- 4. REVOKE BROAD PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON public.trial_grants FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.user_entitlements FROM anon, authenticated;
REVOKE ALL ON public.subscription_events FROM anon, authenticated;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

-- 5. RLS POLICIES — LEAST PRIVILEGE
-- ------------------------------------------------------------

-- trial_grants: users can only SELECT their own row
GRANT SELECT ON public.trial_grants TO authenticated;

CREATE POLICY trial_grants_select_own ON public.trial_grants
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- subscriptions: users can only SELECT their own rows
GRANT SELECT ON public.subscriptions TO authenticated;

CREATE POLICY subscriptions_select_own ON public.subscriptions
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- user_entitlements: users can only SELECT their own row
GRANT SELECT ON public.user_entitlements TO authenticated;

CREATE POLICY user_entitlements_select_own ON public.user_entitlements
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- subscription_events: users can SELECT their own events
GRANT SELECT ON public.subscription_events TO authenticated;

CREATE POLICY subscription_events_select_own ON public.subscription_events
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- ai_usage: users can SELECT their own usage
GRANT SELECT ON public.ai_usage TO authenticated;

CREATE POLICY ai_usage_select_own ON public.ai_usage
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- 6. TRIGGERS
-- ------------------------------------------------------------

-- Auto-update updated_at on subscriptions
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Auto-update updated_at on user_entitlements
CREATE TRIGGER trg_user_entitlements_updated_at
    BEFORE UPDATE ON public.user_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Auto-update updated_at on ai_usage
CREATE TRIGGER trg_ai_usage_updated_at
    BEFORE UPDATE ON public.ai_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 7. HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS)
-- ------------------------------------------------------------

-- Bootstrap trial for a user (idempotent)
CREATE OR REPLACE FUNCTION public.bootstrap_trial(p_user_id UUID)
RETURNS TABLE(
    entitlement_status TEXT,
    expires_at TIMESTAMPTZ,
    is_new_trial BOOLEAN,
    paywall_dismissed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trial_exists BOOLEAN;
    v_trial_expires TIMESTAMPTZ;
    v_entitlement_status TEXT;
    v_paywall_dismissed BOOLEAN;
BEGIN
    -- Check if trial already exists
    SELECT EXISTS(SELECT 1 FROM trial_grants WHERE user_id = p_user_id) INTO v_trial_exists;

    IF v_trial_exists THEN
        -- Return existing entitlement
        SELECT ue.status, ue.expires_at, ue.paywall_dismissed
        INTO v_entitlement_status, v_trial_expires, v_paywall_dismissed
        FROM user_entitlements ue WHERE ue.user_id = p_user_id;

        -- If no entitlement row exists (edge case), create one from trial
        IF v_entitlement_status IS NULL THEN
            SELECT tg.trial_expires_at INTO v_trial_expires
            FROM trial_grants tg WHERE tg.user_id = p_user_id;

            INSERT INTO user_entitlements (user_id, status, source, expires_at, paywall_dismissed)
            VALUES (
                p_user_id,
                CASE WHEN v_trial_expires > NOW() THEN 'trial_active' ELSE 'trial_expired' END,
                'trial',
                v_trial_expires,
                FALSE
            )
            ON CONFLICT (user_id) DO NOTHING;

            SELECT ue.status, ue.expires_at, ue.paywall_dismissed
            INTO v_entitlement_status, v_trial_expires, v_paywall_dismissed
            FROM user_entitlements ue WHERE ue.user_id = p_user_id;
        END IF;

        RETURN QUERY SELECT v_entitlement_status, v_trial_expires, FALSE, COALESCE(v_paywall_dismissed, FALSE);
        RETURN;
    END IF;

    -- Create new trial
    v_trial_expires := NOW() + INTERVAL '7 days';

    INSERT INTO trial_grants (user_id, trial_started_at, trial_expires_at)
    VALUES (p_user_id, NOW(), v_trial_expires);

    INSERT INTO user_entitlements (user_id, status, source, expires_at, paywall_dismissed)
    VALUES (p_user_id, 'trial_active', 'trial', v_trial_expires, FALSE)
    ON CONFLICT (user_id) DO UPDATE
        SET status = 'trial_active',
            source = 'trial',
            expires_at = v_trial_expires,
            updated_at = NOW();

    RETURN QUERY SELECT 'trial_active'::TEXT, v_trial_expires, TRUE, FALSE;
END;
$$;

-- Get current entitlement state (with lazy expiry check)
CREATE OR REPLACE FUNCTION public.get_entitlement(p_user_id UUID)
RETURNS TABLE(
    entitlement_status TEXT,
    entitlement_source TEXT,
    expires_at TIMESTAMPTZ,
    trial_days_remaining INTEGER,
    subscription_id UUID,
    paywall_dismissed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row user_entitlements%ROWTYPE;
    v_days_remaining INTEGER;
BEGIN
    SELECT * INTO v_row FROM user_entitlements WHERE user_id = p_user_id;

    IF v_row IS NULL THEN
        -- No entitlement exists; caller should bootstrap
        RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::UUID, FALSE;
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

    RETURN QUERY SELECT
        v_row.status,
        v_row.source,
        v_row.expires_at,
        v_days_remaining,
        v_row.subscription_id,
        v_row.paywall_dismissed;
END;
$$;

-- Increment AI usage counter (returns current count for the day)
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID)
RETURNS INTEGER
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

    RETURN v_count;
END;
$$;

-- Get today's AI usage count
CREATE OR REPLACE FUNCTION public.get_ai_usage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT message_count INTO v_count
    FROM ai_usage
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

    RETURN COALESCE(v_count, 0);
END;
$$;
