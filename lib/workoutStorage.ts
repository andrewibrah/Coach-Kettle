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
  /** True while the workout exists locally but hasn't reached Supabase. */
  pendingSync?: boolean;
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

async function upsertLocal(session: WorkoutSession) {
  const existing = await listWorkouts();
  const next = [session, ...existing.filter((w) => w.id !== session.id)];
  await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
}

/**
 * Local-first save: AsyncStorage always succeeds first, the remote write is
 * best-effort. Returns whether the remote sync succeeded — unsynced sessions
 * are flagged pendingSync and retried by syncPendingWorkouts().
 */
export async function saveWorkout(session: WorkoutSession): Promise<{ synced: boolean }> {
  // 1. Local Write (Upsert) — the workout is safe from this point on.
  await upsertLocal({ ...session, pendingSync: true });

  // 2. Remote Sync (Best Effort)
  try {
    await api.saveWorkout(session);
    await upsertLocal({ ...session, pendingSync: false });
    return { synced: true };
  } catch (e) {
    console.warn("[saveWorkout] Supabase sync failed, saved locally only.", e);
    return { synced: false };
  }
}

/** Retry any locally-saved workouts that never reached Supabase. */
export async function syncPendingWorkouts(): Promise<number> {
  const existing = await listWorkouts();
  const pending = existing.filter((w) => w.pendingSync);
  let synced = 0;
  for (const session of pending) {
    try {
      const { pendingSync: _p, media: _m, ...payload } = session;
      await api.saveWorkout(payload);
      await upsertLocal({ ...session, pendingSync: false });
      synced += 1;
    } catch {
      // Still offline — retry on next call.
    }
  }
  return synced;
}

export async function deleteWorkout(id: string) {
  const existing = await listWorkouts();
  const next = existing.filter((w) => w.id !== id);
  await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
}

export async function clearWorkouts() {
  await AsyncStorage.removeItem(WORKOUT_HISTORY_KEY);
}
