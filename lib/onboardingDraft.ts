import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_DRAFT_KEY = 'onboarding_draft';

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
  pr_values?: Array<{
    lift_name: string;
    weight_lbs: number;
    reps: number;
  }>;

  // Workout templates
  workout_templates?: Array<{
    name: string;
    lifts: Array<{
      name: string;
      sets: number;
      reps: number;
    }>;
  }>;

  // Track which step user was on (for resume)
  current_step?: number;
}

// Get the current draft
export async function getOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const stored = await AsyncStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (stored) {
      return JSON.parse(stored) as OnboardingDraft;
    }
  } catch (e) {
    console.warn('[OnboardingDraft] Failed to get draft:', e);
  }
  return null;
}

// Save/update the draft
export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('[OnboardingDraft] Failed to save draft:', e);
  }
}

// Update specific fields in the draft (merges with existing)
export async function updateOnboardingDraft(updates: Partial<OnboardingDraft>): Promise<OnboardingDraft> {
  const current = await getOnboardingDraft();
  const updated = { ...current, ...updates };
  await saveOnboardingDraft(updated);
  return updated;
}

// Clear the draft (after successful batch save)
export async function clearOnboardingDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
    // Also clear the legacy PR lifts storage key
    await AsyncStorage.removeItem('onboarding_pr_lifts');
  } catch (e) {
    console.warn('[OnboardingDraft] Failed to clear draft:', e);
  }
}
