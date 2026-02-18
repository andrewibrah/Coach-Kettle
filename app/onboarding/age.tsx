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

  // Calculate generic age from draft or profile DOB
  const existingDob = draft.dob ?? profile?.dob;
  const initialAge = existingDob
    ? (new Date().getFullYear() - new Date(existingDob).getFullYear()).toString()
    : '';

  const [age, setAge] = useState(initialAge);
  const [error, setError] = useState('');

  const validateAge = (): boolean => {
    if (!age.trim()) return true; // Empty is valid (skip)

    const val = parseInt(age, 10);
    if (isNaN(val) || val < 13 || val > 120) {
      setError('Please enter a valid age (13-120)');
      return false;
    }

    setError('');
    return true;
  };

  const handleContinue = async () => {
    if (!validateAge()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    let dob: string | null = null;

    if (age.trim()) {
      const ageNum = parseInt(age, 10);
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - ageNum;
      // Set to approx date: Jan 1st of that year
      dob = `${birthYear}-01-01`;
    }

    // Save to draft (local) - no API call, instant navigation
    await updateDraft({
      dob,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/current-weight' as any);
  };

  const handleSkip = async () => {
    await updateDraft({ current_step: CURRENT_STEP });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/current-weight' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/height' as any)} />

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
