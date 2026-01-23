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
const CURRENT_STEP = 3;

export default function CurrentWeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  const [value, setValue] = useState(profile?.current_weight?.toString() || '');
  const [unit, setUnit] = useState<string>(profile?.weight_unit || 'lb');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateWeight = (): boolean => {
    const numValue = parseFloat(value);
    if (!value.trim()) return true;

    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return false;
    }

    if (unit === 'lb') {
      if (numValue < 50 || numValue > 1000) {
        setError('Please enter a weight between 50-1000 lbs');
        return false;
      }
    } else {
      if (numValue < 20 || numValue > 450) {
        setError('Please enter a weight between 20-450 kg');
        return false;
      }
    }

    setError('');
    return true;
  };

  const handleContinue = async () => {
    if (!validateWeight()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    try {
      if (value.trim()) {
        await updateProfile({
          current_weight: parseFloat(value),
          weight_unit: unit as 'lb' | 'kg',
        });
      }
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/goal-weight' as any);
    } catch (err) {
      console.error('Error saving weight:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/goal-weight' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} />

      <QuizContainer animationKey="current-weight">
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
            onChangeUnit={setUnit}
            unitOptions={[
              { label: 'lbs', value: 'lb' },
              { label: 'kg', value: 'kg' },
            ]}
            placeholder={unit === 'lb' ? '180' : '82'}
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
