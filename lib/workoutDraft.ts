import AsyncStorage from '@react-native-async-storage/async-storage';
import { type LogRow } from '@/types/workout';
import type { CoachingAnswer } from '@/types/coachingAnswers';

const WORKOUT_DRAFT_KEY = 'workout_draft_v1';

// One process-local queue for every operation on the existing cache key.
// A failed operation must not poison subsequent cleanup/recovery.
let draftOperations: Promise<unknown> = Promise.resolve();
let draftGeneration = 0;
/** Auth transitions fence queued callbacks without deleting recovery evidence. */
export function fenceWorkoutDraft(): void { draftGeneration += 1; }
/** Capture at scheduling time; clear invalidates callbacks from that generation. */
export function getWorkoutDraftGeneration(): number { return draftGeneration; }
function enqueueDraftOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = draftOperations.then(operation);
  draftOperations = result.catch(() => undefined);
  return result;
}

export interface WorkoutDraft {
  /** Absent in legacy v1: readable evidence, never inferred ownership. */
  ownerId?: string;
  workoutId: string;
  dateISO: string;
  bodyParts: string[];
  createdAt: number;
  rows: LogRow[];
  updatedAt: number;
  /** Structured coaching answers (A1, flag-gated): append-only log, saved as-is. */
  coachingAnswers?: CoachingAnswer[];
}

type OptionalLogMetadata = Omit<LogRow, 'id' | 'exercise' | 'set' | 'weightLbs' | 'reps' | 'notes' | 'timestamp'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Validate known fields, not unknown additive fields: v1 legacy drafts may omit
// metadata, and future drafts may carry extra evidence we must not strip.
// The mapped type requires a validator when LogRow gains optional metadata.
const metadataValidators: { [K in keyof OptionalLogMetadata]-?: (value: unknown) => boolean } = {
  status: value => value === 'syncing' || value === 'committed',
  pendingInput: value => typeof value === 'string',
  performance: value => value === 'planned' || value === 'performed',
  plannedTarget: value => isRecord(value) && typeof value.reps === 'string' &&
    (!('weightLbs' in value) || typeof value.weightLbs === 'string'),
  setKind: value => typeof value === 'string' && ['work', 'warmup', 'backoff', 'drop', 'superset', 'cardio'].includes(value),
  isRest: value => typeof value === 'boolean',
  isCardio: value => typeof value === 'boolean',
  durationMins: Number.isFinite,
  distance: Number.isFinite,
  distanceUnit: value => value === 'miles' || value === 'km' || value === 'meters',
  heartRate: Number.isFinite,
  calories: Number.isFinite,
  level: Number.isFinite,
};

function isDraftLogRow(value: unknown): value is LogRow {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.exercise === 'string' && typeof value.weightLbs === 'string' &&
    typeof value.reps === 'string' && typeof value.notes === 'string' &&
    Number.isFinite(value.set) && Number.isFinite(value.timestamp) &&
    Object.entries(metadataValidators).every(([field, validate]) => !(field in value) || validate(value[field]));
}

// Shape only (policy checks happen at use). Like other known fields, one corrupt entry
// rejects the whole read and the stored bytes are kept.
function isDraftCoachingAnswer(value: unknown): value is CoachingAnswer {
  const text = (v: unknown) => typeof v === 'string' && v.length > 0;
  return isRecord(value) && text(value.answerId) && text(value.sessionId) && text(value.exerciseKey) && text(value.questionId) &&
    (!('rowId' in value) || text(value.rowId)) && (!('rowRevision' in value) || Number.isSafeInteger(value.rowRevision)) &&
    Number.isFinite(value.capturedAt) && value.provenance === 'user' &&
    (value.state === 'answered' ? typeof value.value === 'string' || Number.isFinite(value.value)
      : (value.state === 'skipped' || value.state === 'unknown') && !('value' in value));
}

/** Read the current in-progress workout draft (if any). */
export async function getWorkoutDraft(): Promise<WorkoutDraft | null> {
  const generation = draftGeneration;
  try {
    const stored = await enqueueDraftOperation(() => AsyncStorage.getItem(WORKOUT_DRAFT_KEY));
    if (generation !== draftGeneration) return null;
    if (stored) {
      const draft = JSON.parse(stored);
      if (!draft || ('ownerId' in draft && (typeof draft.ownerId !== 'string' || !draft.ownerId)) || typeof draft.workoutId !== 'string' || !draft.workoutId ||
          typeof draft.dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateISO) ||
          !Number.isFinite(draft.createdAt) || !Number.isFinite(draft.updatedAt) ||
          !Array.isArray(draft.bodyParts) || !draft.bodyParts.every((part: unknown) => typeof part === 'string') ||
          !Array.isArray(draft.rows) || !draft.rows.every(isDraftLogRow) ||
          ('coachingAnswers' in draft && (!Array.isArray(draft.coachingAnswers) || !draft.coachingAnswers.every(isDraftCoachingAnswer)))) {
        throw new Error('Invalid workout draft');
      }
      return draft as WorkoutDraft;
    }
  } catch {
    throw new Error('Workout draft could not be read. Stored recovery data has not been removed.');
  }
  return null;
}

/** Persist the current workout state as a draft. */
export async function saveWorkoutDraft(draft: WorkoutDraft, generation = draftGeneration): Promise<void> {
  if (generation !== draftGeneration) return;
  try {
    const snapshot = JSON.stringify(draft);
    await enqueueDraftOperation(async () => {
      if (generation !== draftGeneration) return;
      const stored = await AsyncStorage.getItem(WORKOUT_DRAFT_KEY);
      if (generation !== draftGeneration) return;
      const previous = stored ? JSON.parse(stored) : null;
      if (stored && previous.ownerId !== draft.ownerId) throw new Error('Recovery owner mismatch');
      // A rows save never drops the same session's append-only answers log (kept as-is).
      const carry = isRecord(previous) && previous.workoutId === draft.workoutId && 'coachingAnswers' in previous && !('coachingAnswers' in draft);
      await AsyncStorage.setItem(WORKOUT_DRAFT_KEY, carry ? JSON.stringify({ ...JSON.parse(snapshot), coachingAnswers: previous.coachingAnswers }) : snapshot);
    });
  } catch {
    throw new Error('Workout draft could not be saved.');
  }
}

/** Append one structured coaching answer to this session's draft log (A1). Refuses, without
 * writing, an invalid answer, a corrupt stored log or another owner's/session's draft. */
export async function appendWorkoutDraftAnswer(ownerId: string, workoutId: string, answer: CoachingAnswer, generation = draftGeneration): Promise<void> {
  if (generation !== draftGeneration) return;
  try {
    if (!isDraftCoachingAnswer(answer)) throw new Error('Invalid answer');
    await enqueueDraftOperation(async () => {
      if (generation !== draftGeneration) return;
      const stored = await AsyncStorage.getItem(WORKOUT_DRAFT_KEY);
      if (generation !== draftGeneration) return;
      const draft = stored ? JSON.parse(stored) : null;
      if (!isRecord(draft) || draft.ownerId !== ownerId || draft.workoutId !== workoutId) throw new Error('No matching draft');
      const log = draft.coachingAnswers ?? [];
      if (!Array.isArray(log) || !log.every(isDraftCoachingAnswer)) throw new Error('Corrupt answers log');
      await AsyncStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify({ ...draft, coachingAnswers: [...log, answer] }));
    });
  } catch {
    throw new Error('Coaching answer could not be saved.');
  }
}

/** Destructive only for explicit discard/durable End; auth must use fence. */
export async function clearWorkoutDraft(ownerId?: string, generation = draftGeneration): Promise<void> {
  if (generation !== draftGeneration) throw new Error('Workout draft ownership changed.');
  draftGeneration += 1;
  const clearGeneration = draftGeneration;
  try {
    await enqueueDraftOperation(async () => {
      if (clearGeneration !== draftGeneration) throw new Error('Workout draft ownership changed.');
      const stored = await AsyncStorage.getItem(WORKOUT_DRAFT_KEY);
      if (clearGeneration !== draftGeneration || (stored && JSON.parse(stored).ownerId !== ownerId)) throw new Error('Workout draft ownership changed.');
      await AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
    });
  } catch {
    throw new Error('Workout draft could not be cleared.');
  }
}
