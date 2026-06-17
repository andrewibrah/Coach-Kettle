import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface PRCelebrationData {
  liftName: string;
  weight: number;
  reps: number;
  newE1rm: number;
  previousE1rm?: number;
}

interface PRCelebrationProps {
  data: PRCelebrationData;
  onDismiss: () => void;
}

export function PRCelebration({ data, onDismiss }: PRCelebrationProps) {
  const colorScheme = useColorScheme();
  const tint = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({}, 'cardBackground');
  const secondaryBg = useThemeColor({}, 'secondaryBackground');

  const overlayOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.5);
  const cardOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0);
  const confettiOpacity = useSharedValue(0);

  const triggerHaptics = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  useEffect(() => {
    // Animate in
    overlayOpacity.value = withTiming(1, { duration: 200 });
    cardScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 100 }));
    cardOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));
    titleScale.value = withDelay(300, withSequence(
      withSpring(1.2, { damping: 8 }),
      withSpring(1, { damping: 15 })
    ));
    confettiOpacity.value = withDelay(200, withTiming(1, { duration: 300 }));

    // Trigger haptics
    runOnJS(triggerHaptics)();

    // Auto dismiss after 4 seconds
    const timer = setTimeout(() => {
      handleDismiss();
    }, 4000);

    return () => clearTimeout(timer);
    // Run once when the celebration mounts; animation shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    overlayOpacity.value = withTiming(0, { duration: 200 });
    cardScale.value = withTiming(0.8, { duration: 200 });
    cardOpacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onDismiss)();
    });
    confettiOpacity.value = withTiming(0, { duration: 200 });
  };

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
  }));

  const confettiAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confettiOpacity.value,
  }));

  const improvement = data.previousE1rm
    ? (((data.newE1rm - data.previousE1rm) / data.previousE1rm) * 100).toFixed(1)
    : null;

  return (
    <TouchableOpacity
      style={StyleSheet.absoluteFill}
      activeOpacity={1}
      onPress={handleDismiss}
    >
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint={colorScheme === 'dark' ? 'dark' : 'light'} />

        {/* Confetti */}
        <Animated.View style={[styles.confettiContainer, confettiAnimatedStyle]}>
          {[...Array(30)].map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </Animated.View>

        <Animated.View style={[styles.card, cardAnimatedStyle, { backgroundColor: cardBg }]}>
          <Animated.View style={titleAnimatedStyle}>
            <ThemedText style={styles.trophy}>🏆</ThemedText>
            <ThemedText style={[styles.title, { color: tint }]}>
              NEW PR!
            </ThemedText>
          </Animated.View>

          <ThemedText style={styles.liftName}>{data.liftName}</ThemedText>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{data.weight}</ThemedText>
              <ThemedText style={styles.statLabel}>lbs</ThemedText>
            </View>
            <ThemedText style={styles.statDivider}>×</ThemedText>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{data.reps}</ThemedText>
              <ThemedText style={styles.statLabel}>reps</ThemedText>
            </View>
          </View>

          <View style={[styles.e1rmContainer, { backgroundColor: secondaryBg }]}>
            <ThemedText style={styles.e1rmLabel}>Estimated 1RM</ThemedText>
            <ThemedText style={[styles.e1rmValue, { color: tint }]}>
              {data.newE1rm.toFixed(0)} lbs
            </ThemedText>
            {improvement && (
              <View style={styles.improvementBadge}>
                <ThemedText style={styles.improvementText}>+{improvement}%</ThemedText>
              </View>
            )}
          </View>

          <ThemedText style={styles.tapToDismiss}>Tap anywhere to continue</ThemedText>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

interface ConfettiPieceProps {
  index: number;
}

function ConfettiPiece({ index }: ConfettiPieceProps) {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96c93d', '#f9ca24', '#a55eea', '#FFD700'];
  const color = colors[index % colors.length];

  const translateY = useSharedValue(-100);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  const startX = Math.random() * SCREEN_WIDTH;
  const duration = 2000 + Math.random() * 1000;

  useEffect(() => {
    translateY.value = withDelay(
      index * 30,
      withTiming(SCREEN_HEIGHT + 100, { duration, easing: Easing.out(Easing.quad) })
    );
    translateX.value = withDelay(
      index * 30,
      withSequence(
        withTiming(30, { duration: duration / 4 }),
        withTiming(-30, { duration: duration / 4 }),
        withTiming(30, { duration: duration / 4 }),
        withTiming(-30, { duration: duration / 4 })
      )
    );
    rotate.value = withDelay(
      index * 30,
      withTiming(360 * 3, { duration })
    );
    scale.value = withDelay(
      index * 30 + duration * 0.7,
      withTiming(0, { duration: 300 })
    );
    // Run once per particle; randomized start/duration are intentionally fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    left: startX,
  }));

  const size = 8 + Math.random() * 8;

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          backgroundColor: color,
          width: size,
          height: size,
          borderRadius: Math.random() > 0.5 ? size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    top: -20,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: SCREEN_WIDTH - 48,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  trophy: {
    fontSize: 56,
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  liftName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    opacity: 0.8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  statDivider: {
    fontSize: 28,
    marginHorizontal: 16,
    opacity: 0.4,
  },
  e1rmContainer: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  e1rmLabel: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 4,
  },
  e1rmValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  improvementBadge: {
    backgroundColor: '#34C75920',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  improvementText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  tapToDismiss: {
    marginTop: 20,
    fontSize: 13,
    opacity: 0.4,
  },
});
