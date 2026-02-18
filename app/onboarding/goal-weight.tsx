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
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 4;

export default function GoalWeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { draft, updateDraft } = useOnboarding();

  // Inherit unit from current weight step (draft first, then profile)
  const inheritedUnit = draft.weight_unit ?? profile?.weight_unit ?? 'lb';
  const initialGoalWeight = draft.goal_weight ?? profile?.goal_weight;

  const [value, setValue] = useState(initialGoalWeight?.toString() || '');
  const [unit, setUnit] = useState<string>(inheritedUnit);
  const [error, setError] = useState('');

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

    // Save to draft (local) - no API call, instant navigation
    await updateDraft({
      goal_weight: value.trim() ? parseFloat(value) : null,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/focus' as any);
  };

  const handleSkip = async () => {
    await updateDraft({ current_step: CURRENT_STEP });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/focus' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/current-weight' as any)} />

      <QuizContainer
        animationKey="goal-weight"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={!!error}
          />
        }
      >
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
