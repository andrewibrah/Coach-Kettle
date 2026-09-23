import {
  QuizButtonGroup,
  QuizContainer,
  QuizNumberInputWithUnit,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { ONBOARDING_ROUTES, resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
import {
  formatWeight,
  resolveWeightInput,
  resolveWeightState,
  switchWeightUnit,
  WeightUnit,
} from '@/lib/onboardingValidation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 3;

export default function CurrentWeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { draft, updateDraft } = useOnboarding();

  // Draft first (explicit null stays cleared), then profile, in the shared weight unit
  const stored = resolveWeightState(draft, profile);

  const [value, setValue] = useState(formatWeight(stored.current_weight));
  const [unit, setUnit] = useState<WeightUnit>(stored.weight_unit);
  const [error, setError] = useState('');

  // Switching units converts both stored weights and the shared unit together
  const handleUnitChange = async (next: string) => {
    const newUnit = next as WeightUnit;
    if (newUnit === unit) return;
    const result = switchWeightUnit({ ...stored, weight_unit: unit }, 'current_weight', value, newUnit);
    if (!result.valid) {
      setError(result.errors.weight ?? 'Please enter a valid number');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    try {
      await updateDraft(result.value.update);
    } catch {
      setError('Could not save your unit change. Please try again.');
      return;
    }
    setValue(result.value.display);
    setUnit(newUnit);
    setError('');
  };

  const handleContinue = async () => {
    const result = resolveWeightInput(value, stored.weight_unit === unit ? stored.current_weight : null, unit);
    if (!result.valid) {
      setError(result.errors.weight ?? 'Please enter a valid number');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Save to draft (local) - no API call, instant navigation. The shared unit is always
    // written so a stored weight is never left without a unit.
    await updateDraft({
      current_weight: result.value,
      weight_unit: unit,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[3]);
  };

  const handleSkip = async () => {
    await updateDraft({ current_step: CURRENT_STEP });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[3]);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress
        currentStep={CURRENT_STEP}
        totalSteps={TOTAL_STEPS}
        onBack={() => router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/current-weight'))}
      />

      <QuizContainer
        animationKey="current-weight"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={!!error}
          />
        }
      >
        <QuizQuestion
          question="What's your current weight?"
          subtitle="Track your progress over time"
        />

        <View style={styles.inputContainer}>
          <QuizNumberInputWithUnit
            value={value}
            onChangeValue={(text) => {
              setValue(text);
              setError('');
            }}
            unit={unit}
            onChangeUnit={handleUnitChange}
            unitOptions={[
              { label: 'lbs', value: 'lb' },
              { label: 'kg', value: 'kg' },
            ]}
            placeholder={unit === 'lb' ? '180' : '82'}
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
