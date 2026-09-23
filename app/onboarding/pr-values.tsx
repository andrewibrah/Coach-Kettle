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
import { useThemeColor } from '@/hooks/useThemeColor';
import { resolvePreviousOnboardingRoute } from '@/lib/onboardingNavigation';
import { estimatedOneRepMax, validatePRPair } from '@/lib/onboardingValidation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 7;
const EMPTY_LIFTS: string[] = [];

export default function PRValuesScreen() {
  const insets = useSafeAreaInsets();
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const { draft, draftLoading, draftSaving, updateDraft } = useOnboarding();

  // Get tracked lifts from draft
  const trackedLifts = draft.tracked_lifts || EMPTY_LIFTS;
  const [currentLiftIndex, setCurrentLiftIndex] = useState(0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  const [errors, setErrors] = useState<{ weight?: string; reps?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const submitGuard = useRef(false);
  const redirected = useRef(false);
  const cleanupPending = useRef(false);
  const cleanupRequired = useRef(false);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const replacement = useRef(0);
  const liftListVersion = useRef(0);
  const liftListKey = JSON.stringify(trackedLifts);
  useEffect(() => {
    // Navigation captures the list position and final-lift status, not just PR content.
    replacement.current += 1;
    liftListVersion.current += 1;
    setSubmitting(false);
  }, [trackedLifts, liftListKey]);
  const loadedContent = useRef<string | undefined>(undefined);
  const previousLifts = useRef(trackedLifts);
  const previousLift = previousLifts.current[currentLiftIndex];
  const reconciledIndex = previousLifts.current === trackedLifts
    ? Math.min(currentLiftIndex, Math.max(0, trackedLifts.length - 1))
    : Math.max(0, trackedLifts.indexOf(previousLift));
  useEffect(() => {
    previousLifts.current = trackedLifts;
    setCurrentLiftIndex(reconciledIndex);
  }, [trackedLifts, reconciledIndex]);
  const eligibility = useRef(false);
  eligibility.current = !draftLoading && trackedLifts.length === 0;
  const cleanupOperation = useRef(0);
  useEffect(() => {
    if (trackedLifts.length) cleanupOperation.current += 1;
  }, [trackedLifts]);
  const busy = submitting || draftSaving || draftLoading;
  const currentLift = trackedLifts[reconciledIndex];
  const isLastLift = reconciledIndex >= trackedLifts.length - 1;
  const parsed = validatePRPair(weight, reps);
  const estimate = parsed.valid && parsed.value ? estimatedOneRepMax(parsed.value) : null;

  const existing = draft.pr_values?.find((pr) => pr.lift_name === currentLift);
  const contentKey = JSON.stringify([currentLift, existing?.weight_lbs, existing?.reps]);
  useEffect(() => {
    if (draftLoading || loadedContent.current === contentKey) return;
    loadedContent.current = contentKey;
    replacement.current += 1;
    setWeight(existing ? String(existing.weight_lbs) : '');
    setReps(existing ? String(existing.reps) : '');
    setErrors({});
  }, [contentKey, draftLoading, existing]);

  const submit = async (action: 'next' | 'back' | 'skip') => {
    if (!mounted.current || submitGuard.current || busy || !currentLift) return;
    const result = validatePRPair(weight, reps);
    setErrors(result.errors);
    if (!result.valid) return;
    if (action === 'skip' && result.value !== null) {
      setErrors({ weight: 'Clear both fields to skip this lift.', reps: 'Clear both fields to skip this lift.' });
      return;
    }
    const snapshot = (draft.pr_values || []).filter(
      (pr) => trackedLifts.includes(pr.lift_name) && pr.lift_name !== currentLift
    );
    if (result.value) snapshot.push({ lift_name: currentLift, weight_lbs: result.value.weight, reps: result.value.reps });
    // Recognize our optimistic echo without normalizing the user's input text.
    loadedContent.current = JSON.stringify([currentLift, result.value?.weight, result.value?.reps]);
    const version = replacement.current;
    const listVersion = liftListVersion.current;
    submitGuard.current = true;
    setSubmitting(true);
    try {
      await updateDraft({ pr_values: snapshot, ...(action !== 'back' && isLastLift ? { current_step: CURRENT_STEP } : {}) });
    } catch {
      if (mounted.current && version === replacement.current) Alert.alert('Could not save PR', 'Please try again.');
      return;
    } finally {
      submitGuard.current = false;
      if (mounted.current && listVersion === liftListVersion.current) setSubmitting(false);
    }
    if (!mounted.current || version !== replacement.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === 'back') {
      if (reconciledIndex > 0) setCurrentLiftIndex(reconciledIndex - 1);
      else router.dismissTo(resolvePreviousOnboardingRoute('/onboarding/pr-values'));
    } else if (isLastLift) router.push('/onboarding/workout-setup');
    else setCurrentLiftIndex(reconciledIndex + 1);
  };

  useEffect(() => {
    if (draftLoading || draftSaving || trackedLifts.length !== 0 || redirected.current || cleanupPending.current || cleanupFailed) return;
    const redirect = async () => {
      cleanupPending.current = true;
      const operation = cleanupOperation.current;
      const isCurrent = () => mounted.current && eligibility.current && operation === cleanupOperation.current;
      // The context retains optimistic updates on failure, so retry must persist again.
      cleanupRequired.current ||= Boolean(draft.pr_values?.length);
      try {
        if (cleanupRequired.current) await updateDraft({ pr_values: [] });
      } catch {
        if (!isCurrent()) return;
        setCleanupFailed(true);
        Alert.alert('Could not save PRs', 'Please try again.', [
          { text: 'Retry', onPress: () => { if (isCurrent()) setCleanupFailed(false); } },
        ]);
        return;
      } finally {
        cleanupPending.current = false;
      }
      if (!isCurrent()) return;
      cleanupRequired.current = false;
      redirected.current = true;
      router.replace('/onboarding/workout-setup');
    };
    void redirect();
  }, [draftLoading, draftSaving, trackedLifts.length, draft.pr_values, updateDraft, cleanupFailed]);

  if (draftLoading || trackedLifts.length === 0) {
    return <ThemedView style={[styles.container, { paddingTop: insets.top }]} />;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => submit('back')} />

      <QuizContainer
        animationKey={`pr-value-${currentLiftIndex}`}
        footer={
          <QuizButtonGroup
            onSkip={() => submit('skip')}
            onContinue={() => submit('next')}
            continueDisabled={busy}
            skipDisabled={busy}
            continueLoading={submitting || draftSaving}
            continueLabel={isLastLift ? 'Finish PRs' : 'Next Lift'}
          />
        }
      >
        <QuizQuestion
          question={`What's your current ${currentLift} PR?`}
          subtitle={`Lift ${reconciledIndex + 1} of ${trackedLifts.length}`}
        />

        <View style={styles.inputsContainer}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Weight (lbs)</ThemedText>
            <QuizInput
              value={weight}
              error={errors.weight}
              onChangeText={(text) => { if (submitGuard.current || busy) return; setWeight(text); setErrors((previous) => ({ ...previous, weight: undefined })); }}
              placeholder="225"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Reps</ThemedText>
            <QuizInput
              value={reps}
              error={errors.reps}
              onChangeText={(text) => { if (submitGuard.current || busy) return; setReps(text); setErrors((previous) => ({ ...previous, reps: undefined })); }}
              placeholder="5"
              keyboardType="numeric"
            />
          </View>
        </View>

        {estimate !== null && (
          <View
            style={[
              styles.e1rmPreview,
              { backgroundColor: secondaryBg },
            ]}
          >
            <ThemedText style={styles.e1rmLabel}>Estimated 1RM</ThemedText>
            <ThemedText style={styles.e1rmValue}>
              {Math.round(estimate)} lbs
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
