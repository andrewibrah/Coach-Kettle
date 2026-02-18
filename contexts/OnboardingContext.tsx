import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import {
  OnboardingDraft,
  getOnboardingDraft,
  updateOnboardingDraft,
  clearOnboardingDraft,
} from '@/lib/onboardingDraft';
import {
  completeOnboarding as completeOnboardingApi,
  batchSaveOnboarding,
  BatchOnboardingData,
} from '@/lib/profile';
import { invalidateProfileCache } from '@/lib/api';

interface OnboardingContextType {
  draft: OnboardingDraft;
  draftLoading: boolean;
  updateDraft: (updates: Partial<OnboardingDraft>) => Promise<void>;
  batchSaveAndComplete: () => Promise<{ success: boolean; error?: string }>;
  skipOnboarding: () => Promise<{ success: boolean; error?: string }>;
}

const OnboardingContext = createContext<OnboardingContextType>({
  draft: {},
  draftLoading: true,
  updateDraft: async () => {},
  batchSaveAndComplete: async () => ({ success: false }),
  skipOnboarding: async () => ({ success: false }),
});

export const useOnboarding = () => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { refreshProfile } = useProfile();
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [draftLoading, setDraftLoading] = useState(true);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      const stored = await getOnboardingDraft();
      if (stored) {
        setDraft(stored);
      }
      setDraftLoading(false);
    };
    loadDraft();
  }, []);

  // Update draft (local + AsyncStorage)
  const updateDraft = useCallback(async (updates: Partial<OnboardingDraft>) => {
    const updated = await updateOnboardingDraft(updates);
    setDraft(updated);
  }, []);

  // Skip onboarding entirely - just marks as complete with null values
  const skipOnboarding = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session?.user?.id) {
      return { success: false, error: 'No session' };
    }

    try {
      // Just complete onboarding without saving any data
      const success = await completeOnboardingApi(session.user.id);
      if (!success) {
        return { success: false, error: 'Failed to complete onboarding' };
      }

      // Clear any draft data
      await clearOnboardingDraft();

      // Refresh profile to get updated state
      await refreshProfile();
      invalidateProfileCache();

      return { success: true };
    } catch (error) {
      console.error('[OnboardingContext] Error skipping onboarding:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }, [session?.user?.id, refreshProfile]);

  // Batch save all draft data and complete onboarding (single API call)
  const batchSaveAndComplete = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session?.user?.id) {
      return { success: false, error: 'No session' };
    }

    const userId = session.user.id;

    try {
      // Build the batch data from draft
      const batchData: BatchOnboardingData = {};

      // Profile data
      const profileData: BatchOnboardingData['profile'] = {};
      if (draft.height_value !== undefined) profileData.height_value = draft.height_value;
      if (draft.height_unit !== undefined) profileData.height_unit = draft.height_unit;
      if (draft.dob !== undefined) profileData.dob = draft.dob;
      if (draft.current_weight !== undefined) profileData.current_weight = draft.current_weight;
      if (draft.goal_weight !== undefined) profileData.goal_weight = draft.goal_weight;
      if (draft.weight_unit !== undefined) profileData.weight_unit = draft.weight_unit;
      if (draft.focus !== undefined) profileData.focus = draft.focus;
      if (draft.focus_other !== undefined) profileData.focus_other = draft.focus_other;

      if (Object.keys(profileData).length > 0) {
        batchData.profile = profileData;
      }

      // Tracked lifts
      if (draft.tracked_lifts && draft.tracked_lifts.length > 0) {
        batchData.tracked_lifts = draft.tracked_lifts;
      }

      // PR values
      if (draft.pr_values && draft.pr_values.length > 0) {
        batchData.pr_values = draft.pr_values;
      }

      // Workout templates
      if (draft.workout_templates && draft.workout_templates.length > 0) {
        batchData.workout_templates = draft.workout_templates;
      }

      // Single API call to save everything
      const result = await batchSaveOnboarding(userId, batchData);

      if (!result.ok) {
        return { success: false, error: result.error || 'Failed to save onboarding data' };
      }

      // Clear draft after successful save
      await clearOnboardingDraft();
      setDraft({});

      // Refresh profile to get updated state
      await refreshProfile();
      invalidateProfileCache();

      return { success: true };
    } catch (error) {
      console.error('[OnboardingContext] Error in batch save:', error);
      return { success: false, error: 'An unexpected error occurred while saving' };
    }
  }, [session?.user?.id, draft, refreshProfile]);

  return (
    <OnboardingContext.Provider
      value={{
        draft,
        draftLoading,
        updateDraft,
        batchSaveAndComplete,
        skipOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
