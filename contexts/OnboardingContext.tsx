import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/contexts/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import {
  OnboardingDraft,
  getOnboardingDraft,
  updateOnboardingDraft,
  clearOnboardingDraft,
} from '@/lib/onboardingDraft';
import {
  completeOnboarding as completeOnboardingApi,
  buildOnboardingCompletionPayload,
  completeOnboardingAtomic,
  fetchProfile,
} from '@/lib/profile';
import { invalidateProfileCache } from '@/lib/api';

interface OnboardingContextType {
  draft: OnboardingDraft;
  draftLoading: boolean;
  draftSaving: boolean;
  updateDraft: (updates: Partial<OnboardingDraft>) => Promise<void>;
  batchSaveAndComplete: () => Promise<{ success: boolean; error?: string }>;
  skipOnboarding: () => Promise<{ success: boolean; error?: string }>;
}

const OnboardingContext = createContext<OnboardingContextType>({
  draft: {},
  draftLoading: true,
  draftSaving: false,
  updateDraft: async () => {},
  batchSaveAndComplete: async () => ({ success: false }),
  skipOnboarding: async () => ({ success: false }),
});

export const useOnboarding = () => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user?.id;

  return (
    <OnboardingOwnerProvider key={ownerId ?? '__signed_out__'} ownerId={ownerId}>
      {children}
    </OnboardingOwnerProvider>
  );
}

function OnboardingOwnerProvider({
  children,
  ownerId,
}: {
  children: React.ReactNode;
  ownerId: string | undefined;
}) {
  const { refreshProfile } = useProfile();
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftSaving, setDraftSaving] = useState(false);
  const currentDraft = useRef<OnboardingDraft>({});
  const pendingSaves = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const completion = useRef<Promise<{ success: boolean; error?: string }> | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDraft = async () => {
      try {
        const stored = ownerId ? await getOnboardingDraft(ownerId) : null;
        if (active) {
          currentDraft.current = revision.current > 0
            ? { ...stored, ...currentDraft.current }
            : stored ?? {};
          setDraft(currentDraft.current);
        }
      } catch (error) {
        console.warn('[OnboardingContext] Failed to load draft:', error);
      } finally {
        if (active) setDraftLoading(false);
      }
    };
    void loadDraft();
    return () => { active = false; };
  }, [ownerId]);

  const updateDraft = useCallback(async (updates: Partial<OnboardingDraft>) => {
    if (!ownerId || !mounted.current) throw new Error('No current onboarding owner');
    currentDraft.current = { ...currentDraft.current, ...updates };
    setDraft(currentDraft.current);
    revision.current++;
    pendingSaves.current++;
    setDraftSaving(true);
    try {
      // Persist all local input, including input retained after a previous failed save.
      await updateOnboardingDraft(ownerId, currentDraft.current);
    } finally {
      pendingSaves.current--;
      if (mounted.current) setDraftSaving(pendingSaves.current > 0);
    }
  }, [ownerId]);

  // Skip onboarding entirely - just marks as complete with null values
  const skipOnboarding = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!ownerId || !mounted.current) {
      return { success: false, error: 'No session' };
    }

    try {
      // Just complete onboarding without saving any data
      const success = await completeOnboardingApi(ownerId);
      if (!success) {
        return { success: false, error: 'Failed to complete onboarding' };
      }

      // Clear any draft data
      await clearOnboardingDraft(ownerId);
      if (!mounted.current) return { success: true };
      currentDraft.current = {};
      revision.current++;
      setDraft({});

      // Refresh profile to get updated state
      await refreshProfile();
      if (!mounted.current) return { success: true };
      invalidateProfileCache();

      return { success: true };
    } catch (error) {
      console.error('[OnboardingContext] Error skipping onboarding:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }, [ownerId, refreshProfile]);

  // Save all draft data and complete onboarding in one idempotent server transaction.
  // Single-flight: concurrent callers share the in-flight attempt.
  const batchSaveAndComplete = useCallback((): Promise<{ success: boolean; error?: string }> => {
    if (!ownerId || !mounted.current) {
      return Promise.resolve({ success: false, error: 'No session' });
    }
    if (completed.current) return Promise.resolve({ success: true });
    if (completion.current) return completion.current;

    const userId = ownerId;
    const attempt = (async (): Promise<{ success: boolean; error?: string }> => {
      try {
        // Persist the request id BEFORE sending; updateDraft queues behind pending draft writes.
        const requestId = currentDraft.current.completion_request_id ?? Crypto.randomUUID();
        try {
          await updateDraft({ completion_request_id: requestId });
        } catch (error) {
          console.error('[OnboardingContext] Could not persist completion request:', error);
          return { success: false, error: 'Could not save your progress on this device. Please try again.' };
        }
        // Never send the captured owner's data under a different signed-in session.
        if (!mounted.current) return { success: false, error: 'No session' };

        const result = await completeOnboardingAtomic(requestId, buildOnboardingCompletionPayload(currentDraft.current));
        if (!result.ok) {
          // A conflict means an earlier attempt already committed (e.g. its response was lost and
          // answers were edited afterwards). If the server profile is complete, finish instead of
          // trapping the user on a non-retryable error.
          const alreadyCommitted = (result.code === 'ONBOARDING_REQUEST_CONFLICT'
            || result.code === 'ONBOARDING_ALREADY_COMPLETED')
            && (await fetchProfile(userId))?.onboarding_completed === true;
          // Draft (and its request id) is retained on every other failure so Retry replays the same request.
          if (!alreadyCommitted) return { success: false, error: result.error };
          if (!mounted.current) return { success: false, error: 'No session' };
        }

        completed.current = true;
        // Clear draft after acknowledged save
        await clearOnboardingDraft(userId);
        if (!mounted.current) return { success: true };
        currentDraft.current = {};
        revision.current++;
        setDraft({});

        // Refresh profile to get updated state
        await refreshProfile();
        if (!mounted.current) return { success: true };
        invalidateProfileCache();

        return { success: true };
      } catch (error) {
        console.error('[OnboardingContext] Error completing onboarding:', error);
        return { success: false, error: 'An unexpected error occurred while saving' };
      } finally {
        completion.current = null;
      }
    })();
    completion.current = attempt;
    return attempt;
  }, [ownerId, refreshProfile, updateDraft]);

  return (
    <OnboardingContext.Provider
      value={{
        draft,
        draftLoading,
        draftSaving,
        updateDraft,
        batchSaveAndComplete,
        skipOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
