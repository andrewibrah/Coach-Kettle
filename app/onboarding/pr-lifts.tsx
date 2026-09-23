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
import { ONBOARDING_ROUTES, resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
import { fetchTrackedLifts } from '@/lib/profile';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 6;

export default function PRLiftsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { draft, draftLoading, updateDraft } = useOnboarding();

  // Initialize from draft
  const [lifts, setLifts] = useState<string[]>(draft.tracked_lifts || []);
  const liftsRef = useRef(lifts);
  const prValuesRef = useRef(draft.pr_values ?? []);
  const writeQueue = useRef(Promise.resolve());
  const finishing = useRef(false);
  const fallbackGeneration = useRef(0);

  // A hydrated draft, including an explicit empty selection, takes precedence.
  useEffect(() => {
    // Once edited locally, delayed draft echoes must not replace newer refs.
    if (draftLoading || fallbackGeneration.current > 0) return;
    prValuesRef.current = draft.pr_values ?? [];
    if (draft.tracked_lifts !== undefined) {
      liftsRef.current = draft.tracked_lifts;
      setLifts(liftsRef.current);
      return;
    }

    let active = true;
    const generation = fallbackGeneration.current;
    liftsRef.current = [];
    setLifts(liftsRef.current);
    const userId = session?.user?.id;
    if (userId) {
      fetchTrackedLifts(userId)
        .then((tracked) => {
          if (active && generation === fallbackGeneration.current) {
            liftsRef.current = tracked.map((lift) => lift.lift_name);
            setLifts(liftsRef.current);
          }
        })
        .catch((err) => {
          if (active && generation === fallbackGeneration.current) {
            console.error('Error loading lifts:', err);
          }
        });
    }
    return () => { active = false; };
  }, [draftLoading, session?.user?.id, draft.tracked_lifts, draft.pr_values]);

  // Keep the queue usable after failures, while returning rejection to callers.
  const enqueueWrite = (write: () => Promise<void>) => {
    const pending = writeQueue.current.then(write);
    writeQueue.current = pending.catch(() => {});
    return pending;
  };

  const reportWriteError = (error: unknown) => {
    console.error('Error saving lifts:', error);
    Alert.alert('Unable to save lifts', 'Please try again before continuing.');
  };

  const persistSelection = () => {
    const tracked_lifts = liftsRef.current;
    const pr_values = prValuesRef.current;
    void enqueueWrite(() => updateDraft({ tracked_lifts, pr_values })).catch(reportWriteError);
  };

  const handleAddLift = (liftName: string) => {
    if (draftLoading || finishing.current) return;
    fallbackGeneration.current += 1;
    if (!liftsRef.current.some((l) => l.toLowerCase() === liftName.toLowerCase())) {
      liftsRef.current = [...liftsRef.current, liftName];
      setLifts(liftsRef.current);
      persistSelection();
    }
  };

  const handleRemoveLift = (liftName: string) => {
    if (draftLoading || finishing.current) return;
    fallbackGeneration.current += 1;
    liftsRef.current = liftsRef.current.filter((lift) => lift.toLowerCase() !== liftName.toLowerCase());
    prValuesRef.current = prValuesRef.current.filter(
      (pr) => pr.lift_name.toLowerCase() !== liftName.toLowerCase()
    );
    setLifts(liftsRef.current);
    persistSelection();
  };

  const finish = async (skip: boolean) => {
    if (draftLoading || finishing.current) return;
    finishing.current = true;
    fallbackGeneration.current += 1;
    if (skip) liftsRef.current = [];
    prValuesRef.current = prValuesRef.current.filter(
      (pr) => liftsRef.current.some((lift) => lift.toLowerCase() === pr.lift_name.toLowerCase())
    );
    setLifts(liftsRef.current);
    try {
      // This final authoritative snapshot is persisted after all earlier edits.
      await enqueueWrite(() => updateDraft({
        tracked_lifts: liftsRef.current,
        pr_values: prValuesRef.current,
        current_step: CURRENT_STEP,
      }));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      router.push(liftsRef.current.length > 0 ? ONBOARDING_ROUTES[6] : ONBOARDING_ROUTES[7]);
    } catch (error) {
      reportWriteError(error);
    } finally {
      finishing.current = false;
    }
  };

  const handleContinue = () => finish(false);
  const handleSkip = () => finish(true);

  // Filter out already added lifts from suggestions
  const availableSuggestions = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'].filter(
    (s) => !lifts.some((l) => l.toLowerCase() === s.toLowerCase())
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => { if (!draftLoading) router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/pr-lifts')); }} />

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

