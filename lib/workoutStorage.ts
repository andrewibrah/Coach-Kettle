import { api } from "./api";
import type { LogRow } from "../types/workout";

import AsyncStorage from "@react-native-async-storage/async-storage";

export type WorkoutRow = {
  id?: string;
  set?: number;
  performance?: LogRow["performance"];
  plannedTarget?: LogRow["plannedTarget"];
  setKind?: LogRow["setKind"];
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

/**
 * Discriminated source of a workout session (#1). Optional — sessions
 * created before this field existed, and today's freestyle-only flows,
 * simply omit it; treat a missing `source` as freestyle.
 */
export type WorkoutSource =
  | { kind: 'freestyle' }
  | { kind: 'template'; templateId: string }
  | { kind: 'program'; programId: string; programDayId: string; programWeek: number };

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
  /** Persisted transport identity; retry reuses it, never a daily-live ID. */
  revision?: number;
  operationKey?: string;
  dateISO: string; // YYYY-MM-DD
  part: string;
  rows: WorkoutRow[];
  createdAt: number;
  review?: SessionReview;
  reflection?: string;
  media?: WorkoutMediaRecord[];
  /** True while the workout exists locally but hasn't reached Supabase. */
  pendingSync?: boolean;
  /** How this session was started (#1). Omitted = freestyle. */
  source?: WorkoutSource;
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

async function upsertLocal(session: WorkoutSession, isCurrent = () => true) {
  if (!isCurrent()) return;
  const existing = await listWorkouts();
  if (!isCurrent()) return;
  const next = [session, ...existing.filter((w) => w.id !== session.id)];
  await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
}

/**
 * Local-first save: AsyncStorage always succeeds first, the remote write is
 * best-effort. Returns whether the remote sync succeeded — unsynced sessions
 * are flagged pendingSync and retried by syncPendingWorkouts().
 */
export async function saveWorkout(session: WorkoutSession, options?: { review?: Promise<SessionReview | null>; isCurrent?: () => boolean }): Promise<{ synced: boolean }> {
  const isCurrent = options?.isCurrent ?? (() => true);
  if (!session.operationKey || !session.revision) {
    const prior = (await listWorkouts()).find(item => item.id === session.id);
    const revision = Math.max(Date.now(), (prior?.revision ?? 0) + 1);
    session = { ...session, revision, operationKey: `finalize:${session.id}:${revision}` };
  }
  // 1. Local Write (Upsert) — never wait for optional coaching before recovery.
  await upsertLocal({ ...session, pendingSync: true }, isCurrent);
  if (!isCurrent()) return { synced: false };
  if (options?.review) {
    const review = await options.review.catch(() => null);
    if (!isCurrent()) return { synced: false };
    if (review) {
      session = { ...session, review };
      // Optional enrichment failure must not undo the already-durable performance.
      try { await upsertLocal({ ...session, pendingSync: true }, isCurrent); }
      catch (error) { console.warn('[saveWorkout] Review could not be saved locally.', error); }
    }
  }

  // 2. Remote Sync (Best Effort)
  try {
    if (!isCurrent()) return { synced: false };
    await api.saveWorkout(session);
    if (!isCurrent()) return { synced: false };
    await upsertLocal({ ...session, pendingSync: false }, isCurrent);
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
