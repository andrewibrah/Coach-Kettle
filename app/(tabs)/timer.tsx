// Rest Timer tab — a dedicated screen for tracking rest between sets.
// The timer lives in the shared RestTimerProvider (app root), so it keeps
// running when you switch tabs or leave the page, and survives a refresh via
// AsyncStorage (see hooks/useRestTimer). Starting a timer here also drops a
// "Rest timer started" marker into the active workout log.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSharedRestTimer } from '@/contexts/RestTimerContext';
import { formatTime } from '@/lib/restTimer';

const PRESETS = [30, 60, 90, 120, 180, 300];
const MIN_SEC = 15;
const MAX_SEC = 600;

export default function TimerScreen() {
  const { state, remainingSec, start, pause, resume, cancel, skip } = useSharedRestTimer();

  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({}, 'cardBackground');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const tintFg = useThemeColor({}, 'tintForeground');
  const placeholder = useThemeColor({}, 'placeholder');

  const [selected, setSelected] = useState(90);

  const isActive = state.kind === 'running' || state.kind === 'paused';
  const isDone = state.kind === 'done';

  // Big display: live remaining while active, otherwise the chosen preset.
  const displaySec = isActive ? remainingSec : selected;
  const activeDuration =
    state.kind === 'running' || state.kind === 'paused' ? state.durationSec : 0;
  const progress =
    isActive && activeDuration > 0
      ? Math.max(0, Math.min(1, remainingSec / activeDuration))
      : isDone
      ? 0
      : 1;

  const adjust = (delta: number) =>
    setSelected((s) => Math.max(MIN_SEC, Math.min(MAX_SEC, s + delta)));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={[styles.heading, { color: textColor }]}>Rest Timer</ThemedText>
        <ThemedText style={[styles.subheading, { color: placeholder }]}>
          Keeps running across tabs — even if you leave this page.
        </ThemedText>

        {/* ── Countdown display ──────────────────────────────────────────── */}
        <View style={[styles.display, { backgroundColor: cardBg, borderColor: border }]}>
          <ThemedText style={[styles.time, { color: textColor }]}>{formatTime(displaySec)}</ThemedText>
          <ThemedText style={[styles.statusLabel, { color: placeholder }]}>
            {state.kind === 'running'
              ? 'Resting…'
              : state.kind === 'paused'
              ? 'Paused'
              : isDone
              ? 'Rest complete'
              : 'Ready'}
          </ThemedText>
          <View style={[styles.progressTrack, { backgroundColor: placeholder + '33' }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: tint }]} />
          </View>
        </View>

        {/* ── Preset + custom selection (only when not running) ──────────── */}
        {!isActive && (
          <>
            <View style={styles.presetGrid}>
              {PRESETS.map((sec) => {
                const active = selected === sec;
                return (
                  <Pressable
                    key={sec}
                    onPress={() => setSelected(sec)}
                    style={[
                      styles.preset,
                      { borderColor: border, backgroundColor: active ? tint : cardBg },
                    ]}
                  >
                    <ThemedText style={[styles.presetText, { color: active ? tintFg : textColor }]}>
                      {formatTime(sec)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => adjust(-15)}
                style={[styles.stepBtn, { borderColor: border, backgroundColor: cardBg }]}
              >
                <ThemedText style={[styles.stepText, { color: textColor }]}>−15s</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => adjust(15)}
                style={[styles.stepBtn, { borderColor: border, backgroundColor: cardBg }]}
              >
                <ThemedText style={[styles.stepText, { color: textColor }]}>+15s</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Controls ───────────────────────────────────────────────────── */}
        <View style={styles.controls}>
          {state.kind === 'idle' || isDone ? (
            <Pressable
              onPress={() => start({}, selected, { logRestEntry: true })}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint }, pressed && styles.pressed]}
            >
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>
                {isDone ? 'Start again' : 'Start rest'}
              </ThemedText>
            </Pressable>
          ) : (
            <>
              {state.kind === 'running' ? (
                <Pressable
                  onPress={pause}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint }, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.primaryText, { color: tintFg }]}>Pause</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={resume}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint }, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.primaryText, { color: tintFg }]}>Resume</ThemedText>
                </Pressable>
              )}
              <View style={styles.secondaryRow}>
                <Pressable
                  onPress={skip}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: border }, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.secondaryText, { color: textColor }]}>Skip</ThemedText>
                </Pressable>
                <Pressable
                  onPress={cancel}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: border }, pressed && styles.pressed]}
                >
                  <ThemedText style={[styles.secondaryText, { color: textColor }]}>Cancel</ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700', marginTop: 8 },
  subheading: { fontSize: 13, marginTop: -8 },
  display: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  time: { fontSize: 64, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusLabel: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', alignSelf: 'stretch', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 3 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  preset: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    width: '31%',
    alignItems: 'center',
  },
  presetText: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stepperRow: { flexDirection: 'row', gap: 10 },
  stepBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stepText: { fontSize: 15, fontWeight: '600' },
  controls: { gap: 12, marginTop: 4 },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontSize: 17, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
