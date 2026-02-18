-- Migration: Add cardio-specific fields to workout_log
-- These fields allow proper tracking of cardio activities with duration, distance, heart rate, calories, and level

-- Add cardio columns to workout_log (all nullable to maintain backwards compatibility)
ALTER TABLE public.workout_log
ADD COLUMN IF NOT EXISTS duration_mins NUMERIC,
ADD COLUMN IF NOT EXISTS distance NUMERIC,
ADD COLUMN IF NOT EXISTS distance_unit TEXT,
ADD COLUMN IF NOT EXISTS heart_rate INTEGER,
ADD COLUMN IF NOT EXISTS calories INTEGER,
ADD COLUMN IF NOT EXISTS level INTEGER,
ADD COLUMN IF NOT EXISTS is_cardio BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.workout_log.duration_mins IS 'Duration in minutes for cardio activities';
COMMENT ON COLUMN public.workout_log.distance IS 'Distance covered (unit specified in distance_unit)';
COMMENT ON COLUMN public.workout_log.distance_unit IS 'Unit for distance: miles, km, meters';
COMMENT ON COLUMN public.workout_log.heart_rate IS 'Average heart rate during activity';
COMMENT ON COLUMN public.workout_log.calories IS 'Calories burned during activity';
COMMENT ON COLUMN public.workout_log.level IS 'Resistance/incline level for cardio machines';
COMMENT ON COLUMN public.workout_log.is_cardio IS 'Flag to identify cardio entries for filtering/queries';

-- Create index for cardio queries
CREATE INDEX IF NOT EXISTS idx_workout_log_is_cardio ON public.workout_log(user_id, is_cardio) WHERE is_cardio = TRUE;
