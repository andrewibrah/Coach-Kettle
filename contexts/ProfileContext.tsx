import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Fetch or create profile when session changes
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!session?.user?.id) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      try {
        const userProfile = await ensureProfile(session.user.id);
        if (isMounted) {
          setProfile(userProfile);
        }
      } catch (error) {
        console.error('[ProfileContext] Error loading profile:', error);
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    };

    if (!authLoading) {
      loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, authLoading]);

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const userProfile = await fetchProfile(session.user.id);
      setProfile(userProfile);
    } catch (error) {
      console.error('[ProfileContext] Error refreshing profile:', error);
    }
  }, [session?.user?.id]);

  // Update profile fields (creates profile if it doesn't exist)
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<boolean> => {
      if (!session?.user?.id) return false;

      try {
        // Ensure profile exists before updating
        if (!profile) {
          console.log('[ProfileContext] No profile found, creating one first...');
          const newProfile = await ensureProfile(session.user.id);
          if (!newProfile) {
            console.error('[ProfileContext] Failed to create profile');
            return false;
          }
          setProfile(newProfile);
        }

        const updated = await updateProfileApi(session.user.id, updates);
        if (updated) {
          setProfile(updated);
          // Refresh AI context when profile changes
          await refreshAIContext(session.user.id);
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
    [session?.user?.id, profile]
  );

  // Complete onboarding
  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    if (!session?.user?.id) return false;

    try {
      const success = await completeOnboardingApi(session.user.id);
      if (success) {
        await refreshProfile();
        // Invalidate API cache so next AI call gets fresh data
        invalidateProfileCache();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ProfileContext] Error completing onboarding:', error);
      return false;
    }
  }, [session?.user?.id, refreshProfile]);

  // Update onboarding step
  const updateOnboardingStep = useCallback(
    async (step: number): Promise<boolean> => {
      if (!session?.user?.id) return false;

      try {
        const success = await updateOnboardingStepApi(session.user.id, step);
        if (success) {
          setProfile((prev) => (prev ? { ...prev, onboarding_step: step } : null));
          return true;
        }
        return false;
      } catch (error) {
        console.error('[ProfileContext] Error updating onboarding step:', error);
        return false;
      }
    },
    [session?.user?.id]
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
