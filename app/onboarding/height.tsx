import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import {
  QuizProgress,
  QuizContainer,
  QuizQuestion,
  QuizButtonGroup,
  QuizNumberInputWithUnit,
} from '@/components/onboarding';
import { useProfile } from '@/contexts/ProfileContext';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 1;

export default function HeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  const [value, setValue] = useState(profile?.height_value?.toString() || '');
  const [unit, setUnit] = useState<string>(profile?.height_unit || 'in');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateHeight = (): boolean => {
    const numValue = parseFloat(value);
    if (!value.trim()) return true; // Empty is valid (will skip)

    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return false;
    }

    if (unit === 'cm') {
      if (numValue < 50 || numValue > 300) {
        setError('Please enter a height between 50-300 cm');
        return false;
      }
    } else {
      if (numValue < 20 || numValue > 120) {
        setError('Please enter a height between 20-120 inches');
        return false;
      }
    }

    setError('');
    return true;
  };

  const handleContinue = async () => {
    if (!validateHeight()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    try {
      if (value.trim()) {
        await updateProfile({
          height_value: parseFloat(value),
          height_unit: unit as 'cm' | 'in',
        });
      }
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/age' as any);
    } catch (err) {
      console.error('Error saving height:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/age' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} />

      <QuizContainer animationKey="height">
        <QuizQuestion
          question="What's your height?"
          subtitle="This helps us provide more accurate fitness advice"
        />

        <View style={styles.inputContainer}>
          <QuizNumberInputWithUnit
            value={value}
            onChangeValue={(text) => {
              setValue(text);
              setError('');
            }}
            unit={unit}
            onChangeUnit={setUnit}
            unitOptions={[
              { label: 'inches', value: 'in' },
              { label: 'cm', value: 'cm' },
            ]}
            placeholder={unit === 'cm' ? '175' : '69'}
            error={error}
          />
        </View>

        <QuizButtonGroup
          onSkip={handleSkip}
          onContinue={handleContinue}
          continueDisabled={!!error}
          continueLoading={loading}
        />
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
