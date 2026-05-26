// In-session rest timer bar. Floating chip at the bottom of the workout screen.
// Visible when timer is running, paused, or done. Hidden when idle.

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSharedRestTimer } from '@/contexts/RestTimerContext';
import { formatTime } from '@/lib/restTimer';

type Props = {
  onSkip?: () => void;
  bottom?: number;
};

export function RestTimerBar({ onSkip, bottom = 96 }: Props) {
  const { state, remainingSec, pause, resume, cancel, skip } = useSharedRestTimer();
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');

  // Haptic when the timer hits 0
  useEffect(() => {
    if (state.kind === 'done') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [state.kind]);

  if (state.kind === 'idle') return null;

  const label =
    state.kind === 'done' ? 'Rest complete'
    : state.kind === 'paused' ? `Paused · ${formatTime(remainingSec)}`
    : `Rest · ${formatTime(remainingSec)}`;

  const subtitle = state.exercise
    ? `${state.exercise}${state.setNumber ? ` · set ${state.setNumber + 1}` : ''}`
    : null;

  const handleSkip = async () => {
    await skip();
    onSkip?.();
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={[styles.bar, { backgroundColor: cardBg }]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.label, { color: textColor }]}>{label}</ThemedText>
          {subtitle ? <ThemedText style={[styles.sub, { color: textColor }]}>{subtitle}</ThemedText> : null}
        </View>
        {state.kind === 'running' && (
          <Pressable onPress={pause} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <ThemedText style={[styles.btnText, { color: tint }]}>Pause</ThemedText>
          </Pressable>
        )}
        {state.kind === 'paused' && (
          <Pressable onPress={resume} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <ThemedText style={[styles.btnText, { color: tint }]}>Resume</ThemedText>
          </Pressable>
        )}
        {state.kind !== 'done' && (
          <Pressable onPress={handleSkip} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <ThemedText style={[styles.btnText, { color: tint }]}>Skip</ThemedText>
          </Pressable>
        )}
        {state.kind === 'done' && (
          <Pressable onPress={cancel} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <ThemedText style={[styles.btnText, { color: tint }]}>Dismiss</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  label: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnText: { fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
