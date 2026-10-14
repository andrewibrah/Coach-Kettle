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
  /** Server permanently rejected this revision (403/409 code); kept locally, not retried. */
  syncBlocked?: string;
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
function patchRevision(id: string, revision: number | undefined, patch: Partial<Pick<WorkoutSession, 'review' | 'pendingSync' | 'syncBlocked'>>, isCurrent = () => true) {
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
export async function saveWorkout(session: WorkoutSession, options?: { review?: Promise<SessionReview | null>; isCurrent?: () => boolean; /** Refuse to send under a different signed-in account. */ owner?: string }): Promise<{ synced: boolean }> {
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
    await api.saveWorkout(session, options?.owner);
    if (!isCurrent()) return { synced: false };
    // The ack clears only the revision it acknowledges; a newer local save stays pending.
    await patchRevision(session.id, session.revision, { pendingSync: false }, isCurrent);
    return { synced: true };
  } catch (e) {
    console.warn("[saveWorkout] Supabase sync failed, saved locally only.", e);
    return { synced: false };
  }
}

// Stable codes from supabase/functions/_shared/operationErrors.ts.
const TERMINAL_CODES = new Set(['forbidden', 'session_finalized', 'session_deleted', 'operation_conflict', 'stale_revision', 'legacy_session', 'invalid_operation']);
/**
 * The stable code of a deterministic server rejection thrown by api.saveWorkout /
 * api.deleteWorkout ("Failed to ... workout: <status> - <body>"), or null when retrying can help.
 * 403/409 count only with a known stable code. A 400 counts only with the Edge's JSON error body
 * (pre-validation of this exact payload, e.g. a pre-P4 row without an id). Gateway pages,
 * unknown codes, 401, 5xx and network failures stay retryable.
 */
export function terminalRejectionCode(error: unknown): string | null {
  const match = /^Failed to (?:save|delete) workout: (400|403|409) - ([\s\S]*)$/.exec(String((error as { message?: unknown } | null)?.message ?? ''));
  if (!match) return null;
  let body: { code?: unknown; error?: unknown } | null = null;
  try { body = JSON.parse(match[2]); } catch { return null; }
  if (match[1] === '400') return typeof body?.error === 'string' ? 'invalid_session' : null;
  return typeof body?.code === 'string' && TERMINAL_CODES.has(body.code) ? body.code : null;
}

/** User-facing History delete failure: terminal rejections are explained, not "try again". */
export function deleteFailureMessage(error: unknown): string {
  const code = terminalRejectionCode(error);
  if (code === 'legacy_session') return 'This workout was saved before sync updates and can no longer be changed or deleted.';
  if (code) return 'This workout can no longer be deleted.';
  return 'Failed to delete workout. Please try again.';
}

/**
 * Retry any locally-saved workouts that never reached Supabase, as `owner` only. A sign-out
 * (clearWorkouts) during the loop stops it, and each request is owner-bound, so the remaining
 * workouts can never be sent under the next account's token.
 */
export async function syncPendingWorkouts(owner: string): Promise<number> {
  if (!owner) return 0;
  const generation = historyGeneration;
  // Pre-P4 pending sessions carry no transport identity. Assign one inside the queued,
  // generation-fenced write so it is durable before any request and reused on every retry.
  const pending = await withHistory(async (existing, write) => {
    let assigned = false;
    const next = existing.map((w) => {
      if (!w.pendingSync || w.syncBlocked || (w.operationKey && w.revision)) return w;
      assigned = true;
      const revision = Math.max(Date.now(), (w.revision ?? 0) + 1);
      return { ...w, revision, operationKey: `finalize:${w.id}:${revision}` };
    });
    if (assigned) await write(next);
    return next.filter((w) => w.pendingSync && !w.syncBlocked);
  });
  let synced = 0;
  for (const session of pending) {
    if (generation !== historyGeneration) break;
    try {
      const { pendingSync: _p, media: _m, syncBlocked: _b, ...payload } = session;
      await api.saveWorkout(payload, owner);
      await patchRevision(session.id, session.revision, { pendingSync: false });
      synced += 1;
    } catch (error) {
      // A deterministic rejection (e.g. a legacy server ID) can never succeed: keep the local
      // copy pending (so a server refresh cannot replace it) and stop retrying it.
      const code = terminalRejectionCode(error);
      if (code === 'session_deleted') {
        // The user deleted this workout (deleted IDs never return): drop the stale local copy.
        await withHistory((existing, write) => write(existing.filter((w) => !(w.id === session.id && w.revision === session.revision))));
      } else if (code) {
        await patchRevision(session.id, session.revision, { syncBlocked: code });
      }
      // Otherwise still offline — retry on next call with the same identity.
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
