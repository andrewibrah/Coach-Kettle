import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizOptionList,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useOnboardingSubmit } from '@/hooks/useOnboardingSubmit';
import { ONBOARDING_ROUTES, resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
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
  const { profile } = useProfile();
  const { draft } = useOnboarding();
  // One draft write at a time; a failed write keeps the user on this step.
  const { busy, loading, save } = useOnboardingSubmit();

  // Prioritize draft over profile
  const initialFocus = draft.focus ?? profile?.focus ?? null;
  const initialOther = draft.focus_other ?? profile?.focus_other ?? '';

  const [selected, setSelected] = useState<string | null>(initialFocus);
  const [otherText, setOtherText] = useState(initialOther);

  const handleSelect = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(value);
  };

  const handleContinue = async () => {
    // Save to draft (local) - no API call, instant navigation
    if (!(await save({
      focus: selected ? (selected as 'strength' | 'lean_muscle' | 'fat_loss' | 'other') : null,
      focus_other: selected === 'other' ? otherText : null,
      current_step: CURRENT_STEP,
    }))) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[5]);
  };

  const handleSkip = async () => {
    if (!(await save({ current_step: CURRENT_STEP }))) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ONBOARDING_ROUTES[5]);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress
        currentStep={CURRENT_STEP}
        totalSteps={TOTAL_STEPS}
        onBack={() => router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/focus'))}
      />

      <QuizContainer
        animationKey="focus"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={busy}
            skipDisabled={busy}
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
