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

// Every read-modify-write of the history key runs through this queue so two
// in-process writers cannot interleave and drop each other's sessions. This is
// in-process serialization only; it makes no cross-process atomicity claim.
// fn must not call another history-queued function (that would deadlock).
let historyQueue: Promise<unknown> = Promise.resolve();
// Bumped by clearWorkouts (sign-out). Writes requested before a clear are
// dropped so a previous user's history cannot reappear for the next user.
let historyGeneration = 0;
type HistoryWrite = (sessions: WorkoutSession[]) => Promise<void>;
function withHistory<T>(fn: (existing: WorkoutSession[], write: HistoryWrite) => Promise<T>): Promise<T> {
  const generation = historyGeneration;
  const write = async (sessions: WorkoutSession[]) => {
    if (generation !== historyGeneration) return;
    await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(sessions));
  };
  const run = historyQueue.then(async () => fn(await listWorkouts(), write));
  historyQueue = run.catch(() => undefined);
  return run;
}

/** Patch the stored session only if it still holds `revision`; never re-inserts a deleted one. */
function patchRevision(id: string, revision: number | undefined, patch: Partial<Pick<WorkoutSession, 'review' | 'pendingSync'>>, isCurrent = () => true) {
  return withHistory(async (existing, write) => {
    if (!isCurrent()) return false;
    const index = existing.findIndex((w) => w.id === id && w.revision === revision);
    if (index < 0) return false;
    const next = [...existing];
    next[index] = { ...next[index], ...patch };
    await write(next);
    return true;
  });
}

/**
 * Local-first save: AsyncStorage always succeeds first, the remote write is
 * best-effort. Returns whether the remote sync succeeded — unsynced sessions
 * are flagged pendingSync and retried by syncPendingWorkouts().
 */
export async function saveWorkout(session: WorkoutSession, options?: { review?: Promise<SessionReview | null>; isCurrent?: () => boolean }): Promise<{ synced: boolean }> {
  const isCurrent = options?.isCurrent ?? (() => true);
  // 1. Local Write (Upsert) — never wait for optional coaching before recovery.
  // Identity is assigned inside the same queued step so concurrent saves of one
  // workout cannot read the same prior revision and collide.
  session = await withHistory(async (existing, write) => {
    let next = session;
    if (!next.operationKey || !next.revision) {
      const prior = existing.find(item => item.id === next.id);
      const revision = Math.max(Date.now(), (prior?.revision ?? 0) + 1);
      next = { ...next, revision, operationKey: `finalize:${next.id}:${revision}` };
    }
    if (isCurrent()) await write([{ ...next, pendingSync: true }, ...existing.filter((w) => w.id !== next.id)]);
    return next;
  });
  if (!isCurrent()) return { synced: false };
  if (options?.review) {
    const review = await options.review.catch(() => null);
    if (!isCurrent()) return { synced: false };
    if (review) {
      session = { ...session, review };
      // Optional enrichment failure must not undo the already-durable performance.
      try { await patchRevision(session.id, session.revision, { review }, isCurrent); }
      catch (error) { console.warn('[saveWorkout] Review could not be saved locally.', error); }
    }
  }

  // 2. Remote Sync (Best Effort)
  try {
    if (!isCurrent()) return { synced: false };
    await api.saveWorkout(session);
    if (!isCurrent()) return { synced: false };
    // The ack clears only the revision it acknowledges; a newer local save stays pending.
    await patchRevision(session.id, session.revision, { pendingSync: false }, isCurrent);
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
      await patchRevision(session.id, session.revision, { pendingSync: false });
      synced += 1;
    } catch {
      // Still offline — retry on next call.
    }
  }
  return synced;
}

export function deleteWorkout(id: string) {
  return withHistory((existing, write) => write(existing.filter((w) => w.id !== id)));
}

/**
 * Refresh the offline cache from server history. Server is truth for synced
 * sessions; a still-pending local session (server GET carries no revision) wins
 * over the server copy so an unacknowledged edit is never dropped.
 */
export function mergeServerHistory(server: WorkoutSession[]): Promise<WorkoutSession[]> {
  return withHistory(async (local, write) => {
    const pending = local.filter((w) => w.pendingSync);
    const pendingIds = new Set(pending.map((w) => w.id));
    const merged = [...server.filter((w) => !pendingIds.has(w.id)), ...pending];
    await write(merged);
    return merged;
  });
}

export function clearWorkouts() {
  historyGeneration += 1;
  const run = historyQueue.then(() => AsyncStorage.removeItem(WORKOUT_HISTORY_KEY));
  historyQueue = run.catch(() => undefined);
  return run;
}
