-- Add reflection text column to workouts
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS reflection text;

-- Create workout_media table
CREATE TABLE IF NOT EXISTS public.workout_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id text NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  storage_path text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_media_workout ON public.workout_media(workout_id);

-- RLS for workout_media
ALTER TABLE public.workout_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY wm_sel ON public.workout_media
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY wm_ins ON public.workout_media
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY wm_del ON public.workout_media
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Private storage bucket for workout media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workout-media',
  'workout-media',
  false,
  52428800,
  ARRAY['image/jpeg','image/png','image/heic','image/webp','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access their own folder ({user_id}/...)
CREATE POLICY st_ins ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workout-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY st_sel ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workout-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY st_del ON storage.objects
  FOR DELETE USING (
    bucket_id = 'workout-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
