import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { profile } = useProfile();

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Resume from where user left off if they previously started
    const step = profile?.onboarding_step || 0;
    const routes = ['height', 'age', 'current-weight', 'goal-weight', 'focus', 'pr-lifts', 'pr-values', 'workout-setup'];

    if (step > 0 && step < routes.length) {
      router.push(`/onboarding/${routes[step]}` as any);
    } else {
      router.push('/onboarding/height' as any);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <ThemedText style={styles.emoji}>💪</ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(400)}>
          <ThemedText style={styles.title}>Let's get to know you</ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(600)}>
          <ThemedText style={styles.subtitle}>
            A few quick questions to personalize your experience. You can skip any question and update answers later in settings.
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(800)} style={styles.timeEstimate}>
          <ThemedText style={styles.timeText}>Takes about 5 minutes</ThemedText>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInUp.duration(600).delay(1000)} style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={handleGetStarted}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.buttonText}>Get Started</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
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
  timeEstimate: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  timeText: {
    fontSize: 14,
    opacity: 0.6,
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
