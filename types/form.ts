export interface FormCue {
  severity: 'info' | 'warning' | 'danger';
  message: string;
}

export interface FormAnalysis {
  id: string;
  user_id: string;
  workout_id: string | null;
  exercise: string;
  set_number: number | null;
  captured_at: string;
  video_storage_path: string | null;
  pose_landmarks: unknown | null;
  rep_count: number | null;
  avg_tempo_ms: number | null;
  rom_score: number | null;
  form_score: number | null;
  cues: FormCue[];
  warnings: FormCue[];
  analyzer_version: string | null;
  created_at: string;
}

export interface FormAnalysisInput {
  exercise: string;
  workout_id?: string | null;
  set_number?: number | null;
  video_uri?: string | null;
  pose_landmarks?: unknown | null;
  expected_reps?: number | null;
}

export interface LocalFormEstimate {
  rep_count: number;
  avg_tempo_ms: number;
  rom_score: number;
  form_score: number;
  cues: FormCue[];
  warnings: FormCue[];
}
