import { supabase } from '@/lib/supabase';
import { logOutRevenueCat } from '@/lib/iap';
import { clearWorkoutDraft } from '@/lib/workoutDraft';
import { clearWorkouts } from '@/lib/workoutStorage';
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
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Clear all local caches (workout history, Supabase auth tokens)
  const clearAllCaches = async () => {

    // Clear workout history cache + any in-progress draft
    await clearWorkouts();
    await clearWorkoutDraft();

    // Clear tutorial state
    await AsyncStorage.removeItem('tutorial_shown_v1');

    // Clear user-specific caches that must not leak between accounts
    await AsyncStorage.removeItem('cached_profile');
    await AsyncStorage.removeItem('onboarding_draft');

    // Clear all Supabase-related AsyncStorage keys
    const allKeys = await AsyncStorage.getAllKeys();
    const supabaseKeys = allKeys.filter(key =>
      key.startsWith('sb-') ||
      key.includes('supabase') ||
      key.includes('auth')
    );

    if (supabaseKeys.length > 0) {
      await AsyncStorage.multiRemove(supabaseKeys);
    }

  };

  const signOut = async () => {
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
