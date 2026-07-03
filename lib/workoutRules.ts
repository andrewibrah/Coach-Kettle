import { LogRow } from "@/types/workout";

export function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/**
 * Local-calendar date as YYYY-MM-DD.
 * IMPORTANT: intentionally local time, not UTC. A workout logged at 8pm EST
 * belongs to the user's "today", not tomorrow's UTC date. All client-side
 * day bucketing (drafts, sessions, nutrition, coach) uses this.
 */
export function todayISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function makeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getLastExerciseFromRows(rows: LogRow[]): string | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.isRest) continue; // rest markers aren't exercises
    const ex = rows[i]?.exercise?.trim();
    if (ex) return ex;
  }
  return undefined;
}

/** Build a rest-timer marker row to insert between sets. */
export function makeRestRow(durationSec: number): LogRow {
  return {
    id: makeId(),
    exercise: "Rest",
    set: 0,
    weightLbs: "",
    reps: "",
    notes: `Rest timer started: ${durationSec} seconds`,
    timestamp: Date.now(),
    status: "committed",
    isRest: true,
  };
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

export function normalizeExercise(value: string): string {
  return value.trim().toLowerCase();
}

export function resequenceSets(list: LogRow[]): LogRow[] {
  const counters: Record<string, number> = {};
  return list.map((row) => {
    if (row.isRest) return row; // rest markers keep set 0 and don't count
    const norm = normalizeExercise(row.exercise);
    const nextSet = (counters[norm] || 0) + 1;
    counters[norm] = nextSet;
    return { ...row, set: nextSet };
  });
}

export interface TemplateItem {
  lift_name: string;
  target_sets: number | null;
  target_reps: number | null;
  target_weight?: number | null;
}

/**
 * Expand workout template items into skeleton LogRows.
 * Each template item with N sets becomes N LogRow entries,
 * with weight empty (user fills in) and reps pre-filled.
 */
export function expandTemplateToRows(items: TemplateItem[]): LogRow[] {
  const rows: LogRow[] = [];

  for (const item of items) {
    const setCount = item.target_sets || 1;
    const reps = item.target_reps ? String(item.target_reps) : "";

    for (let setNum = 1; setNum <= setCount; setNum++) {
      rows.push({
        id: makeId(),
        exercise: item.lift_name,
        set: setNum,
        weightLbs: "", // Empty - user fills in during workout
        reps: reps,
        notes: "",
        timestamp: Date.now(),
        status: "committed",
      });
    }
  }

  return rows;
}
