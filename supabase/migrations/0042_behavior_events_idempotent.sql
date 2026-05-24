-- ============================================================
-- Migration 0042: behavior_events idempotency
-- Keeps one grading event per user/date so daily-feedback regeneration
-- cannot inflate harshness streaks.
-- ============================================================

DELETE FROM public.behavior_events be
USING public.behavior_events older
WHERE be.user_id = older.user_id
  AND be.event_date = older.event_date
  AND (
    older.created_at < be.created_at
    OR (older.created_at = be.created_at AND older.id < be.id)
  );

ALTER TABLE public.behavior_events
    ADD CONSTRAINT behavior_events_user_date_unique UNIQUE (user_id, event_date);
