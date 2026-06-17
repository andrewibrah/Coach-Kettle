// Rest Timer tab — dedicated screen for tracking rest between sets.
// The timer lives in the shared RestTimerProvider (app root), so it survives
// tab switches and refresh via AsyncStorage (see hooks/useRestTimer).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSharedRestTimer } from '@/contexts/RestTimerContext';
import { formatTime } from '@/lib/restTimer';

const MIN_SEC = 15;
const MAX_SEC = 600;
const STEP_SEC = 5;
const TICK_WIDTH = 14;
const PRESETS = [60, 90, 120, 180];

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
  const lastHapticSecRef = useRef(90);

  const isRunning = state.kind === 'running';
  const isPaused = state.kind === 'paused';
  const isActive = isRunning || isPaused;
  const isDone = state.kind === 'done';

  const displaySec = isActive ? remainingSec : selected;
  const activeDuration =
    state.kind === 'running' || state.kind === 'paused' ? state.durationSec : 0;
  const progress =
    isActive && activeDuration > 0
      ? Math.max(0, Math.min(1, 1 - remainingSec / activeDuration))
      : isDone
      ? 1
      : 0;

  const statusText = isRunning
    ? 'Resting'
    : isPaused
    ? 'Paused'
    : isDone
    ? 'Complete'
    : 'Ready';

  const handleDialChange = useCallback((sec: number) => {
    setSelected(sec);
    // Subtle haptic each 15s increment as the dial moves
    if (Math.abs(sec - lastHapticSecRef.current) >= 15) {
      Haptics.selectionAsync().catch(() => undefined);
      lastHapticSecRef.current = sec;
    }
  }, []);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    start({}, selected, { logRestEntry: true });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText style={[styles.eyebrow, { color: placeholder }]}>Rest</ThemedText>
          <ThemedText style={[styles.heading, { color: textColor }]}>Timer</ThemedText>
        </View>

        <CountdownRing
          size={280}
          stroke={14}
          progress={progress}
          trackColor={border}
          fillColor={isPaused ? placeholder : isDone ? tint : tint}
        >
          <ThemedText style={[styles.statusPill, { color: placeholder }]}>
            {statusText.toUpperCase()}
          </ThemedText>
          <ThemedText style={[styles.time, { color: textColor }]}>
            {formatTime(displaySec)}
          </ThemedText>
          <ThemedText style={[styles.timeSub, { color: placeholder }]}>
            {isActive ? `of ${formatTime(activeDuration)}` : 'tap a preset or spin the dial'}
          </ThemedText>
        </CountdownRing>

        {!isActive && (
          <View style={styles.editor}>
            <View style={styles.presetRow}>
              {PRESETS.map((sec) => {
                const active = selected === sec;
                return (
                  <Pressable
                    key={sec}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSelected(sec);
                      lastHapticSecRef.current = sec;
                    }}
                    style={[
                      styles.preset,
                      {
                        borderColor: active ? tint : border,
                        backgroundColor: active ? tint : cardBg,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityLabel={`${formatTime(sec)} preset`}
                    accessibilityState={{ selected: active }}
                  >
                    <ThemedText
                      style={[
                        styles.presetText,
                        { color: active ? tintFg : textColor },
                      ]}
                    >
                      {formatTime(sec)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <Dial
              value={selected}
              onChange={handleDialChange}
              tint={tint}
              textColor={textColor}
              placeholder={placeholder}
              border={border}
              cardBg={cardBg}
            />
          </View>
        )}

        <View style={styles.controls}>
          {!isActive && !isDone && (
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start rest timer"
            >
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>
                Start rest
              </ThemedText>
            </Pressable>
          )}

          {isDone && (
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start rest timer again"
            >
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>
                Start again
              </ThemedText>
            </Pressable>
          )}

          {isRunning && (
            <Pressable
              onPress={pause}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pause timer"
            >
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>
                Pause
              </ThemedText>
            </Pressable>
          )}

          {isPaused && (
            <Pressable
              onPress={resume}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Resume timer"
            >
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>
                Resume
              </ThemedText>
            </Pressable>
          )}

          {isActive && (
            <View style={styles.secondaryRow}>
              <Pressable
                onPress={skip}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: border, backgroundColor: cardBg },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Skip rest"
              >
                <ThemedText style={[styles.secondaryText, { color: textColor }]}>
                  Skip
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={cancel}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: border, backgroundColor: cardBg },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel rest timer"
              >
                <ThemedText style={[styles.secondaryText, { color: textColor }]}>
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Circular progress ring with arbitrary children in the center ────────────
function CountdownRing({
  size,
  stroke,
  progress,
  trackColor,
  fillColor,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  trackColor: string;
  fillColor: string;
  children: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringContent} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

// ── Scrollable dial / ruler picker ──────────────────────────────────────────
function Dial({
  value,
  onChange,
  tint,
  textColor,
  placeholder,
  border,
  cardBg,
}: {
  value: number;
  onChange: (sec: number) => void;
  tint: string;
  textColor: string;
  placeholder: string;
  border: string;
  cardBg: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let s = MIN_SEC; s <= MAX_SEC; s += STEP_SEC) arr.push(s);
    return arr;
  }, []);
  const scrollRef = useRef<ScrollView | null>(null);
  const isUserScrollingRef = useRef(false);
  const lastValueRef = useRef(value);
  const dialPadding = screenWidth / 2 - TICK_WIDTH / 2;

  const valueToOffset = useCallback(
    (sec: number) => {
      const clamped = Math.max(MIN_SEC, Math.min(MAX_SEC, sec));
      const idx = Math.round((clamped - MIN_SEC) / STEP_SEC);
      return idx * TICK_WIDTH;
    },
    [],
  );

  // Sync the dial position when the parent changes `value` (e.g. preset tap)
  // but only when the user isn't actively scrolling, to avoid fighting them.
  React.useEffect(() => {
    if (isUserScrollingRef.current) return;
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    scrollRef.current?.scrollTo({ x: valueToOffset(value), animated: true });
  }, [value, valueToOffset]);

  // Set initial scroll position once after mount.
  const onContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollTo({ x: valueToOffset(value), animated: false });
  }, [value, valueToOffset]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / TICK_WIDTH);
      const sec = Math.max(MIN_SEC, Math.min(MAX_SEC, MIN_SEC + idx * STEP_SEC));
      if (sec !== lastValueRef.current) {
        lastValueRef.current = sec;
        onChange(sec);
      }
    },
    [onChange],
  );

  return (
    <View style={[styles.dialWrap, { backgroundColor: cardBg, borderColor: border }]}>
      <View style={styles.dialValueRow}>
        <ThemedText style={[styles.dialValue, { color: textColor }]}>
          {formatTime(value)}
        </ThemedText>
        <ThemedText style={[styles.dialUnit, { color: placeholder }]}>
          min : sec
        </ThemedText>
      </View>

      <View style={styles.dialTrack}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_WIDTH}
          decelerationRate="fast"
          onScrollBeginDrag={() => {
            isUserScrollingRef.current = true;
          }}
          onMomentumScrollEnd={() => {
            isUserScrollingRef.current = false;
          }}
          onScrollEndDrag={() => {
            // user lifted finger; momentum may or may not follow
            setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 50);
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={{ paddingHorizontal: dialPadding }}
        >
          {ticks.map((sec) => {
            const isMajor = sec % 30 === 0;
            const isMinute = sec % 60 === 0;
            return (
              <View key={sec} style={[styles.tickCell, { width: TICK_WIDTH }]}>
                <View
                  style={[
                    styles.tick,
                    {
                      backgroundColor: placeholder,
                      height: isMinute ? 28 : isMajor ? 20 : 12,
                      opacity: isMinute ? 0.9 : isMajor ? 0.6 : 0.35,
                    },
                  ]}
                />
                {isMinute && (
                  <ThemedText style={[styles.tickLabel, { color: placeholder }]}>
                    {Math.round(sec / 60)}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </ScrollView>
        <View
          pointerEvents="none"
          style={[styles.dialIndicator, { backgroundColor: tint }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 24,
    alignItems: 'center',
  },
  header: {
    alignSelf: 'stretch',
    gap: 4,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heading: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },

  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusPill: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  time: {
    fontSize: 72,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    lineHeight: 80,
  },
  timeSub: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 200,
  },

  editor: { alignSelf: 'stretch', gap: 14 },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  preset: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  presetText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  dialWrap: {
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dialValueRow: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  dialValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  dialUnit: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dialTrack: {
    height: 64,
    justifyContent: 'center',
    position: 'relative',
  },
  tickCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 64,
    paddingTop: 8,
  },
  tick: {
    width: 2,
    borderRadius: 1,
  },
  tickLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  dialIndicator: {
    position: 'absolute',
    left: '50%',
    top: 6,
    width: 3,
    height: 36,
    marginLeft: -1.5,
    borderRadius: 2,
  },

  controls: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryText: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
