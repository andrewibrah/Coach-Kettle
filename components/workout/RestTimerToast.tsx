// Global rest-timer completion toast. Mounted once at the app root so the user
// is notified the moment a rest timer finishes, on any screen. Pairs with the
// browser notification fired from useRestTimer (web) / the scheduled local
// notification (native). Auto-dismisses after a few seconds.

import React, { useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSharedRestTimer } from '@/contexts/RestTimerContext';

const AUTO_DISMISS_MS = 6000;

export function RestTimerToast() {
  const { state, cancel } = useSharedRestTimer();
  const router = useRouter();
  // This toast mounts above the navigator, where there's no SafeAreaProvider,
  // so read the context directly (null-safe) instead of useSafeAreaInsets()
  // (which throws without a provider). Fall back to a sensible top inset.
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? (Platform.OS === 'ios' ? 44 : 0);
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.kind === 'done') {
      setVisible(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    } else {
      setVisible(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.kind]);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: topInset + 8 }]}>
      <Pressable
        onPress={() => {
          setVisible(false);
          router.push('/timer');
        }}
        style={[styles.card, { backgroundColor: cardBg, borderColor }]}
      >
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.title, { color: textColor }]}>Rest complete</ThemedText>
          <ThemedText style={[styles.sub, { color: textColor }]}>Time for your next set.</ThemedText>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => {
            setVisible(false);
            cancel();
          }}
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.6 }]}
        >
          <ThemedText style={[styles.dismissText, { color: textColor }]}>Dismiss</ThemedText>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 1 },
  dismiss: { paddingHorizontal: 8, paddingVertical: 4 },
  dismissText: { fontSize: 13, fontWeight: '600', opacity: 0.8 },
});
