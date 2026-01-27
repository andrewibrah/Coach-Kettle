/**
 * AuthLockProvider
 *
 * Extends the base AuthProvider with TTL-based session locking.
 * After 4 hours of inactivity, the session becomes "locked" and
 * requires biometric/passcode confirmation or full re-login.
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

import { useAuth } from '@/components/AuthProvider';
import {
  checkServerTermsAcceptance,
  clearLastAuthenticatedAt,
  getBiometricEnabled,
  getLastAuthenticatedAt,
  isSessionExpired,
  setBiometricEnabled as persistBiometricEnabled,
  setLastAuthenticatedAt,
  setTermsAcceptance as setLocalTermsAcceptance,
  syncTermsAcceptanceToServer,
} from '@/lib/authLock';
import {
  authenticateWithBiometrics,
  BiometricStatus,
  canUseBiometrics,
  getBiometricStatus,
  getUnlockButtonText,
} from '@/lib/biometrics';

interface AuthLockContextType {
  // Lock state
  isLocked: boolean;
  isCheckingLock: boolean;
  needsTermsAcceptance: boolean;

  // Biometric info
  biometricStatus: BiometricStatus | null;
  biometricEnabled: boolean;
  unlockButtonText: string;

  // Actions
  unlockWithBiometrics: () => Promise<{ success: boolean; error?: string }>;
  refreshAuthTimestamp: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  acceptTerms: () => Promise<boolean>;
}

const AuthLockContext = createContext<AuthLockContextType>({
  isLocked: false,
  isCheckingLock: true,
  needsTermsAcceptance: false,
  biometricStatus: null,
  biometricEnabled: false,
  unlockButtonText: 'Unlock',
  unlockWithBiometrics: async () => ({ success: false }),
  refreshAuthTimestamp: async () => { },
  setBiometricEnabled: async () => { },
  acceptTerms: async () => false,
});

export const useAuthLock = () => useContext(AuthLockContext);

interface AuthLockProviderProps {
  children: React.ReactNode;
}

export function AuthLockProvider({ children }: AuthLockProviderProps) {
  const { session, loading: authLoading } = useAuth();

  // Lock state
  const [isLocked, setIsLocked] = useState(false);
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const [needsTermsAcceptance, setNeedsTermsAcceptance] = useState(false);

  // Biometric state
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [unlockButtonText, setUnlockButtonText] = useState('Unlock');

  // Track app state for foreground detection
  const appState = useRef(AppState.currentState);

  /**
   * Check if the session should be locked based on TTL
   */
  const checkLockStatus = useCallback(async () => {
    // If no session, don't lock (let auth redirect handle it)
    if (!session) {
      setIsLocked(false);
      setIsCheckingLock(false);
      return;
    }

    const lastAuthAt = await getLastAuthenticatedAt();
    const serverAcceptance = await checkServerTermsAcceptance();

    if (serverAcceptance) {
      setNeedsTermsAcceptance(serverAcceptance.needsAcceptance);
    }

    // If never authenticated (new session), set timestamp and don't lock
    if (lastAuthAt === null) {
      await setLastAuthenticatedAt();
      setIsLocked(false);
      setIsCheckingLock(false);
      return;
    }

    // Check if session has expired
    const expired = isSessionExpired(lastAuthAt);

    // Only lock if biometrics are enabled, otherwise just refresh timestamp
    const biometricPref = await getBiometricEnabled();
    if (expired && biometricPref) {
      setIsLocked(true);
    } else if (expired && !biometricPref) {
      // If biometrics disabled, just refresh the timestamp silently
      await setLastAuthenticatedAt();
      setIsLocked(false);
    } else {
      setIsLocked(false);
    }

    setIsCheckingLock(false);
  }, [session]);

  /**
   * Initialize biometric status
   */
  const initBiometrics = useCallback(async () => {
    const status = await getBiometricStatus();
    setBiometricStatus(status);
    setUnlockButtonText(getUnlockButtonText(status));

    const enabled = await getBiometricEnabled();
    setBiometricEnabledState(enabled);
  }, []);

  /**
   * Handle app state changes (foreground/background)
   */
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        // When app comes to foreground, check lock status
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
   * Initial lock check on mount only
   * We DON'T want to show loading spinner on session refreshes as it unmounts the app UI
   */
  useEffect(() => {
    if (!authLoading) {
      // Only show loading spinner on initial check, not on session refreshes
      if (!initialCheckDone.current) {
        setIsCheckingLock(true);
        initialCheckDone.current = true;
      }
      // Always check lock status, but don't flash loading state
      checkLockStatus();
      initBiometrics();
    }
  }, [authLoading, session, checkLockStatus, initBiometrics]);

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
   * Unlock the session using biometric/passcode authentication
   */
  const unlockWithBiometrics = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    // Check if we can use biometrics at all
    const canUse = await canUseBiometrics();
    if (!canUse) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device',
      };
    }

    // Prompt for authentication
    const result = await authenticateWithBiometrics(
      'Verify your identity to unlock Coach Kettle',
      {
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
      }
    );

    if (result.success) {
      // Update timestamp and unlock
      await setLastAuthenticatedAt();
      setIsLocked(false);
      return { success: true };
    }

    return { success: false, error: result.error };
  }, []);

  /**
   * Refresh the auth timestamp (called after successful login)
   */
  const refreshAuthTimestamp = useCallback(async () => {
    await setLastAuthenticatedAt();
    setIsLocked(false);
  }, []);

  /**
   * Update biometric preference
   */
  const handleSetBiometricEnabled = useCallback(async (enabled: boolean) => {
    await persistBiometricEnabled(enabled);
    setBiometricEnabledState(enabled);

    // If enabling biometrics, also refresh the timestamp
    if (enabled) {
      await setLastAuthenticatedAt();
    }
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
    isLocked,
    isCheckingLock,
    needsTermsAcceptance,
    biometricStatus,
    biometricEnabled,
    unlockButtonText,
    unlockWithBiometrics,
    refreshAuthTimestamp,
    setBiometricEnabled: handleSetBiometricEnabled,
    acceptTerms,
  };

  return (
    <AuthLockContext.Provider value={value}>
      {children}
    </AuthLockContext.Provider>
  );
}
