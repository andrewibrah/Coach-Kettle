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
const CURRENT_STEP = 3;

export default function CurrentWeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { draft, updateDraft } = useOnboarding();

  // Prioritize draft over profile
  const initialWeight = draft.current_weight ?? profile?.current_weight;
  const initialUnit = draft.weight_unit ?? profile?.weight_unit ?? 'lb';

  const [value, setValue] = useState(initialWeight?.toString() || '');
  const [unit, setUnit] = useState<string>(initialUnit);
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
      current_weight: value.trim() ? parseFloat(value) : null,
      weight_unit: value.trim() ? (unit as 'lb' | 'kg') : null,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/goal-weight' as any);
  };

  const handleSkip = async () => {
    await updateDraft({ current_step: CURRENT_STEP });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/goal-weight' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/age' as any)} />

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
            onChangeUnit={setUnit}
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
