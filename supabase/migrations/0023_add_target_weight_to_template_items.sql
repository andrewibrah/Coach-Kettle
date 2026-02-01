-- Add target_weight column to workout_template_items
-- Migration for adding weight targets to workout template exercises

-------------------------------------------------------------------------------
-- ALTER TABLE: Add target_weight column
-------------------------------------------------------------------------------

-- Add target_weight as a nullable NUMERIC column to store target weight for exercises
ALTER TABLE public.workout_template_items
ADD COLUMN target_weight NUMERIC;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.workout_template_items.target_weight IS 'Target weight for the exercise in the user''s preferred unit (lbs or kg)';
