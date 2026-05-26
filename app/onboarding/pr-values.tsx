import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 7;

export default function PRValuesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { draft, updateDraft } = useOnboarding();

  // Get tracked lifts from draft
  const trackedLifts = draft.tracked_lifts || [];
  const [currentLiftIndex, setCurrentLiftIndex] = useState(0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  // Store PR values locally as user enters them
  const [prValues, setPrValues] = useState<{ lift_name: string; weight_lbs: number; reps: number }[]>(
    draft.pr_values || []
  );

  const currentLift = trackedLifts[currentLiftIndex];
  const isLastLift = currentLiftIndex >= trackedLifts.length - 1;

  // Load existing PR value for current lift from draft
  useEffect(() => {
    const existingPR = prValues.find((pr) => pr.lift_name === currentLift);
    if (existingPR) {
      setWeight(existingPR.weight_lbs.toString());
      setReps(existingPR.reps.toString());
    } else {
      setWeight('');
      setReps('');
    }
  }, [currentLiftIndex, currentLift, prValues]);

  const savePRValue = () => {
    // Save current lift's PR if values provided
    if (currentLift && weight.trim() && reps.trim()) {
      const newPR = {
        lift_name: currentLift,
        weight_lbs: parseFloat(weight),
        reps: parseInt(reps, 10),
      };

      // Update or add PR value
      const updatedPRs = prValues.filter((pr) => pr.lift_name !== currentLift);
      updatedPRs.push(newPR);
      setPrValues(updatedPRs);
      return updatedPRs;
    }
    return prValues;
  };

  const handleSaveAndNext = async () => {
    const updatedPRs = savePRValue();

    if (isLastLift) {
      // Done with all lifts - save to draft and navigate
      await updateDraft({
        pr_values: updatedPRs,
        current_step: CURRENT_STEP,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/workout-setup' as any);
    } else {
      // Save current progress to draft and move to next lift
      await updateDraft({ pr_values: updatedPRs });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentLiftIndex(currentLiftIndex + 1);
    }
  };

  const handleSkip = async () => {
    if (isLastLift) {
      // Save whatever we have and move on
      await updateDraft({
        pr_values: prValues,
        current_step: CURRENT_STEP,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/workout-setup' as any);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentLiftIndex(currentLiftIndex + 1);
    }
  };

  // If no lifts to track, skip to next screen
  useEffect(() => {
    if (trackedLifts.length === 0) {
      router.replace('/onboarding/workout-setup' as any);
    }
  }, [trackedLifts.length]);

  if (trackedLifts.length === 0) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-lifts' as any)} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-lifts' as any)} />

      <QuizContainer
        animationKey={`pr-value-${currentLiftIndex}`}
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleSaveAndNext}
            continueLabel={isLastLift ? 'Finish PRs' : 'Next Lift'}
          />
        }
      >
        <QuizQuestion
          question={`What's your current ${currentLift} PR?`}
          subtitle={`Lift ${currentLiftIndex + 1} of ${trackedLifts.length}`}
        />

        <View style={styles.inputsContainer}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Weight (lbs)</ThemedText>
            <QuizInput
              value={weight}
              onChangeText={setWeight}
              placeholder="225"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Reps</ThemedText>
            <QuizInput
              value={reps}
              onChangeText={setReps}
              placeholder="5"
              keyboardType="numeric"
            />
          </View>
        </View>

        {weight && reps && (
          <View
            style={[
              styles.e1rmPreview,
              { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f5f5f5' },
            ]}
          >
            <ThemedText style={styles.e1rmLabel}>Estimated 1RM</ThemedText>
            <ThemedText style={styles.e1rmValue}>
              {Math.round(parseFloat(weight) * (1 + parseInt(reps, 10) / 30))} lbs
            </ThemedText>
          </View>
        )}
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.7,
  },
  e1rmPreview: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  e1rmLabel: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 4,
  },
  e1rmValue: {
    fontSize: 24,
    fontWeight: '700',
  },
});
