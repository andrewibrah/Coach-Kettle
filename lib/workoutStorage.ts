import { api } from "./api";

import AsyncStorage from "@react-native-async-storage/async-storage";

export type WorkoutRow = {
  id?: string;
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp?: number;
  // Cardio fields
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
};

export type SessionReview = {
  rating: number; // 1-10
  strengths: string[];
  weakness: string;
  nextSessionNote: string;
  generatedAt: number;
};

export type WorkoutMediaRecord = {
  id: string;
  workout_id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  file_size_bytes?: number;
  created_at: string;
  signed_url?: string | null; // Pre-signed URL from server (1hr TTL)
};

export type WorkoutSession = {
  id: string;
  dateISO: string; // YYYY-MM-DD
  part: string;
  rows: WorkoutRow[];
  createdAt: number;
  review?: SessionReview;
  reflection?: string;
  media?: WorkoutMediaRecord[];
};

export const WORKOUT_HISTORY_KEY = "workout_history_v1";

export async function listWorkouts(): Promise<WorkoutSession[]> {
  const raw = await AsyncStorage.getItem(WORKOUT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveWorkout(session: WorkoutSession) {
  // 1. Local Write (Upsert)
  const existing = await listWorkouts();
  const next = [session, ...existing.filter((w) => w.id !== session.id)];
  await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));

  // 2. Remote Sync (Best Effort)
  try {
    await api.saveWorkout(session);
  } catch (e) {
    // Fail silently if Supabase is unreachable
    console.log("[saveWorkout] Supabase sync failed, saved locally only.", e);
  }
}

export async function deleteWorkout(id: string) {
  const existing = await listWorkouts();
  const next = existing.filter((w) => w.id !== id);
  await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
}

export async function clearWorkouts() {
  await AsyncStorage.removeItem(WORKOUT_HISTORY_KEY);
}
