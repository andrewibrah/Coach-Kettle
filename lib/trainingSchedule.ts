// Shared training-day schedule used across client + edge functions.
// 0 = Sunday, 1 = Monday, ... 6 = Saturday
// training_days_per_week (1..7) maps to which days are training days.

export const TRAINING_DAY_MAP: Record<number, number[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Returns true if the given local day-of-week (0=Sun…6=Sat) is a training day.
 * Explicit user-selected days (profiles.training_days) take priority; the
 * days-per-week heuristic map is only a fallback for users who never chose.
 */
export function isTrainingDay(
  dow: number,
  daysPerWeek: number | null | undefined,
  explicitDays?: number[] | null,
): boolean {
  if (explicitDays && explicitDays.length > 0) return explicitDays.includes(dow);
  if (!daysPerWeek) return false;
  return (TRAINING_DAY_MAP[daysPerWeek] ?? []).includes(dow);
}
