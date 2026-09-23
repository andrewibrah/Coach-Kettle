/**
 * Pure program-day resolution (#1), independent of any DB/network call —
 * h_debug's structural guardrail: this is the piece of the program->workout
 * pipeline that must be testable without mocking Supabase.
 *
 * Scope note: this resolves the coarse "what kind of day is today"
 * question (training / rest / already completed / program over). Mapping
 * today's weekday to a SPECIFIC program_day_id within the split (i.e. which
 * of the split's N days is scheduled today) is a sequencing design the
 * deferred pipeline-wiring follow-up still needs to make — see the
 * migration note in 20260904000200_workout_program_source.sql. Do not
 * infer that mapping from this module; it isn't here.
 */

export type ProgramDayStatus =
  | { kind: 'training_day' }
  | { kind: 'rest_day' }
  | { kind: 'completed' }
  | { kind: 'program_complete' };

export interface ResolveProgramDayInput {
  /** Today's local weekday, 0=Sun..6=Sat. Caller resolves this from the
   * device's local date + timezone — this function takes no Date/timezone
   * input itself so it stays deterministic and trivially testable. */
  dow: number;
  /** Effective training weekdays (explicit days take precedence over the
   * days-per-week heuristic — resolve via lib/trainingSchedule.ts's
   * resolveTrainingDays before calling this). */
  trainingWeekdays: number[];
  /** 1-indexed current week. */
  currentWeek: number;
  /** Total weeks in the program. */
  weeksTotal: number;
  /** Whether today's scheduled program day has already been completed.
   * Caller determines this (e.g. by checking a completed-day-ids set
   * against today's resolved program_day_id). */
  isTodayCompleted: boolean;
}

export function resolveProgramDayStatus(input: ResolveProgramDayInput): ProgramDayStatus {
  const { dow, trainingWeekdays, currentWeek, weeksTotal, isTodayCompleted } = input;

  if (currentWeek > weeksTotal) return { kind: 'program_complete' };
  if (!trainingWeekdays.includes(dow)) return { kind: 'rest_day' };
  if (isTodayCompleted) return { kind: 'completed' };
  return { kind: 'training_day' };
}

/**
 * Explicit guard against double-starting a program workout (h_debug): only
 * a genuine training day, with no workout session already in progress, may
 * start one. Kept as its own pure predicate so both the "Start" button's
 * disabled state and a pre-submit check share one answer.
 */
export function canStartProgramDay(status: ProgramDayStatus, hasActiveWorkoutSession: boolean): boolean {
  if (hasActiveWorkoutSession) return false;
  return status.kind === 'training_day';
}
