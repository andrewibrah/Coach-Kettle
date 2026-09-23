import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_DRAFT_PREFIX = 'coach-kettle:onboarding-draft:';
const queues = new Map<string, Promise<void>>();

function draftKey(ownerId: string): string {
  if (!ownerId?.trim()) throw new Error('Onboarding draft requires an owner user ID');
  return `${ONBOARDING_DRAFT_PREFIX}${encodeURIComponent(ownerId)}`;
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => {}, () => {});
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return result;
}

async function readDraft(key: string): Promise<OnboardingDraft | null> {
  const stored = await AsyncStorage.getItem(key);
  return stored === null ? null : JSON.parse(stored) as OnboardingDraft;
}

export interface OnboardingDraft {
  // Profile data
  height_value?: number | null;
  height_unit?: 'cm' | 'in' | null;
  dob?: string | null;
  current_weight?: number | null;
  goal_weight?: number | null;
  weight_unit?: 'lb' | 'kg' | null;
  focus?: 'strength' | 'lean_muscle' | 'fat_loss' | 'other' | null;
  focus_other?: string | null;

  // PR tracking data
  tracked_lifts?: string[];
  pr_values?: {
    lift_name: string;
    weight_lbs: number;
    reps: number;
  }[];

  // Workout templates
  workout_templates?: {
    name: string;
    lifts: {
      name: string;
      sets: number;
      reps: number;
    }[];
  }[];

  // Track which step user was on (for resume)
  current_step?: number;

  // Idempotency key for complete_onboarding_atomic: created on the first attempt,
  // reused for every retry/restart, and cleared only with the draft after an ack.
  completion_request_id?: string;
}

// The legacy global onboarding_draft is quarantined: never read, adopt, or delete it.
export async function getOnboardingDraft(ownerId: string): Promise<OnboardingDraft | null> {
  const key = draftKey(ownerId);
  return enqueue(key, () => readDraft(key));
}

export async function saveOnboardingDraft(ownerId: string, draft: OnboardingDraft): Promise<void> {
  const key = draftKey(ownerId);
  const serialized = JSON.stringify(draft);
  return enqueue(key, () => AsyncStorage.setItem(key, serialized));
}

export async function updateOnboardingDraft(ownerId: string, updates: Partial<OnboardingDraft>): Promise<OnboardingDraft> {
  const key = draftKey(ownerId);
  const snapshot = JSON.parse(JSON.stringify(updates)) as Partial<OnboardingDraft>;
  return enqueue(key, async () => {
    const updated = { ...await readDraft(key), ...snapshot };
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  });
}

export async function clearOnboardingDraft(ownerId: string): Promise<void> {
  return enqueue(draftKey(ownerId), () => AsyncStorage.removeItem(draftKey(ownerId)));
}
