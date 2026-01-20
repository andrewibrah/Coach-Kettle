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
  clearLastAuthenticatedAt,
  getLastAuthenticatedAt,
  isSessionExpired,
  setLastAuthenticatedAt,
  getBiometricEnabled,
  setBiometricEnabled as persistBiometricEnabled,
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

  // Biometric info
  biometricStatus: BiometricStatus | null;
  biometricEnabled: boolean;
  unlockButtonText: string;

  // Actions
  unlockWithBiometrics: () => Promise<{ success: boolean; error?: string }>;
  refreshAuthTimestamp: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
}

const AuthLockContext = createContext<AuthLockContextType>({
  isLocked: false,
  isCheckingLock: true,
  biometricStatus: null,
  biometricEnabled: false,
  unlockButtonText: 'Unlock',
  unlockWithBiometrics: async () => ({ success: false }),
  refreshAuthTimestamp: async () => {},
  setBiometricEnabled: async () => {},
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

  /**
   * Initial lock check on mount and when session changes
   */
  useEffect(() => {
    if (!authLoading) {
      setIsCheckingLock(true);
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
      'Verify your identity to unlock EasyWorkouts',
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

  const value: AuthLockContextType = {
    isLocked,
    isCheckingLock,
    biometricStatus,
    biometricEnabled,
    unlockButtonText,
    unlockWithBiometrics,
    refreshAuthTimestamp,
    setBiometricEnabled: handleSetBiometricEnabled,
  };

  return (
    <AuthLockContext.Provider value={value}>
      {children}
    </AuthLockContext.Provider>
  );
}
