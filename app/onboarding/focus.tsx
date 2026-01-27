import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizOptionList,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedView } from '@/components/ui/themed-view';
import { useProfile } from '@/contexts/ProfileContext';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 5;

const FOCUS_OPTIONS = [
  {
    label: 'Build Strength',
    value: 'strength',
    icon: 'dumbbell.fill',
    description: 'Maximize your lifting power',
  },
  {
    label: 'Lean Muscle',
    value: 'lean_muscle',
    icon: 'figure.strengthtraining.traditional',
    description: 'Build muscle while staying lean',
  },
  {
    label: 'Fat Loss',
    value: 'fat_loss',
    icon: 'flame.fill',
    description: 'Burn fat and improve definition',
  },
  {
    label: 'Other',
    value: 'other',
    icon: 'ellipsis.circle.fill',
    description: 'Something else entirely',
  },
];

export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  const [selected, setSelected] = useState<string | null>(profile?.focus || null);
  const [otherText, setOtherText] = useState(profile?.focus_other || '');
  const [loading, setLoading] = useState(false);

  const handleSelect = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(value);
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      if (selected) {
        await updateProfile({
          focus: selected as any,
          focus_other: selected === 'other' ? otherText : null,
        });
      }
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/pr-lifts' as any);
    } catch (err) {
      console.error('Error saving focus:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/pr-lifts' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/goal-weight' as any)} />

      <QuizContainer
        animationKey="focus"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueLoading={loading}
          />
        }
      >
        <QuizQuestion
          question="What's your fitness focus?"
          subtitle="We'll tailor advice to your goals"
        />

        <View style={styles.optionsContainer}>
          <QuizOptionList
            options={FOCUS_OPTIONS}
            selected={selected}
            onSelect={handleSelect}
          />

          {selected === 'other' && (
            <View style={styles.otherInput}>
              <QuizInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Describe your goal..."
                autoFocus
              />
            </View>
          )}
        </View>
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  optionsContainer: {
    marginBottom: 24,
  },
  otherInput: {
    marginTop: 16,
  },
});
