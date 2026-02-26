-- Add review_json column to store AI-generated workout reviews
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS review_json text;
