import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { ONBOARDING_ROUTES, resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
import { ageFromApproximateBirthDate, approximateBirthDate, validateAge } from '@/lib/onboardingValidation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 2;

export default function AgeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { draft, updateDraft } = useOnboarding();

  // Calculate generic age from draft or profile DOB; an explicit draft null stays cleared
  const existingDob = draft.dob !== undefined ? draft.dob : profile?.dob;
  const initialAge = ageFromApproximateBirthDate(existingDob, new Date().getFullYear());

  const [age, setAge] = useState(initialAge);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    const result = validateAge(age);
    if (!result.valid) {
      setError(result.errors.age ?? 'Please enter a valid age (13-120)');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Approximate date: Jan 1st of the birth year
    const dob = result.value === null ? null : approximateBirthDate(result.value, new Date().getFullYear());

    // Save to draft (local) - no API call, instant navigation
    await updateDraft({
      dob,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[2]);
  };

  const handleSkip = async () => {
    await updateDraft({ current_step: CURRENT_STEP });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[2]);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress
        currentStep={CURRENT_STEP}
        totalSteps={TOTAL_STEPS}
        onBack={() => router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/age'))}
      />

      <QuizContainer
        animationKey="age"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={!!error}
          />
        }
      >
        <QuizQuestion
          question="How old are you?"
          subtitle="Your age helps personalize workout recommendations"
        />

        <View style={styles.inputContainer}>
          <QuizInput
            value={age}
            onChangeText={(t) => {
              setAge(t);
              setError('');
            }}
            placeholder="25"
            keyboardType="numeric"
            maxLength={3}
            error={error}
          />
        </View>
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 24,
  },
});
