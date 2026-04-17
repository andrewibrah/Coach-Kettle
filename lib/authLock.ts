/**
 * Auth Lock Utilities
 *
 * Manages the TTL-based session lock system. Sessions remain unlocked
 * for 4 hours after authentication. After TTL expires, user must
 * re-authenticate via full login.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// TTL: 4 hours in milliseconds
const AUTH_TTL_MS = 4 * 60 * 60 * 1000;

// Storage keys
const STORAGE_KEYS = {
  LAST_AUTHENTICATED_AT: 'auth_last_authenticated_at',
  TERMS_ACCEPTED_AT: 'auth_terms_accepted_at',
  TERMS_VERSION: 'auth_terms_version',
} as const;

// Current terms version - increment when ToS changes significantly
const CURRENT_TERMS_VERSION = '1.0.0';

/**
 * Get the timestamp of last successful authentication
 */
export async function getLastAuthenticatedAt(): Promise<number | null> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.LAST_AUTHENTICATED_AT);
    if (value) {
      const timestamp = parseInt(value, 10);
      return isNaN(timestamp) ? null : timestamp;
    }
    return null;
  } catch (error) {
    console.error('[authLock] Failed to get lastAuthenticatedAt:', error);
    return null;
  }
}

/**
 * Update the last authenticated timestamp to now
 */
export async function setLastAuthenticatedAt(timestamp: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.LAST_AUTHENTICATED_AT,
      timestamp.toString()
    );
  } catch (error) {
    console.error('[authLock] Failed to set lastAuthenticatedAt:', error);
  }
}

/**
 * Clear the last authenticated timestamp (used on logout)
 */
export async function clearLastAuthenticatedAt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_AUTHENTICATED_AT);
  } catch (error) {
    console.error('[authLock] Failed to clear lastAuthenticatedAt:', error);
  }
}

/**
 * Check if the session has expired based on TTL
 */
export function isSessionExpired(lastAuthenticatedAt: number | null): boolean {
  if (lastAuthenticatedAt === null) {
    return true; // No auth timestamp means never authenticated
  }
  const elapsed = Date.now() - lastAuthenticatedAt;
  return elapsed > AUTH_TTL_MS;
}

/**
 * Get time remaining until session expires (in ms)
 */
function getTimeUntilExpiry(lastAuthenticatedAt: number | null): number {
  if (lastAuthenticatedAt === null) {
    return 0;
  }
  const remaining = AUTH_TTL_MS - (Date.now() - lastAuthenticatedAt);
  return Math.max(0, remaining);
}

/**
 * Terms acceptance tracking
 */
async function getTermsAcceptance(): Promise<{ acceptedAt: number; version: string } | null> {
  try {
    const [acceptedAt, version] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.TERMS_ACCEPTED_AT),
      AsyncStorage.getItem(STORAGE_KEYS.TERMS_VERSION),
    ]);

    if (acceptedAt && version) {
      return {
        acceptedAt: parseInt(acceptedAt, 10),
        version,
      };
    }
    return null;
  } catch (error) {
    console.error('[authLock] Failed to get terms acceptance:', error);
    return null;
  }
}

export async function setTermsAcceptance(): Promise<void> {
  try {
    // Save locally first for immediate UI feedback
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.TERMS_ACCEPTED_AT, Date.now().toString()),
      AsyncStorage.setItem(STORAGE_KEYS.TERMS_VERSION, CURRENT_TERMS_VERSION),
    ]);
  } catch (error) {
    console.error('[authLock] Failed to set terms acceptance:', error);
  }
}

/**
 * Sync terms acceptance to server (call after successful authentication)
 * This should be called after login/signup when we have a valid session.
 *
 * Retries with exponential backoff (300ms, 900ms, 2700ms) so a transient
 * network blip on first sign-in (notably common on iPad in App Review)
 * does not lock the user inside the onboarding terms gate.
 */
export async function syncTermsAcceptanceToServer(): Promise<boolean> {
  const { api } = await import('./api');
  const delays = [0, 300, 900, 2700];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
    try {
      const result = await api.recordTermsAcceptance(CURRENT_TERMS_VERSION, CURRENT_TERMS_VERSION);
      if (result?.ok) {
        if (attempt > 0) {
          console.log(`[authLock] Terms acceptance synced on retry attempt ${attempt + 1}`);
        } else {
          console.log('[authLock] Terms acceptance synced to server');
        }
        return true;
      }
      lastError = new Error(`Server responded with ok=false on attempt ${attempt + 1}`);
    } catch (error) {
      lastError = error;
      console.warn(`[authLock] Terms sync attempt ${attempt + 1} failed:`, error);
    }
  }

  console.error('[authLock] All terms sync attempts failed:', lastError);
  // Local acceptance has already been written by the caller;
  // return false so UI can prompt the user to retry.
  return false;
}

/**
 * Check if user has accepted current terms on the server
 * Returns null if check fails (offline, etc.)
 */
export async function checkServerTermsAcceptance(): Promise<{
  accepted: boolean;
  needsAcceptance: boolean;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
} | null> {
  try {
    const { api } = await import('./api');
    const result = await api.checkTermsAcceptance();
    return {
      accepted: result.accepted,
      needsAcceptance: result.needs_acceptance,
      currentTermsVersion: result.current_terms_version,
      currentPrivacyVersion: result.current_privacy_version,
    };
  } catch (error) {
    console.error('[authLock] Failed to check server terms acceptance:', error);
    return null;
  }
}

async function hasAcceptedCurrentTerms(): Promise<boolean> {
  const acceptance = await getTermsAcceptance();
  if (!acceptance) return false;
  return acceptance.version === CURRENT_TERMS_VERSION;
}

/**
 * Clear all auth lock related storage (used on logout)
 */
async function clearAuthLockStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.LAST_AUTHENTICATED_AT,
      // Note: We keep TERMS_ACCEPTED_AT/VERSION as that's account-agnostic
    ]);
  } catch (error) {
    console.error('[authLock] Failed to clear auth lock storage:', error);
  }
}
