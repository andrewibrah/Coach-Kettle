import { supabase } from './supabase';
import type { FormAnalysis, FormAnalysisInput, LocalFormEstimate } from '@/types/form';

const ANALYZER_VERSION = 'local-form-v1';

function normalizeExercise(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function buildTechniqueCues(exercise: string): string[] {
  const e = exercise.toLowerCase();
  if (e.includes('squat')) return ['Hit consistent depth.', 'Keep knees tracking over toes.', 'Brace before every rep.'];
  if (e.includes('deadlift') || e.includes('hinge')) return ['Keep the bar close.', 'Do not yank the first rep.', 'Lock ribs down before pulling.'];
  if (e.includes('bench') || e.includes('press')) return ['Control the descent.', 'Keep wrists stacked.', 'Finish each rep with a stable lockout.'];
  if (e.includes('row') || e.includes('pull')) return ['Lead with elbows.', 'Avoid torso swing.', 'Pause briefly at peak contraction.'];
  return ['Use full range of motion.', 'Keep tempo controlled.', 'Stop the set if form breaks.'];
}

export function estimateFormFromCapture(input: FormAnalysisInput): LocalFormEstimate {
  const exercise = normalizeExercise(input.exercise);
  const expected = Math.max(1, Math.min(50, Math.round(input.expected_reps ?? 8)));
  const cueText = buildTechniqueCues(exercise);

  // Until the native MediaPipe path feeds landmarks, use a conservative local
  // estimate. If landmarks exist, bump confidence because downstream analyzer
  // has real pose data to score.
  const hasLandmarks = Boolean(input.pose_landmarks);
  const rep_count = expected;
  const avg_tempo_ms = hasLandmarks ? 2600 : 3000;
  const rom_score = hasLandmarks ? 82 : 70;
  const form_score = hasLandmarks ? 84 : 72;

  return {
    rep_count,
    avg_tempo_ms,
    rom_score,
    form_score,
    cues: cueText.slice(0, 2).map((message) => ({ severity: 'info', message })),
    warnings: [
      {
        severity: hasLandmarks ? 'warning' : 'info',
        message: hasLandmarks
          ? cueText[2]
          : 'Camera capture saved. Native pose landmarks are not attached yet, so scores are conservative.',
      },
    ],
  };
}

export async function saveFormAnalysis(input: FormAnalysisInput): Promise<FormAnalysis> {
  const exercise = normalizeExercise(input.exercise);
  if (!exercise) throw new Error('Exercise is required');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not signed in');

  const estimate = estimateFormFromCapture({ ...input, exercise });
  const { data, error } = await supabase
    .from('form_analyses')
    .insert({
      user_id: userId,
      workout_id: input.workout_id ?? null,
      exercise,
      set_number: input.set_number ?? null,
      video_storage_path: input.video_uri ?? null,
      pose_landmarks: input.pose_landmarks ?? null,
      rep_count: estimate.rep_count,
      avg_tempo_ms: estimate.avg_tempo_ms,
      rom_score: estimate.rom_score,
      form_score: estimate.form_score,
      cues: estimate.cues,
      warnings: estimate.warnings,
      analyzer_version: ANALYZER_VERSION,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as FormAnalysis;
}

export async function fetchRecentFormAnalyses(limit = 10): Promise<FormAnalysis[]> {
  const { data, error } = await supabase
    .from('form_analyses')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as FormAnalysis[];
}
