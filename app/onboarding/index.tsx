import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { resolveOnboardingRoute } from '@/lib/onboardingNavigation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const placeholder = useThemeColor({}, 'placeholder');
  const { profile, profileLoading } = useProfile();
  const { draft, draftLoading, skipOnboarding } = useOnboarding();
  const [skipping, setSkipping] = useState(false);
  const loading = draftLoading || profileLoading;

  const handleGetStarted = () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const resumeDraft = draft.current_step === undefined
      ? { ...draft, current_step: profile?.onboarding_step }
      : draft;
    router.push(resolveOnboardingRoute(resumeDraft, profile));
  };

  const handleSkip = async () => {
    setSkipping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await skipOnboarding();

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      console.error('Failed to skip onboarding:', result.error);
      setSkipping(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.content}>
        <ThemedText style={styles.title}>Questions from Coach Kettle</ThemedText>

        <ThemedText style={styles.subtitle}>
          A few quick questions to personalize your experience. You can skip any question and update answers later in settings.
        </ThemedText>

        <View style={styles.timeEstimate}>
          <ThemedText style={styles.timeText}>Takes about 5 minutes</ThemedText>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: tint }, loading && styles.buttonDisabled]}
          onPress={handleGetStarted}
          disabled={loading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Get Started"
        >
          {loading ? (
            <ActivityIndicator size="small" color={onTint} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: onTint }]}>Get Started</ThemedText>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={skipping}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          {skipping ? (
            <ActivityIndicator size="small" color={placeholder} />
          ) : (
            <ThemedText style={[styles.skipButtonText, { color: placeholder }]}>Skip for now</ThemedText>
          )}
        </TouchableOpacity>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    paddingTop: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 24,
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
  button: {
    marginTop: 48,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  skipButton: {
    marginTop: 20,
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
