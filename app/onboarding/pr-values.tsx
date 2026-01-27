import { useAuth } from '@/components/AuthProvider';
import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchTrackedLifts, PRTrackedLift, setPRLift } from '@/lib/profile';
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
  const { session } = useAuth();
  const { updateOnboardingStep } = useProfile();

  const [trackedLifts, setTrackedLifts] = useState<PRTrackedLift[]>([]);
  const [currentLiftIndex, setCurrentLiftIndex] = useState(0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const loadLifts = async () => {
      if (session?.user?.id) {
        try {
          const lifts = await fetchTrackedLifts(session.user.id);
          setTrackedLifts(lifts);
        } catch (err) {
          console.error('Error loading tracked lifts:', err);
        }
      }
      setInitialLoading(false);
    };
    loadLifts();
  }, [session?.user?.id]);

  const currentLift = trackedLifts[currentLiftIndex];
  const isLastLift = currentLiftIndex >= trackedLifts.length - 1;

  const handleSaveAndNext = async () => {
    setLoading(true);
    try {
      // Save current lift's PR if values provided
      if (session?.user?.id && currentLift && weight.trim() && reps.trim()) {
        await setPRLift(
          session.user.id,
          currentLift.lift_name,
          parseFloat(weight),
          parseInt(reps, 10)
        );
      }

      if (isLastLift) {
        // Done with all lifts
        await updateOnboardingStep(CURRENT_STEP);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/onboarding/workout-setup' as any);
      } else {
        // Move to next lift
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentLiftIndex(currentLiftIndex + 1);
        setWeight('');
        setReps('');
      }
    } catch (err) {
      console.error('Error saving PR:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (isLastLift) {
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/workout-setup' as any);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentLiftIndex(currentLiftIndex + 1);
      setWeight('');
      setReps('');
    }
  };

  // If no lifts to track, skip to next screen
  useEffect(() => {
    if (!initialLoading && trackedLifts.length === 0) {
      router.replace('/onboarding/workout-setup' as any);
    }
  }, [initialLoading, trackedLifts.length]);

  if (initialLoading || trackedLifts.length === 0) {
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
            continueLoading={loading}
            continueLabel={isLastLift ? 'Finish PRs' : 'Next Lift'}
            skipDisabled={loading}
          />
        }
      >
        <QuizQuestion
          question={`What's your current ${currentLift?.lift_name} PR?`}
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
