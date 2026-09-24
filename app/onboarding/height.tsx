import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizProgress,
  QuizQuestion,
  QuizUnitPicker,
} from '@/components/onboarding';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useOnboardingSubmit } from '@/hooks/useOnboardingSubmit';
import { ONBOARDING_ROUTES, resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
import {
  displayHeight,
  heightForStorage,
  heightToCanonical,
  HeightUnit,
  resolveHeightInput,
  switchHeightUnit,
} from '@/lib/onboardingValidation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 1;

export default function HeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { draft } = useOnboarding();
  // One draft write at a time; a failed write keeps the user on this step.
  const { busy, loading, save } = useOnboardingSubmit();

  // Prioritize draft (including an explicit null), then profile
  const fromDraft = draft.height_value !== undefined;
  const storedValue = fromDraft ? draft.height_value : profile?.height_value;
  const storedUnit = (fromDraft ? draft.height_unit : profile?.height_unit) ?? null;
  const initialUnit: HeightUnit = draft.height_unit ?? profile?.height_unit ?? 'in';
  const [unit, setUnit] = useState<HeightUnit>(initialUnit);

  // Unrounded canonical inches; inputs below only display it
  const [canonical, setCanonical] = useState<number | null>(null);

  // Metric State
  const [cmValue, setCmValue] = useState('');

  // Imperial State
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');

  const [error, setError] = useState('');

  // No loading state needed - draft saves are instant

  // Initialize values from draft or profile
  useEffect(() => {
    const value = heightToCanonical(storedValue, storedUnit);
    const shown = displayHeight(value, storedUnit ?? 'in');
    setCanonical(value);
    if (storedUnit) setUnit(storedUnit);
    setCmValue(storedUnit === 'cm' ? shown.value : '');
    setFeet(storedUnit === 'cm' ? '' : shown.feet);
    setInches(storedUnit === 'cm' ? '' : shown.inches);
  }, [storedValue, storedUnit]);

  const inputs = { unit, value: cmValue, feet, inches };
  const firstError = (errors: Partial<Record<'feet' | 'inches' | 'height', string>>) =>
    errors.height ?? errors.feet ?? errors.inches ?? 'Please enter a valid height';

  const handleUnitChange = (next: string) => {
    const newUnit = next as HeightUnit;
    if (newUnit === unit) return;
    const result = switchHeightUnit(inputs, canonical, newUnit);
    if (!result.valid) {
      setError(firstError(result.errors));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setCanonical(result.value.canonical);
    setCmValue(newUnit === 'cm' ? result.value.display.value : '');
    setFeet(newUnit === 'in' ? result.value.display.feet : '');
    setInches(newUnit === 'in' ? result.value.display.inches : '');
    setUnit(newUnit);
    setError('');
  };

  const handleContinue = async () => {
    const result = resolveHeightInput(inputs, canonical);
    if (!result.valid) {
      setError(firstError(result.errors));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Save to draft (local) - no API call, instant navigation
    if (!(await save({
      ...heightForStorage(result.value, unit),
      current_step: CURRENT_STEP,
    }))) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[1]);
  };

  const handleSkip = async () => {
    // Just update step tracking in draft
    if (!(await save({ current_step: CURRENT_STEP }))) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[1]);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress
        currentStep={CURRENT_STEP}
        totalSteps={TOTAL_STEPS}
        onBack={() => router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/height'))}
      />

      <QuizContainer
        animationKey="height"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={busy || !!error}
            skipDisabled={busy}
            continueLoading={loading}
          />
        }
      >
        <QuizQuestion
          question="What's your height?"
          subtitle="This helps us provide more accurate fitness advice"
        />

        <View style={styles.inputContainer}>
          {unit === 'cm' ? (
            <QuizInput
              value={cmValue}
              onChangeText={(t) => {
                setCmValue(t);
                setError('');
              }}
              placeholder="175"
              keyboardType="decimal-pad"
              error={error}
            />
          ) : (
            <View style={styles.imperialContainer}>
              <View style={styles.imperialInput}>
                <QuizInput
                  value={feet}
                  onChangeText={(t) => { setFeet(t); setError(''); }}
                  placeholder="5"
                  keyboardType="numeric"
                  error={error}
                />
                <ThemedView style={styles.unitLabel}><ThemedText style={{ opacity: 0.5 }}>ft</ThemedText></ThemedView>
              </View>
              <View style={styles.imperialInput}>
                <QuizInput
                  value={inches}
                  onChangeText={(t) => { setInches(t); setError(''); }}
                  placeholder="10"
                  keyboardType="numeric"
                  error={error}
                />
                <ThemedView style={styles.unitLabel}><ThemedText style={{ opacity: 0.5 }}>in</ThemedText></ThemedView>
              </View>
            </View>
          )}

          <View style={styles.unitPickerWrapper}>
            <QuizUnitPicker
              options={[
                { label: 'ft / in', value: 'in' },
                { label: 'cm', value: 'cm' },
              ]}
              selected={unit}
              onSelect={handleUnitChange}
            />
          </View>
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
    gap: 24,
  },
  unitPickerWrapper: {
    marginTop: 8,
  },
  imperialContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  imperialInput: {
    flex: 1,
    position: 'relative',
  },
  unitLabel: {
    position: 'absolute',
    right: 16,
    top: 24,
  },
});
