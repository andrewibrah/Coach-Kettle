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
const CURRENT_STEP = 4;

export default function GoalWeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  // Inherit unit from current weight step
  const inheritedUnit = profile?.weight_unit || 'lb';
  const [value, setValue] = useState(profile?.goal_weight?.toString() || '');
  const [unit, setUnit] = useState<string>(inheritedUnit);
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
          goal_weight: parseFloat(value),
        });
      }
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/focus' as any);
    } catch (err) {
      console.error('Error saving goal weight:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/focus' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} />

      <QuizContainer animationKey="goal-weight">
        <QuizQuestion
          question="What's your goal weight?"
          subtitle="Set a target to work towards"
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
            placeholder={unit === 'lb' ? '170' : '77'}
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
