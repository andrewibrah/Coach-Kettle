import AsyncStorage from "@react-native-async-storage/async-storage";

export type WorkoutRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp?: number;
};

export type WorkoutSession = {
  id: string;
  dateISO: string; // YYYY-MM-DD
  part: string;
  rows: WorkoutRow[];
  createdAt: number;
};

const KEY = "workout_history_v1";

export async function listWorkouts(): Promise<WorkoutSession[]> {
  const raw = await AsyncStorage.getItem(KEY);
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
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function deleteWorkout(id: string) {
  const existing = await listWorkouts();
  const next = existing.filter((w) => w.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function clearWorkouts() {
  await AsyncStorage.removeItem(KEY);
}
