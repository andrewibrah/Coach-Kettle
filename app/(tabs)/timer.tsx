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
import {
  TIMER_DIAL,
  buildTimerTicks,
  snapTimerSeconds,
  timerOffsetToSeconds,
  timerSecondsToOffset,
} from '@/lib/timerDial';

export default function TimerScreen() {
  const { state, remainingSec, start, pause, resume, cancel, skip } = useSharedRestTimer();
  const { height: screenHeight } = useWindowDimensions();

  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const cardBg = useThemeColor({}, 'cardBackground');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const tintFg = useThemeColor({}, 'tintForeground');
  const placeholder = useThemeColor({}, 'placeholder');

  const [selected, setSelected] = useState(90);
  const lastHapticSecRef = useRef(90);

  const compact = screenHeight < 820;
  const ringSize = compact ? 260 : 276;
  const timeSize = compact ? 64 : 70;
  const timeLineHeight = compact ? 70 : 76;

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

  const subtitleText = isActive
    ? `of ${formatTime(activeDuration)}`
    : isDone
    ? 'rest complete — start again when ready'
    : 'tap a preset or spin the dial';

  const handleDialChange = useCallback((sec: number) => {
    setSelected(sec);
    // Subtle haptic each 15s increment as the dial moves.
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
          size={ringSize}
          stroke={13}
          progress={progress}
          trackColor={border}
          fillColor={isPaused ? placeholder : tint}
        >
          <ThemedText style={[styles.statusPill, { color: placeholder }]}>
            {statusText.toUpperCase()}
          </ThemedText>
          <ThemedText
            style={[
              styles.time,
              { color: textColor, fontSize: timeSize, lineHeight: timeLineHeight },
            ]}
          >
            {formatTime(displaySec)}
          </ThemedText>
          <ThemedText style={[styles.timeSub, { color: placeholder }]}>
            {subtitleText}
          </ThemedText>
        </CountdownRing>

        {!isActive && (
          <View style={styles.editor}>
            <View style={styles.presetRow}>
              {TIMER_DIAL.presets.map((sec) => {
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
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>Pause</ThemedText>
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
              <ThemedText style={[styles.primaryText, { color: tintFg }]}>Resume</ThemedText>
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
                <ThemedText style={[styles.secondaryText, { color: textColor }]}>Skip</ThemedText>
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
                <ThemedText style={[styles.secondaryText, { color: textColor }]}>Cancel</ThemedText>
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
  const ticks = useMemo(() => buildTimerTicks(), []);
  const scrollRef = useRef<ScrollView | null>(null);
  const isUserScrollingRef = useRef(false);
  const lastValueRef = useRef(value);
  const dialPadding = screenWidth / 2 - TIMER_DIAL.tickWidth / 2;

  const valueToOffset = useCallback((sec: number) => timerSecondsToOffset(sec), []);

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
      const sec = timerOffsetToSeconds(e.nativeEvent.contentOffset.x);
      if (sec !== lastValueRef.current) {
        lastValueRef.current = sec;
        onChange(sec);
      }
    },
    [onChange],
  );

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const delta = event.nativeEvent.actionName === 'increment' ? TIMER_DIAL.stepSec : -TIMER_DIAL.stepSec;
      const next = snapTimerSeconds(value + delta);
      lastValueRef.current = next;
      onChange(next);
    },
    [onChange, value],
  );

  return (
    <View
      style={[styles.dialWrap, { backgroundColor: cardBg, borderColor: border }]}
      accessibilityRole="adjustable"
      accessibilityLabel={`Rest duration dial, selected ${formatTime(value)}, range ${formatTime(TIMER_DIAL.minSec)} to ${formatTime(TIMER_DIAL.maxSec)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <View style={styles.dialValueRow}>
        <ThemedText style={[styles.dialValue, { color: textColor }]}>
          {formatTime(value)}
        </ThemedText>
        <ThemedText style={[styles.dialUnit, { color: placeholder }]}>min : sec</ThemedText>
        <ThemedText style={[styles.dialHint, { color: placeholder }]}>drag to fine-tune in 5 sec steps</ThemedText>
      </View>

      <View style={styles.dialTrack}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TIMER_DIAL.tickWidth}
          decelerationRate="fast"
          onScrollBeginDrag={() => {
            isUserScrollingRef.current = true;
          }}
          onMomentumScrollEnd={() => {
            isUserScrollingRef.current = false;
          }}
          onScrollEndDrag={() => {
            // User lifted finger; momentum may or may not follow.
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
              <View key={sec} style={[styles.tickCell, { width: TIMER_DIAL.tickWidth }]}>
                <View
                  style={[
                    styles.tick,
                    {
                      backgroundColor: placeholder,
                      height: isMinute ? 34 : isMajor ? 22 : 12,
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
    paddingTop: 10,
    paddingBottom: 28,
    gap: 18,
    alignItems: 'center',
  },
  header: {
    alignSelf: 'stretch',
    gap: 2,
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.7,
  },

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
    letterSpacing: 2.4,
  },
  time: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  timeSub: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 220,
  },

  editor: { alignSelf: 'stretch', gap: 14 },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  preset: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  dialWrap: {
    borderWidth: 1,
    borderRadius: 22,
    paddingTop: 14,
    paddingBottom: 10,
    minHeight: 168,
    overflow: 'hidden',
  },
  dialValueRow: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 6,
  },
  dialValue: {
    fontSize: 30,
    lineHeight: 34,
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
  dialHint: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.82,
  },
  dialTrack: {
    height: 74,
    justifyContent: 'center',
    position: 'relative',
  },
  tickCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 74,
    paddingTop: 10,
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
    top: 8,
    width: 4,
    height: 42,
    marginLeft: -2,
    borderRadius: 3,
  },

  controls: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 2,
  },
  primaryBtn: {
    minHeight: 64,
    borderRadius: 18,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
