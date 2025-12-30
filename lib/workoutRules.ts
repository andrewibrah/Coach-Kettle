import { LogRow } from "@/types/workout";

export function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getLastExerciseFromRows(rows: LogRow[]): string | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const ex = rows[i]?.exercise?.trim();
    if (ex) return ex;
  }
  return undefined;
}

export function nextSetNumberForExercise(rows: LogRow[], exercise: string): number {
  const target = exercise.trim().toLowerCase();
  let maxSet = 0;
  for (const row of rows) {
    if (!row?.exercise) continue;
    const normalized = row.exercise.trim().toLowerCase();
    if (normalized === target) {
      const setVal = Number.isFinite(row.set) ? row.set : 0;
      const base = Math.floor(setVal);
      if (base > maxSet) maxSet = base;
    }
  }
  return maxSet + 1;
}
