/**
 * Pure program-day resolution (#1), independent of any DB/network call —
 * h_debug's structural guardrail: this is the piece of the program->workout
 * pipeline that must be testable without mocking Supabase.
 *
 * Scope note: this resolves the coarse "what kind of day is today"
 * question (training / rest / already completed / program over), plus
 * (QA-06) the weekday -> split day_index mapping via
 * resolveScheduledDayIndex — positional only: the Nth sorted training
 * weekday is split day N. That mapping is intentionally refused (returns
 * null) whenever the training-weekday count doesn't match the split's day
 * count, since a stale/edited schedule can drift from the split it was
 * generated for and a wrong positional guess is worse than falling back to
 * a blank start. Full pipeline wiring — a `program_day_id`-driven mapping
 * independent of weekday count, `current_day_index` advancement, and
 * completed-day tracking (isTodayCompleted below is always caller-supplied,
 * commonly `false` today since nothing yet tracks it) — remains the
 * deferred follow-up described in 20260904000200_workout_program_source.sql.
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

/**
 * QA-06: maps today's weekday to the 1-indexed split day (matches
 * ProgramDay.day_index) by position within the sorted training weekdays —
 * e.g. trainingWeekdays [1,3,5] with today=Wed(3) resolves to day_index 2.
 * Kept separate from resolveProgramDayStatus since only a 'training_day'
 * status needs a concrete day_index at all.
 *
 * Refuses to guess (returns null) when trainingWeekdays.length doesn't
 * match splitDayCount (currentWeek.days.length) — e.g. a 3-day training
 * schedule against a 4-day split, or vice versa. The two can drift (the
 * profile's explicit training_days can be edited independently of the
 * program's days_per_week, and the programming function's closest-template
 * fallback can seed a different day count than requested), and a
 * mismatched positional guess would silently start the wrong day's
 * exercises rather than falling back to the safe blank-start flow.
 */
export function resolveScheduledDayIndex(
  dow: number,
  trainingWeekdays: number[],
  splitDayCount: number,
): number | null {
  if (trainingWeekdays.length !== splitDayCount) return null;
  const sorted = [...trainingWeekdays].sort((a, b) => a - b);
  const idx = sorted.indexOf(dow);
  return idx === -1 ? null : idx + 1;
}

/**
 * QA-06: resolves the scheduled program day's exercises into the plain
 * {liftName, targetSets, targetReps} shape `expandTemplateToRows` (via a
 * TemplateItem adapter) already knows how to expand into skeleton
 * WorkoutRows — the same "current verified API" the template/routine start
 * flows use. Returns null when no day matches dayIndex or it has no
 * exercises, so the caller can fall back to the generic blank-start flow
 * instead of starting an empty session.
 */
export interface ScheduledProgramDay {
  day_index: number;
  exercises: { exercise_name: string; target_sets: number; target_reps_low: number | null }[];
}

export interface ScheduledProgramDayItem {
  liftName: string;
  targetSets: number | null;
  targetReps: number | null;
}

export function resolveProgramDayItems(
  days: ScheduledProgramDay[],
  dayIndex: number,
): ScheduledProgramDayItem[] | null {
  const day = days.find((d) => d.day_index === dayIndex);
  if (!day || day.exercises.length === 0) return null;
  return day.exercises.map((ex) => ({
    liftName: ex.exercise_name,
    targetSets: ex.target_sets,
    targetReps: ex.target_reps_low,
  }));
}

/**
 * QA-06: what the Home program-card's "Start" tap should do. Kept as its
 * own pure decision so the screen has one place to ask "what happens if I
 * tap Start right now" instead of re-deriving it from status + guard +
 * day-index separately.
 */
export type HomeStartDecision =
  | { kind: 'start_program_day'; dayIndex: number }
  | { kind: 'start_blank' }
  | { kind: 'blocked' };

export interface ResolveHomeStartDecisionInput {
  hasProgram: boolean;
  status: ProgramDayStatus;
  hasActiveWorkoutSession: boolean;
  dayIndex: number | null;
}

export function resolveHomeStartDecision(input: ResolveHomeStartDecisionInput): HomeStartDecision {
  if (input.hasActiveWorkoutSession) return { kind: 'blocked' };
  if (!input.hasProgram) return { kind: 'start_blank' };
  if (input.status.kind !== 'training_day') return { kind: 'start_blank' };
  if (input.dayIndex == null) return { kind: 'start_blank' };
  return { kind: 'start_program_day', dayIndex: input.dayIndex };
}
