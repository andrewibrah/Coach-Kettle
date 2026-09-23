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

/**
 * Same explicit-days-first precedence as isTrainingDay, but returns the full
 * set of training weekdays rather than testing one day. Callers that need
 * "the list of training days" (e.g. scheduling reminders) must use this —
 * not a direct TRAINING_DAY_MAP[daysPerWeek] lookup, which silently ignores
 * a user's explicit schedule (#6 Finding E).
 */
export function resolveTrainingDays(
  daysPerWeek: number | null | undefined,
  explicitDays?: number[] | null,
): number[] {
  if (explicitDays && explicitDays.length > 0) return explicitDays;
  if (!daysPerWeek) return [];
  return TRAINING_DAY_MAP[daysPerWeek] ?? [];
}

/** Suggested weekdays per split at a given days/week, keyed to the templates
 * actually seeded for that split (#7). null = no canonical suggestion for
 * that combination -> UI should treat the schedule as Custom. */
export const SPLIT_DAY_SUGGESTIONS: Record<string, Record<number, number[]>> = {
  ppl_3day:      { 3: [1, 3, 5] },
  pp_sh_l_5day:  { 5: [1, 2, 3, 4, 5] },
  pp_sh_l_6day:  { 6: [1, 2, 3, 4, 5, 6] },
  full_body:     { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5] },
  upper_lower:   { 4: [1, 2, 4, 5] },
};

export function suggestTrainingDays(split: string, daysPerWeek: number): number[] | null {
  return SPLIT_DAY_SUGGESTIONS[split]?.[daysPerWeek] ?? null;
}

/**
 * Decide whether the program-create screen's weekday selector should be
 * persisted to the profile, and what to write (#6 regression: create.tsx
 * used to write `training_days` unconditionally on every submit, which
 * silently overwrote an existing explicit schedule the user never touched
 * on this screen — e.g. picking any split with no canonical suggestion
 * produced an empty selector that then nulled out a real saved schedule).
 *
 * Returns 'no-change' when the selector still matches what's already saved
 * (including both being empty/unset) — the caller must not write in that
 * case, not even a redundant identical write.
 */
export function resolveTrainingDaysUpdate(
  selectedDays: number[],
  currentProfileDays: number[] | null | undefined,
): number[] | null | 'no-change' {
  const next = selectedDays.length ? [...selectedDays].sort((a, b) => a - b) : null;
  const current = currentProfileDays && currentProfileDays.length
    ? [...currentProfileDays].sort((a, b) => a - b)
    : null;
  if (JSON.stringify(next) === JSON.stringify(current)) return 'no-change';
  return next;
}
