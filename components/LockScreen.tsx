/**
 * LockScreen
 *
 * Shown when the session TTL has expired and biometric unlock is enabled.
 * Provides two paths:
 * 1. Unlock with Face ID / Touch ID / Passcode (quick path)
 * 2. Log in again (full re-authentication)
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthProvider';
import { useAuthLock } from '@/components/AuthLockProvider';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, session } = useAuth();
  const {
    unlockWithBiometrics,
    unlockButtonText,
    biometricStatus,
  } = useAuthLock();

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const primaryColor = useThemeColor({}, 'tint');

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError(null);

    const result = await unlockWithBiometrics();

    setIsUnlocking(false);

    if (!result.success) {
      setError(result.error || 'Failed to unlock');
    }
    // If success, the lock state will update and this screen will unmount
  };

  const handleLogout = async () => {
    await signOut();
    // Navigation to sign-in handled by auth state change
  };

  // Determine the icon based on biometric type
  const getBiometricIcon = () => {
    if (biometricStatus?.biometricType === 'face') {
      return Platform.OS === 'ios' ? 'scan' : 'scan-outline';
    }
    if (biometricStatus?.biometricType === 'fingerprint') {
      return 'finger-print';
    }
    return 'lock-closed';
  };

  const userEmail = session?.user?.email;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 40, backgroundColor }]}>
      <View style={styles.content}>
        {/* Lock Icon */}
        <View style={[styles.iconContainer, { backgroundColor: `${primaryColor}15` }]}>
          <Ionicons name="lock-closed" size={48} color={primaryColor} />
        </View>

        {/* Title */}
        <ThemedText type="title" style={styles.title}>
          Session Locked
        </ThemedText>

        {/* Description */}
        <ThemedText style={styles.description}>
          For your security, your session has expired after 4 hours of inactivity.
          {userEmail ? `\n\nSigned in as ${userEmail}` : ''}
        </ThemedText>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Unlock Button */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: primaryColor },
            pressed && styles.buttonPressed,
            isUnlocking && styles.buttonDisabled,
          ]}
          onPress={handleUnlock}
          disabled={isUnlocking}
        >
          {isUnlocking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name={getBiometricIcon()} size={24} color="#fff" />
              <ThemedText style={styles.primaryButtonText}>
                {unlockButtonText}
              </ThemedText>
            </>
          )}
        </Pressable>

        {/* Log in Again Button */}
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: textColor },
            pressed && styles.buttonPressed,
          ]}
          onPress={handleLogout}
        >
          <Ionicons name="log-in-outline" size={24} color={textColor} />
          <ThemedText style={styles.secondaryButtonText}>
            Log in again
          </ThemedText>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <ThemedText style={styles.footerText}>
          Having trouble? Tap &quot;Log in again&quot; to sign in with your credentials.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 32,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    flex: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    gap: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    width: '100%',
    borderWidth: 1.5,
    gap: 12,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footer: {
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.5,
    lineHeight: 18,
  },
});
