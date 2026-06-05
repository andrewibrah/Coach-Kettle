-- Migration 0044: Add 'neutral_day' to behavior_events kind constraint.
-- A neutral day does not affect streaks in either direction.

ALTER TABLE behavior_events DROP CONSTRAINT IF EXISTS behavior_events_kind_check;
ALTER TABLE behavior_events ADD CONSTRAINT behavior_events_kind_check
  CHECK (kind IN ('good_day', 'bad_day', 'plan_recalibrated', 'neutral_day'));
