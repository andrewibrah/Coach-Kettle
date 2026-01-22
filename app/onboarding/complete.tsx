import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const checkScale = useSharedValue(0);
  const confettiOpacity = useSharedValue(0);

  useEffect(() => {
    // Trigger success haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate checkmark
    checkScale.value = withDelay(
      200,
      withSpring(1, { damping: 8, stiffness: 100 })
    );

    // Animate confetti
    confettiOpacity.value = withDelay(
      400,
      withSequence(
        withTiming(1, { duration: 300 }),
        withDelay(2000, withTiming(0, { duration: 500 }))
      )
    );

    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/(tabs)' as any);
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const confettiAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confettiOpacity.value,
  }));

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      {/* Confetti background */}
      <Animated.View style={[styles.confettiContainer, confettiAnimatedStyle]}>
        {[...Array(20)].map((_, i) => (
          <ConfettiPiece key={i} index={i} colorScheme={colorScheme} />
        ))}
      </Animated.View>

      <View style={styles.content}>
        <Animated.View style={[styles.checkContainer, checkAnimatedStyle]}>
          <View
            style={[
              styles.checkCircle,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint },
            ]}
          >
            <IconSymbol name="checkmark" size={48} color="#fff" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(600)}>
          <ThemedText style={styles.title}>You're all set!</ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(800)}>
          <ThemedText style={styles.subtitle}>
            Your profile is ready. Start tracking your workouts and crushing PRs!
          </ThemedText>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInUp.duration(600).delay(1000)} style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.buttonText}>Let's Go!</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </ThemedView>
  );
}

interface ConfettiPieceProps {
  index: number;
  colorScheme: 'light' | 'dark' | null;
}

function ConfettiPiece({ index, colorScheme }: ConfettiPieceProps) {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96c93d', '#f9ca24', '#a55eea'];
  const color = colors[index % colors.length];

  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  const startX = Math.random() * 400 - 50;
  const endX = startX + (Math.random() * 100 - 50);

  useEffect(() => {
    translateY.value = withDelay(
      index * 50,
      withTiming(800, { duration: 2500 })
    );
    translateX.value = withDelay(
      index * 50,
      withSequence(
        withTiming(endX - startX, { duration: 1250 }),
        withTiming(startX - endX, { duration: 1250 })
      )
    );
    rotate.value = withDelay(
      index * 50,
      withRepeat(withTiming(360, { duration: 1000 }), -1)
    );
    opacity.value = withDelay(
      1500 + index * 50,
      withTiming(0, { duration: 500 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
    left: startX,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkContainer: {
    marginBottom: 32,
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    paddingHorizontal: 20,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
