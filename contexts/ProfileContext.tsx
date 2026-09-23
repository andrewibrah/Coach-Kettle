import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import {
  UserProfile,
  ensureProfile,
  fetchProfile,
  updateProfile as updateProfileApi,
  completeOnboarding as completeOnboardingApi,
  updateOnboardingStep as updateOnboardingStepApi,
  refreshAIContext,
} from '@/lib/profile';
import { invalidateProfileCache } from '@/lib/api';

interface ProfileContextType {
  profile: UserProfile | null;
  profileLoading: boolean;
  needsOnboarding: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  completeOnboarding: () => Promise<boolean>;
  updateOnboardingStep: (step: number) => Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoading: true,
  needsOnboarding: false,
  refreshProfile: async () => {},
  updateProfile: async () => false,
  completeOnboarding: async () => false,
  updateOnboardingStep: async () => false,
});

export const useProfile = () => useContext(ProfileContext);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const ownerId = session?.user?.id;
  const [profileState, setProfileState] = useState<{
    ownerId: string | undefined;
    profile: UserProfile | null;
    loading: boolean;
  }>({ ownerId, profile: null, loading: true });
  const profile = profileState.ownerId === ownerId ? profileState.profile : null;
  const profileLoading = profileState.ownerId === ownerId ? profileState.loading : true;
  const activeOwnerId = useRef(ownerId);

  useLayoutEffect(() => {
    activeOwnerId.current = ownerId;
  }, [ownerId]);

  // Fetch or create profile when session changes
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!ownerId) {
        setProfileState({ ownerId, profile: null, loading: false });
        return;
      }

      setProfileState({ ownerId, profile: null, loading: true });
      try {
        const userProfile = await ensureProfile(ownerId);
        if (isMounted && activeOwnerId.current === ownerId) {
          setProfileState({ ownerId, profile: userProfile, loading: true });
        }
      } catch (error) {
        console.error('[ProfileContext] Error loading profile:', error);
      } finally {
        if (isMounted && activeOwnerId.current === ownerId) {
          setProfileState((current) => current.ownerId === ownerId
            ? { ...current, loading: false }
            : current);
        }
      }
    };

    if (!authLoading) {
      loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [ownerId, authLoading]);

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (!ownerId) return;

    try {
      const userProfile = await fetchProfile(ownerId);
      if (activeOwnerId.current === ownerId) {
        setProfileState((current) => ({
          ownerId,
          profile: userProfile,
          loading: current.ownerId === ownerId ? current.loading : false,
        }));
      }
    } catch (error) {
      console.error('[ProfileContext] Error refreshing profile:', error);
    }
  }, [ownerId]);

  // Update profile fields (creates profile if it doesn't exist)
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<boolean> => {
      if (!ownerId) return false;

      try {
        // Ensure profile exists before updating
        if (!profile) {
          const newProfile = await ensureProfile(ownerId);
          if (!newProfile) {
            console.error('[ProfileContext] Failed to create profile');
            return false;
          }
          if (activeOwnerId.current !== ownerId) return false;
          setProfileState((current) => ({
            ownerId,
            profile: newProfile,
            loading: current.ownerId === ownerId ? current.loading : false,
          }));
        }

        const updated = await updateProfileApi(ownerId, updates);
        if (updated) {
          if (activeOwnerId.current !== ownerId) return false;
          setProfileState((current) => ({
            ownerId,
            profile: updated,
            loading: current.ownerId === ownerId ? current.loading : false,
          }));
          // Refresh AI context when profile changes
          await refreshAIContext(ownerId);
          if (activeOwnerId.current !== ownerId) return true;
          // Invalidate API cache so next AI call gets fresh data
          invalidateProfileCache();
          return true;
        }
        return false;
      } catch (error) {
        console.error('[ProfileContext] Error updating profile:', error);
        return false;
      }
    },
    [ownerId, profile]
  );

  // Complete onboarding
  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    if (!ownerId) return false;

    try {
      const success = await completeOnboardingApi(ownerId);
      if (success) {
        if (activeOwnerId.current !== ownerId) return true;
        await refreshProfile();
        if (activeOwnerId.current !== ownerId) return true;
        // Invalidate API cache so next AI call gets fresh data
        invalidateProfileCache();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ProfileContext] Error completing onboarding:', error);
      return false;
    }
  }, [ownerId, refreshProfile]);

  // Update onboarding step
  const updateOnboardingStep = useCallback(
    async (step: number): Promise<boolean> => {
      if (!ownerId) return false;

      try {
        const success = await updateOnboardingStepApi(ownerId, step);
        if (success && activeOwnerId.current === ownerId) {
          setProfileState((current) => current.ownerId === ownerId
            ? {
              ...current,
              profile: current.profile ? { ...current.profile, onboarding_step: step } : null,
            }
            : current);
          return true;
        }
        return false;
      } catch (error) {
        console.error('[ProfileContext] Error updating onboarding step:', error);
        return false;
      }
    },
    [ownerId]
  );

  // Determine if user needs onboarding
  const needsOnboarding = !profileLoading && profile !== null && !profile.onboarding_completed;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        profileLoading,
        needsOnboarding,
        refreshProfile,
        updateProfile,
        completeOnboarding,
        updateOnboardingStep,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
