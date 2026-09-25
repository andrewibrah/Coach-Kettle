// Delete Account. Explains what goes, requires typing DELETE, repeats the user's
// own sign-in (password / Apple / Google), then calls the delete-account function
// and clears everything on the device. Flow logic lives in lib/accountDeletion.ts.

import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useAuth } from '@/contexts/AuthProvider';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  DELETE_ACCOUNT_MESSAGES,
  DELETE_CONFIRMATION_WORD,
  isDeleteConfirmationValid,
  resolveReauthMethod,
  runAccountDeletion,
} from '@/lib/accountDeletion';
import { api } from '@/lib/api';
import { useIAP } from '@/lib/iap';
import { cancelAllLocal } from '@/lib/notifications';
import { reauthenticate, restoreSession, signOutLocal } from '@/lib/reauth';

const DELETED_ITEMS = [
  'Your profile and body metrics',
  'All workouts, templates, programs, and personal records',
  'Nutrition logs, targets, and meal plans',
  'Coach history and AI chats',
  'Photos and videos you stored',
  'Your sign-in account and subscription record',
];

const REAUTH_HINT = {
  password: 'Enter your password to confirm it’s you.',
  apple: 'You’ll confirm with Apple when you tap Delete.',
  google: 'You’ll confirm with Google when you tap Delete.',
} as const;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { presentCustomerCenter } = useIAP({ appUserID: session?.user?.id, email: session?.user?.email });

  const backgroundColor = useThemeColor({}, 'background');
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'border');
  const inputBg = useThemeColor({}, 'inputBackground');
  const placeholderColor = useThemeColor({}, 'placeholder');
  const danger = useThemeColor({}, 'danger');
  const dangerFill = useThemeColor({}, 'dangerFill');
  const dangerForeground = useThemeColor({}, 'dangerForeground');
  const dangerSurface = useThemeColor({}, 'dangerSurface');

  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  const method = resolveReauthMethod(session?.user);
  const canSubmit = !busy
    && method !== null
    && isDeleteConfirmationValid(confirmText)
    && (method !== 'password' || password.length > 0);

  const handleDelete = async () => {
    if (busyRef.current || !canSubmit || !session || !method) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    const previous = { access_token: session.access_token, refresh_token: session.refresh_token };
    try {
      const result = await runAccountDeletion({
        expectedUserId: session.user.id,
        reauthenticate: () => reauthenticate(method, { email: session.user.email, password }),
        restoreSession: () => restoreSession(previous),
        deleteAccount: (options) => api.deleteAccount(options),
        cancelLocalNotifications: cancelAllLocal,
        signOut,
        signOutLocal,
      });
      if (result.ok) {
        router.replace('/auth/sign-in' as any);
        return;
      }
      setMessage(result.message);
    } finally {
      setPassword('');
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Delete Account" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: dangerSurface }]}>
            <ThemedText style={[styles.cardTitle, { color: danger }]}>This permanently deletes your account</ThemedText>
            <ThemedText style={styles.body}>It cannot be undone. We will delete:</ThemedText>
            {DELETED_ITEMS.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <ThemedText style={styles.body}>•</ThemedText>
                <ThemedText style={[styles.body, styles.bulletText]}>{item}</ThemedText>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.cardTitle}>Subscriptions</ThemedText>
            <ThemedText style={styles.body}>
              Deleting your account does not cancel an App Store subscription. Cancel it first so you are not charged again.
            </ThemedText>
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              onPress={() => { void presentCustomerCenter(); }}
              accessibilityRole="button"
              accessibilityLabel="Manage subscription"
            >
              <ThemedText style={[styles.linkText, { color: tint }]}>Manage subscription</ThemedText>
            </Pressable>
          </View>

          {method === null ? (
            <ThemedText style={[styles.body, { color: danger }]} accessibilityRole="alert">
              {DELETE_ACCOUNT_MESSAGES.unsupported}
            </ThemedText>
          ) : (
            <View style={styles.form}>
              <ThemedText style={styles.label}>{REAUTH_HINT[method]}</ThemedText>
              {method === 'password' ? (
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={placeholderColor}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  editable={!busy}
                  accessibilityLabel="Password"
                />
              ) : null}

              <ThemedText style={styles.label}>Type {DELETE_CONFIRMATION_WORD} to confirm.</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={DELETE_CONFIRMATION_WORD}
                placeholderTextColor={placeholderColor}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                accessibilityLabel="Type DELETE to confirm"
              />

              {message ? (
                <ThemedText style={[styles.body, { color: danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {message}
                </ThemedText>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  { backgroundColor: dangerFill },
                  !canSubmit && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={handleDelete}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Delete account permanently"
                accessibilityState={{ disabled: !canSubmit, busy }}
              >
                {busy ? (
                  <ActivityIndicator color={dangerForeground} />
                ) : (
                  <ThemedText style={[styles.deleteText, { color: dangerForeground }]}>Delete Account</ThemedText>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
  },
  bulletText: {
    flex: 1,
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  deleteButton: {
    minHeight: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  deleteText: {
    fontSize: 17,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
