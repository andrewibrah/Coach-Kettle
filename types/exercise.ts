// Canonical exercise library types.

export type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';
export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  category: ExerciseCategory;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  difficulty: ExerciseDifficulty;
  body_part: string;
  description: string | null;
  cues: string[];
  common_mistakes: string[];
  demo_video_url: string | null;
  demo_image_url: string | null;
  created_at: string;
  updated_at: string;
  // Additive fields from the open-source dataset import (list rows omit these).
  instructions?: Record<string, string[] | string> | null; // {en,es,it,tr,ru,zh}
  media_id?: string | null;
  target?: string | null;
  source?: string;
}
