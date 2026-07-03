// Shared canonical lift-name resolution.
//
// Users type shorthand in the gym ("bench 185 8") while tracked lifts hold
// formal names ("Bench Press"). PR detection requires the two to unify —
// this resolves a typed exercise to its canonical tracked lift name,
// conservatively (never guesses when ambiguous).
//
// Used by: log-set (live sets) and history (final-save reconciliation) so
// workout_log stores one canonical name per tracked lift.

const ALIASES: Record<string, string[]> = {
  "bench press": ["bench", "flat bench", "bb bench", "barbell bench", "bench presses"],
  "overhead press": ["ohp", "shoulder press", "military press", "overhead presses"],
  "deadlift": ["deads", "dl", "deadlifts", "conventional deadlift"],
  "squat": ["squats", "back squat", "barbell squat"],
  "barbell row": ["bb row", "bent over row", "bent-over row", "barbell rows"],
};

export function normalizeLiftName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Resolve a typed exercise name to a canonical tracked lift name.
 * Match order (all comparisons on normalized strings):
 *   1. exact equality
 *   2. known alias of a tracked lift
 *   3. typed name is a word-prefix of exactly ONE tracked lift
 * Returns the tracked lift's original (canonical) name, or null when there
 * is no safe, unambiguous match.
 */
export function resolveTrackedLift(typed: string, trackedNames: string[]): string | null {
  const t = normalizeLiftName(typed);
  if (!t) return null;

  // 1. exact
  for (const name of trackedNames) {
    if (normalizeLiftName(name) === t) return name;
  }

  // 2. aliases
  for (const name of trackedNames) {
    const aliases = ALIASES[normalizeLiftName(name)];
    if (aliases && aliases.includes(t)) return name;
  }

  // 3. unambiguous word-prefix ("bench" → "Bench Press")
  const prefixMatches = trackedNames.filter((name) =>
    normalizeLiftName(name).startsWith(t + " ")
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

/** Epley e1RM — must stay in sync with public.epley_1rm in the DB. */
export function epley1rm(weightLbs: number, reps: number): number {
  if (reps <= 0) return weightLbs;
  return Math.round(weightLbs * (1 + reps / 30) * 10) / 10;
}
