/**
 * Biometric Authentication Utilities
 *
 * Wraps expo-local-authentication for biometric/passcode authentication.
 * Used for unlocking sessions after TTL expiry, NOT for passwordless auth.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  isEnrolled: boolean;
  biometricType: BiometricType;
  canUsePasscode: boolean;
}

/**
 * Get the current biometric status on the device
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    // Check if hardware is available
    const isAvailable = await LocalAuthentication.hasHardwareAsync();

    // Check if biometrics are enrolled
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    // Get available authentication types
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    // Determine the primary biometric type
    let biometricType: BiometricType = 'none';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'face';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'fingerprint';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricType = 'iris';
    }

    // Check if device passcode can be used as fallback
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    const canUsePasscode = securityLevel !== LocalAuthentication.SecurityLevel.NONE;

    return {
      isAvailable,
      isEnrolled,
      biometricType,
      canUsePasscode,
    };
  } catch (error) {
    console.error('[biometrics] Failed to get status:', error);
    return {
      isAvailable: false,
      isEnrolled: false,
      biometricType: 'none',
      canUsePasscode: false,
    };
  }
}

/**
 * Get a user-friendly name for the biometric type
 */
export function getBiometricDisplayName(type: BiometricType): string {
  switch (type) {
    case 'face':
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
    case 'fingerprint':
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    case 'iris':
      return 'Iris Scan';
    case 'none':
    default:
      return 'Biometrics';
  }
}

/**
 * Get the unlock button text based on device capabilities
 */
export function getUnlockButtonText(status: BiometricStatus): string {
  if (status.isEnrolled && status.biometricType !== 'none') {
    const biometricName = getBiometricDisplayName(status.biometricType);
    return `Unlock with ${biometricName}`;
  }
  if (status.canUsePasscode) {
    return 'Unlock with Passcode';
  }
  return 'Unlock';
}

export interface AuthenticateResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Prompt the user for biometric/passcode authentication
 *
 * @param promptMessage - Message shown to user during authentication
 * @param options - Additional options for the authentication prompt
 */
export async function authenticateWithBiometrics(
  promptMessage: string = 'Authenticate to continue',
  options: {
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  } = {}
): Promise<AuthenticateResult> {
  try {
    const status = await getBiometricStatus();

    // If no authentication methods available, fail gracefully
    if (!status.isEnrolled && !status.canUsePasscode) {
      return {
        success: false,
        error: 'No authentication methods available on this device',
        errorCode: 'NO_AUTH_METHODS',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: options.cancelLabel || 'Cancel',
      fallbackLabel: options.fallbackLabel || 'Use Passcode',
      disableDeviceFallback: options.disableDeviceFallback ?? false,
    });

    if (result.success) {
      return { success: true };
    }

    // Handle specific error cases
    if (result.error === 'user_cancel') {
      return {
        success: false,
        error: 'Authentication cancelled',
        errorCode: 'USER_CANCELLED',
      };
    }

    if (result.error === 'user_fallback') {
      return {
        success: false,
        error: 'User chose fallback',
        errorCode: 'USER_FALLBACK',
      };
    }

    if (result.error === 'lockout') {
      return {
        success: false,
        error: 'Too many failed attempts. Please try again later.',
        errorCode: 'LOCKOUT',
      };
    }

    if (result.error === 'not_enrolled') {
      return {
        success: false,
        error: 'No biometrics enrolled on this device',
        errorCode: 'NOT_ENROLLED',
      };
    }

    return {
      success: false,
      error: result.error || 'Authentication failed',
      errorCode: 'AUTH_FAILED',
    };
  } catch (error) {
    console.error('[biometrics] Authentication error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
      errorCode: 'UNEXPECTED_ERROR',
    };
  }
}

/**
 * Check if biometric authentication can be used on this device
 */
export async function canUseBiometrics(): Promise<boolean> {
  const status = await getBiometricStatus();
  return status.isEnrolled || status.canUsePasscode;
}
