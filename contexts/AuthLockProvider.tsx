/**
 * AuthLockProvider
 *
 * Extends the base AuthProvider with TTL-based session management
 * and terms acceptance tracking.
 *
 * IMPORTANT: This does NOT create a new auth system. It wraps the
 * existing Supabase auth with a local TTL check for convenience.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useAuth } from '@/contexts/AuthProvider';
import {
  checkServerTermsAcceptance,
  clearLastAuthenticatedAt,
  getLastAuthenticatedAt,
  isSessionExpired,
  setLastAuthenticatedAt,
  setTermsAcceptance as setLocalTermsAcceptance,
  syncTermsAcceptanceToServer,
} from '@/lib/authLock';

interface AuthLockContextType {
  // State
  isCheckingLock: boolean;
  needsTermsAcceptance: boolean;

  // Actions
  refreshAuthTimestamp: () => Promise<void>;
  acceptTerms: () => Promise<boolean>;
}

const AuthLockContext = createContext<AuthLockContextType>({
  isCheckingLock: true,
  needsTermsAcceptance: false,
  refreshAuthTimestamp: async () => { },
  acceptTerms: async () => false,
});

export const useAuthLock = () => useContext(AuthLockContext);

interface AuthLockProviderProps {
  children: React.ReactNode;
}

export function AuthLockProvider({ children }: AuthLockProviderProps) {
  const { session, loading: authLoading } = useAuth();

  // State
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const [needsTermsAcceptance, setNeedsTermsAcceptance] = useState(false);

  // Track app state for foreground detection
  const appState = useRef(AppState.currentState);

  /**
   * Check session status and terms acceptance
   */
  const checkLockStatus = useCallback(async () => {
    // If no session, don't check (let auth redirect handle it)
    if (!session) {
      setIsCheckingLock(false);
      return;
    }

    const lastAuthAt = await getLastAuthenticatedAt();
    const serverAcceptance = await checkServerTermsAcceptance();

    // Fail-safe: if we can't verify terms acceptance, require it
    // This prevents bypassing terms by going offline
    if (serverAcceptance) {
      setNeedsTermsAcceptance(serverAcceptance.needsAcceptance);
    } else {
      // Server check failed - require acceptance to be safe
      console.warn('[AuthLockProvider] Terms check failed, requiring acceptance');
      setNeedsTermsAcceptance(true);
    }

    // If never authenticated (new session), set timestamp
    if (lastAuthAt === null) {
      await setLastAuthenticatedAt();
      setIsCheckingLock(false);
      return;
    }

    // If expired, just refresh the timestamp silently
    const expired = isSessionExpired(lastAuthAt);
    if (expired) {
      await setLastAuthenticatedAt();
    }

    setIsCheckingLock(false);
  }, [session]);

  /**
   * Handle app state changes (foreground/background)
   */
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        // When app comes to foreground, check status
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          await checkLockStatus();
        }
        appState.current = nextAppState;
      }
    );

    return () => subscription.remove();
  }, [checkLockStatus]);

  // Track if initial check has been done
  const initialCheckDone = useRef(false);

  /**
   * Initial check on mount only
   */
  useEffect(() => {
    if (!authLoading) {
      if (!initialCheckDone.current) {
        setIsCheckingLock(true);
        initialCheckDone.current = true;
      }
      checkLockStatus();
    }
  }, [authLoading, session, checkLockStatus]);

  /**
   * Clear auth timestamp on logout
   */
  useEffect(() => {
    if (!session) {
      clearLastAuthenticatedAt();
      setNeedsTermsAcceptance(false);
    }
  }, [session]);

  /**
   * Refresh the auth timestamp (called after successful login)
   */
  const refreshAuthTimestamp = useCallback(async () => {
    await setLastAuthenticatedAt();
  }, []);

  /**
   * Accept the current terms of service
   */
  const acceptTerms = useCallback(async () => {
    // 1. Update local storage
    await setLocalTermsAcceptance();

    // 2. Sync to server
    const success = await syncTermsAcceptanceToServer();

    if (success) {
      setNeedsTermsAcceptance(false);
    }

    return success;
  }, []);

  const value: AuthLockContextType = {
    isCheckingLock,
    needsTermsAcceptance,
    refreshAuthTimestamp,
    acceptTerms,
  };

  return (
    <AuthLockContext.Provider value={value}>
      {children}
    </AuthLockContext.Provider>
  );
}
