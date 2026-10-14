-- Optional fixed auto-rest duration. NULL (the default for every existing and
-- new row) means "use the client rest classifier" (suggestRestSeconds), so
-- users who never pick a duration keep the pre-migration behaviour exactly.
-- Independent of manual timer selection; auto_start_rest_timer is untouched.
ALTER TABLE public.notification_preferences
  ADD COLUMN auto_rest_duration_sec integer
  CONSTRAINT notification_preferences_auto_rest_duration_check
    CHECK (auto_rest_duration_sec IS NULL
      OR (auto_rest_duration_sec BETWEEN 15 AND 600 AND auto_rest_duration_sec % 5 = 0));
