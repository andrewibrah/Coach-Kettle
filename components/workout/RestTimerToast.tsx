// Global rest-timer overlay. Mounted once at the app root so the user is
// notified the moment a rest timer finishes, on any screen — and so a small
// live countdown chip remains visible while a rest is running on any other
// tab. Hidden on the dedicated /timer screen to avoid duplicating the UI.

import React, { useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSharedRestTimer } from '@/contexts/RestTimerContext';
import { formatTime } from '@/lib/restTimer';

const AUTO_DISMISS_MS = 6000;
const TIMER_ROUTE = '/timer' as Href;

export function RestTimerToast() {
  const { state, remainingSec, pause, resume, skip, cancel } = useSharedRestTimer();
  const router = useRouter();
  const pathname = usePathname();
  // This overlay mounts above the navigator, where there's no SafeAreaProvider,
  // so read the context directly (null-safe) instead of useSafeAreaInsets()
  // (which throws without a provider). Fall back to a sensible top inset.
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? (Platform.OS === 'ios' ? 44 : 0);
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const placeholder = useThemeColor({}, 'placeholder');

  const [doneVisible, setDoneVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-show the "Rest complete" toast on completion, with a fading
  // dismissal after a few seconds.
  useEffect(() => {
    if (state.kind === 'done') {
      setDoneVisible(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      }
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setDoneVisible(false), AUTO_DISMISS_MS);
    } else {
      setDoneVisible(false);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [state.kind]);

  // Hide the overlay entirely while the user is already on the Timer tab.
  const onTimerScreen = pathname?.endsWith('/timer');
  if (onTimerScreen) return null;

  // ── Idle: nothing to show ─────────────────────────────────────────────────
  if (state.kind === 'idle') return null;

  // ── Running / paused: live countdown chip ─────────────────────────────────
  if (state.kind === 'running' || state.kind === 'paused') {
    const total = state.durationSec || 1;
    const progress = Math.max(0, Math.min(1, 1 - remainingSec / total));

    return (
      <View pointerEvents="box-none" style={[styles.wrap, { top: topInset + 8 }]}>
        <Pressable
          onPress={() => router.push(TIMER_ROUTE)}
          style={[styles.chip, { backgroundColor: cardBg, borderColor }]}
        >
          <View style={[styles.chipBar, { backgroundColor: borderColor }]}>
            <View
              style={[
                styles.chipBarFill,
                {
                  backgroundColor: state.kind === 'paused' ? placeholder : tint,
                  width: `${progress * 100}%`,
                },
              ]}
            />
          </View>

          <View style={styles.chipRow}>
            <ThemedText style={[styles.chipLabel, { color: placeholder }]}>
              {state.kind === 'paused' ? 'PAUSED' : 'REST'}
            </ThemedText>
            <ThemedText style={[styles.chipTime, { color: textColor }]}>
              {formatTime(remainingSec)}
            </ThemedText>
            <View style={styles.chipActions}>
              {state.kind === 'running' ? (
                <Pressable
                  hitSlop={10}
                  onPress={pause}
                  style={({ pressed }) => [styles.chipBtn, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.chipBtnText, { color: tint }]}>Pause</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  hitSlop={10}
                  onPress={resume}
                  style={({ pressed }) => [styles.chipBtn, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.chipBtnText, { color: tint }]}>Resume</ThemedText>
                </Pressable>
              )}
              <Pressable
                hitSlop={10}
                onPress={skip}
                style={({ pressed }) => [styles.chipBtn, pressed && styles.pressed]}
              >
                <ThemedText style={[styles.chipBtnText, { color: placeholder }]}>Skip</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </View>
    );
  }

  // ── Done: completion toast ────────────────────────────────────────────────
  if (!doneVisible) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: topInset + 8 }]}>
      <Pressable
        onPress={() => {
          setDoneVisible(false);
          router.push(TIMER_ROUTE);
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
            setDoneVisible(false);
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

  chip: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
    gap: 8,
  },
  chipBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  chipBarFill: { height: '100%', borderRadius: 2 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  chipTime: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  chipActions: { flexDirection: 'row', gap: 6 },
  chipBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  chipBtnText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
