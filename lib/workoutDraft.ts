import AsyncStorage from '@react-native-async-storage/async-storage';
import { type LogRow } from '@/types/workout';

const WORKOUT_DRAFT_KEY = 'workout_draft_v1';

export interface WorkoutDraft {
  workoutId: string;
  dateISO: string;
  bodyParts: string[];
  createdAt: number;
  rows: LogRow[];
  updatedAt: number;
}

/** Read the current in-progress workout draft (if any). */
export async function getWorkoutDraft(): Promise<WorkoutDraft | null> {
  try {
    const stored = await AsyncStorage.getItem(WORKOUT_DRAFT_KEY);
    if (stored) {
      return JSON.parse(stored) as WorkoutDraft;
    }
  } catch (e) {
    console.warn('[WorkoutDraft] Failed to get draft:', e);
  }
  return null;
}

/** Persist the current workout state as a draft. */
export async function saveWorkoutDraft(draft: WorkoutDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('[WorkoutDraft] Failed to save draft:', e);
  }
}

/** Remove the draft (after successful save or stale-day clear). */
export async function clearWorkoutDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
  } catch (e) {
    console.warn('[WorkoutDraft] Failed to clear draft:', e);
  }
}
