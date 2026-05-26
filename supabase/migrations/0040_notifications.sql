-- ============================================================
-- Migration 0040: Notifications
-- Per-user push token registry + per-user notification preferences.
-- Local (device-scheduled) notifications don't need a server row,
-- but we still store the user's *preferences* so the device can
-- re-derive its schedule across app reinstalls.
-- ============================================================

-- 1. PUSH SUBSCRIPTIONS (Expo / APNs / FCM token registry)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform        TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
    device_id       TEXT,
    app_version     TEXT,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, expo_push_token)
);

COMMENT ON TABLE public.notification_subscriptions IS 'Expo push tokens per user/device. revoked_at!=null = unsubscribed.';

CREATE INDEX IF NOT EXISTS idx_notif_subs_user ON public.notification_subscriptions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.notification_subscriptions TO authenticated;

CREATE POLICY notif_subs_select_own ON public.notification_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_notification_subscriptions_updated_at
    BEFORE UPDATE ON public.notification_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. NOTIFICATION PREFERENCES (per-user toggles + timing)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_granted   BOOLEAN NOT NULL DEFAULT FALSE,
    -- Toggles (default ON for new users to drive engagement; user can disable any)
    rest_timer_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    workout_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    workout_reminder_hour SMALLINT NOT NULL DEFAULT 8 CHECK (workout_reminder_hour BETWEEN 0 AND 23),
    workout_reminder_minute SMALLINT NOT NULL DEFAULT 0 CHECK (workout_reminder_minute BETWEEN 0 AND 59),
    nutrition_midday_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    nutrition_midday_hour SMALLINT NOT NULL DEFAULT 14 CHECK (nutrition_midday_hour BETWEEN 0 AND 23),
    daily_feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    daily_feedback_hour  SMALLINT NOT NULL DEFAULT 21 CHECK (daily_feedback_hour BETWEEN 0 AND 23),
    pr_celebration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    streak_milestones_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    harshness_escalation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    meal_plan_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_recalibration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    body_weight_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    resting_hr_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    inactivity_reengagement_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- Quiet hours
    quiet_hours_start_hour SMALLINT CHECK (quiet_hours_start_hour IS NULL OR quiet_hours_start_hour BETWEEN 0 AND 23),
    quiet_hours_end_hour   SMALLINT CHECK (quiet_hours_end_hour   IS NULL OR quiet_hours_end_hour   BETWEEN 0 AND 23),
    timezone             TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_preferences IS 'Per-user notification toggles + timing. Single row per user.';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT SELECT ON public.notification_preferences TO authenticated;

CREATE POLICY notif_prefs_select_own ON public.notification_preferences
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. NOTIFICATION LOG (audit of pushes sent / scheduled)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,
    delivery        TEXT NOT NULL CHECK (delivery IN ('local_scheduled','push_sent','push_failed','local_fired')),
    title           TEXT,
    body            TEXT,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_log IS 'Audit of notifications. Useful for debugging deliverability.';

CREATE INDEX IF NOT EXISTS idx_notif_log_user ON public.notification_log (user_id, created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_log FROM anon, authenticated;
GRANT SELECT ON public.notification_log TO authenticated;

CREATE POLICY notif_log_select_own ON public.notification_log
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
