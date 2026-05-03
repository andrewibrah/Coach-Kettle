import { useAuth } from '@/contexts/AuthProvider';
import {
  QuizButtonGroup,
  QuizLiftAdder,
  QuizLiftList,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { fetchTrackedLifts } from '@/lib/profile';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 6;

export default function PRLiftsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { draft, updateDraft } = useOnboarding();

  // Initialize from draft
  const [lifts, setLifts] = useState<string[]>(draft.tracked_lifts || []);

  // Load any previously selected lifts from DB if not in draft
  useEffect(() => {
    const loadLifts = async () => {
      // If we already have draft lifts, use those
      if (draft.tracked_lifts && draft.tracked_lifts.length > 0) {
        setLifts(draft.tracked_lifts);
        return;
      }

      // Otherwise fetch from DB (for users resuming after previous sessions)
      try {
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
  }, [session?.user?.id, draft.tracked_lifts]);

  const handleAddLift = (liftName: string) => {
    if (!lifts.some((l) => l.toLowerCase() === liftName.toLowerCase())) {
      const updated = [...lifts, liftName];
      setLifts(updated);
      // Also update draft so it persists if user navigates away
      updateDraft({ tracked_lifts: updated });
    }
  };

  const handleRemoveLift = (liftName: string) => {
    const updated = lifts.filter((l) => l !== liftName);
    setLifts(updated);
    // Also update draft
    updateDraft({ tracked_lifts: updated });
  };

  const handleContinue = async () => {
    // Save lifts to draft (local) - no API call, instant navigation
    await updateDraft({
      tracked_lifts: lifts,
      current_step: CURRENT_STEP,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If lifts were added, go to pr-values to enter current PRs
    if (lifts.length > 0) {
      router.push('/onboarding/pr-values' as any);
    } else {
      router.push('/onboarding/workout-setup' as any);
    }
  };

  const handleSkip = async () => {
    // Clear tracked lifts and update step
    await updateDraft({
      tracked_lifts: [],
      current_step: CURRENT_STEP,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/workout-setup' as any);
  };

  // Filter out already added lifts from suggestions
  const availableSuggestions = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'].filter(
    (s) => !lifts.some((l) => l.toLowerCase() === s.toLowerCase())
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/focus' as any)} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.questionSection}>
          <QuizQuestion
            question="Which lifts do you want to track PRs for?"
            subtitle="We'll automatically detect when you beat your personal records"
          />

          <QuizLiftAdder
            onAdd={handleAddLift}
            placeholder="Add a lift..."
            suggestions={availableSuggestions}
          />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <QuizLiftList lifts={lifts} onRemove={handleRemoveLift} />
        </ScrollView>

        <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 16 }]}>
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueLabel={lifts.length > 0 ? 'Continue' : 'Skip PR Tracking'}
          />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  questionSection: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  scrollView: {
    flex: 1,
    marginTop: 20,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
});

