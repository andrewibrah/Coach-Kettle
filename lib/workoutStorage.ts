// Use SecureStore which works with both Expo Go and development builds
import * as SecureStore from "expo-secure-store";

export type WorkoutRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  loggedAt?: number; // timestamp when this set was logged
};

export type WorkoutSession = {
  id: string;
  dateISO: string; // YYYY-MM-DD
  part: string;
  rows: WorkoutRow[];
  createdAt: number;
};

const KEY = "workout_history_v1";

// Fallback to in-memory storage if SecureStore fails (for development)
let memoryStorage: WorkoutSession[] | null = null;

async function getStorage(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch (error) {
    // If SecureStore fails, use in-memory fallback
    console.warn("SecureStore not available, using in-memory storage:", error);
    return memoryStorage ? JSON.stringify(memoryStorage) : null;
  }
}

async function setStorage(value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, value);
    // Also update memory cache
    memoryStorage = JSON.parse(value);
  } catch (error) {
    // If SecureStore fails, use in-memory fallback
    console.warn("SecureStore not available, using in-memory storage:", error);
    memoryStorage = JSON.parse(value);
  }
}

async function removeStorage(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
    memoryStorage = null;
  } catch (error) {
    console.warn("SecureStore not available, clearing in-memory storage:", error);
    memoryStorage = null;
  }
}

export async function listWorkouts(): Promise<WorkoutSession[]> {
  const raw = await getStorage();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveWorkout(session: WorkoutSession) {
  const existing = await listWorkouts();
  const next = [session, ...existing];
  await setStorage(JSON.stringify(next));
}

export async function deleteWorkout(id: string) {
  const existing = await listWorkouts();
  const next = existing.filter((w) => w.id !== id);
  await setStorage(JSON.stringify(next));
}

export async function clearWorkouts() {
  await removeStorage();
}
