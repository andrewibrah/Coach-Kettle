import { supabase } from '@/lib/supabase';
import { logOutRevenueCat } from '@/lib/iap';
import { fenceWorkoutDraft } from '@/lib/workoutDraft';
import { clearWorkouts } from '@/lib/workoutStorage';
import { clearOnboardingDraft } from '@/lib/onboardingDraft';
import { clearExerciseCache } from '@/lib/exerciseLibrary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  clearAllCaches: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isAdmin: false,
  signOut: async () => { },
  clearAllCaches: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let observedAuthChange = false;
    let ownerId: string | undefined;
    const applySession = (next: Session | null) => {
      if (disposed) return;
      const nextOwner = next?.user?.id;
      // Fence synchronously: route callbacks may run before React rerenders.
      if (ownerId !== nextOwner) fenceWorkoutDraft();
      ownerId = nextOwner;
      setSession(next);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!observedAuthChange) applySession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      observedAuthChange = true;
      applySession(next);
    });
    return () => { disposed = true; subscription.unsubscribe(); };
  }, []);

  // Clear all local caches (workout history, Supabase auth tokens)
  const clearAllCaches = async () => {
    const ownerId = session?.user?.id;
    const failures: string[] = [];
    const attempt = async (label: string, cleanup: () => Promise<void>) => {
      try {
        await cleanup();
      } catch {
        failures.push(label);
      }
    };

    // Recovery is not a cache: never removed here. Sign-out fences it instead.
    await attempt('workouts', clearWorkouts);
    await attempt('exercise library', clearExerciseCache);

    // NOTE: tutorial_shown_v1 is intentionally NOT cleared — the tutorial
    // auto-shows only on the device's first-ever login; after that it's
    // reachable via the ? help button.

    // Clear user-specific caches that must not leak between accounts
    await attempt('profile', () => AsyncStorage.removeItem('cached_profile'));
    if (ownerId) {
      await attempt('onboarding draft', () => clearOnboardingDraft(ownerId));
    }
    await attempt('nutrition weekly goals', () => AsyncStorage.removeItem('nutrition_weekly_goals_v1'));
    await attempt('nutrition targets', () => AsyncStorage.removeItem('nutrition_targets_local_v1'));

    // Clear all Supabase keys + every user-namespaced nutrition-target key
    // (draft/cache/pending-save) so target data never leaks across accounts.
    await attempt('scoped auth and nutrition caches', async () => {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(key =>
        key.startsWith('sb-') ||
        key.includes('supabase') ||
        key.includes('auth') ||
        key.startsWith('coach-kettle:nutrition')
      );

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    });

    if (failures.length > 0) {
      console.warn(`[AuthProvider] Cache cleanup failed for: ${failures.join(', ')}`);
    }
  };

  const signOut = async () => {
    // Invalidate queued draft writes before any async cleanup. Settings
    // "Clear Cache" keeps the same owner, so it must not fence.
    fenceWorkoutDraft();
    try {
      // Try to clear caches but don't let it block signOut
      await clearAllCaches();
    } catch (e) {
      console.warn('[AuthProvider] Cache clearing failed, continuing with signOut:', e);
    }

    try {
      await logOutRevenueCat();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[AuthProvider] signOut error:', e);
      // Force clear session state even if Supabase signOut fails
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, isAdmin: false, signOut, clearAllCaches }}>
      {children}
    </AuthContext.Provider>
  );
}
