-- ============================================================
-- Migration: add auto_start_rest_timer preference (#3).
--
-- Locked decision: logging a set no longer auto-starts the rest timer by
-- default. A new Settings toggle (default off) lets users opt back into the
-- old behavior. Lives alongside rest_timer_enabled in notification_preferences
-- (not `profiles`) — it's the same per-user settings row this app already
-- uses for the sibling "Rest timer" push toggle.
-- ============================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS auto_start_rest_timer BOOLEAN NOT NULL DEFAULT FALSE;
