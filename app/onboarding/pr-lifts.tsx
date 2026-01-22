import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/ui/themed-view';
import {
  QuizProgress,
  QuizContainer,
  QuizQuestion,
  QuizButtonGroup,
  QuizLiftAdder,
  QuizLiftList,
} from '@/components/onboarding';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/AuthProvider';
import { addTrackedLift, fetchTrackedLifts } from '@/lib/profile';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 6;

const STORAGE_KEY = 'onboarding_pr_lifts';

export default function PRLiftsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { updateOnboardingStep } = useProfile();

  const [lifts, setLifts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load any previously selected lifts
  useEffect(() => {
    const loadLifts = async () => {
      try {
        // First check AsyncStorage for draft
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setLifts(JSON.parse(stored));
          return;
        }

        // Otherwise fetch from DB
        if (session?.user?.id) {
          const tracked = await fetchTrackedLifts(session.user.id);
          if (tracked.length > 0) {
            setLifts(tracked.map((t) => t.lift_name));
          }
        }
      } catch (err) {
        console.error('Error loading lifts:', err);
      }
    };
    loadLifts();
  }, [session?.user?.id]);

  // Save draft to AsyncStorage on changes
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lifts));
  }, [lifts]);

  const handleAddLift = (liftName: string) => {
    if (!lifts.some((l) => l.toLowerCase() === liftName.toLowerCase())) {
      setLifts([...lifts, liftName]);
    }
  };

  const handleRemoveLift = (liftName: string) => {
    setLifts(lifts.filter((l) => l !== liftName));
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      // Save all lifts to database
      if (session?.user?.id && lifts.length > 0) {
        for (const lift of lifts) {
          await addTrackedLift(session.user.id, lift);
        }
      }

      // Clear draft
      await AsyncStorage.removeItem(STORAGE_KEY);

      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // If lifts were added, go to pr-values to enter current PRs
      if (lifts.length > 0) {
        router.push('/onboarding/pr-values' as any);
      } else {
        router.push('/onboarding/workout-setup' as any);
      }
    } catch (err) {
      console.error('Error saving lifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/workout-setup' as any);
  };

  // Filter out already added lifts from suggestions
  const availableSuggestions = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'].filter(
    (s) => !lifts.some((l) => l.toLowerCase() === s.toLowerCase())
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} />

      <QuizContainer animationKey="pr-lifts">
        <QuizQuestion
          question="Which lifts do you want to track PRs for?"
          subtitle="We'll automatically detect when you beat your personal records"
        />

        <View style={styles.content}>
          <QuizLiftAdder
            onAdd={handleAddLift}
            placeholder="Add a lift..."
            suggestions={availableSuggestions}
          />

          <QuizLiftList lifts={lifts} onRemove={handleRemoveLift} />
        </View>

        <QuizButtonGroup
          onSkip={handleSkip}
          onContinue={handleContinue}
          continueLoading={loading}
          continueLabel={lifts.length > 0 ? 'Continue' : 'Skip PR Tracking'}
        />
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    marginBottom: 24,
  },
});
