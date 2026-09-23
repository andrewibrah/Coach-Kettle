import {
  QuizButtonGroup,
  QuizContainer,
  QuizInput,
  QuizProgress,
  QuizQuestion,
} from '@/components/onboarding';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ONBOARDING_ROUTES, resolveWorkoutSetupBack, type WorkoutSetupStep } from '@/lib/onboardingNavigation';
import { validateTemplateLift } from '@/lib/onboardingValidation';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 8;

interface WorkoutLift {
  name: string;
  sets: string;
  reps: string;
}

export default function WorkoutSetupScreen() {
  const insets = useSafeAreaInsets();
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const inputBg = useThemeColor({}, 'inputBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const { draft, draftLoading, draftSaving, updateDraft } = useOnboarding();

  const [step, setStep] = useState<WorkoutSetupStep>('initial');
  const [workoutName, setWorkoutName] = useState('');
  const [currentLift, setCurrentLift] = useState<WorkoutLift>({ name: '', sets: '3', reps: '10' });
  const [lifts, setLifts] = useState<{ name: string; sets: number; reps: number }[]>([]);
  // Track saved workouts locally (will be sent in batch at complete screen)
  const [savedWorkouts, setSavedWorkouts] = useState<{ name: string; lifts: { name: string; sets: number; reps: number }[] }[]>(
    draft.workout_templates || []
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [errors, setErrors] = useState<Partial<Record<keyof WorkoutLift, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const submitGuard = useRef(false);
  const busy = submitting || draftSaving || draftLoading;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const templatesKey = JSON.stringify(draft.workout_templates || []);
  const hydratedContent = useRef(draftLoading ? undefined : templatesKey);
  const replacement = useRef(0);
  useEffect(() => {
    if (draftLoading || hydratedContent.current === templatesKey) return;
    hydratedContent.current = templatesKey;
    replacement.current += 1;
    setSavedWorkouts(draft.workout_templates || []);
  }, [draftLoading, draft.workout_templates, templatesKey]);
  const changeLift = (field: keyof WorkoutLift, text: string) => {
    if (!mounted.current || submitGuard.current || busy) return;
    setCurrentLift((previous) => ({ ...previous, [field]: text }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleBack = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    setErrors({});
    const decision = resolveWorkoutSetupBack(step, draft.tracked_lifts);
    if ('step' in decision) {
      if (step === 'addMore') {
        setWorkoutName('');
        setLifts([]);
        setCurrentLift({ name: '', sets: '3', reps: '10' });
        setEditingIndex(null);
      }
      setStep(decision.step);
    } else {
      router.dismissTo(decision.route);
    }
  };

  const handleYes = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('name');
  };

  const handleNo = async () => {
    await finishOnboarding();
  };

  const handleNameContinue = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    if (workoutName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep('lifts');
    }
  };

  const handleAddLift = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    const result = validateTemplateLift(currentLift.name, currentLift.sets, currentLift.reps);
    setErrors(result.errors);
    if (result.valid) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (editingIndex !== null) {
        // Update existing lift
        const updated = [...lifts];
        updated[editingIndex] = result.value;
        setLifts(updated);
        setEditingIndex(null);
      } else {
        // Add new lift
        setLifts([...lifts, result.value]);
      }
      setCurrentLift({ name: '', sets: '3', reps: '10' });
    }
  };

  const handleEditLift = (index: number) => {
    if (!mounted.current || submitGuard.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setErrors({});
    setCurrentLift({ name: lifts[index].name, sets: String(lifts[index].sets), reps: String(lifts[index].reps) });
    setEditingIndex(index);
  };

  const handleCancelEdit = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    setErrors({});
    setEditingIndex(null);
    setCurrentLift({ name: '', sets: '3', reps: '10' });
  };

  const handleRemoveLift = (index: number) => {
    if (!mounted.current || submitGuard.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLifts(lifts.filter((_, i) => i !== index));
    if (editingIndex === index) handleCancelEdit();
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
  };

  const handleFinishWorkout = async () => {
    if (!mounted.current || submitGuard.current || busy || !workoutName.trim() || lifts.length === 0 || editingIndex !== null) return;
    const updatedWorkouts = [...savedWorkouts, { name: workoutName.trim(), lifts: [...lifts] }];
    const version = replacement.current;
    submitGuard.current = true;
    setSubmitting(true);
    try {
      hydratedContent.current = JSON.stringify(updatedWorkouts);
      await updateDraft({ workout_templates: updatedWorkouts });
      if (!mounted.current || version !== replacement.current) return;
      setSavedWorkouts(updatedWorkouts);
      setStep('addMore');
    } catch {
      if (mounted.current && version === replacement.current) Alert.alert('Could not save workout', 'Please try again.');
    } finally {
      submitGuard.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const handleAddAnother = () => {
    if (!mounted.current || submitGuard.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkoutName('');
    setLifts([]);
    setCurrentLift({ name: '', sets: '3', reps: '10' });
    setEditingIndex(null);
    setStep('name');
  };

  const finishOnboarding = async () => {
    if (!mounted.current || submitGuard.current || busy) return;
    const version = replacement.current;
    submitGuard.current = true;
    setSubmitting(true);
    try {
      await updateDraft({ workout_templates: savedWorkouts, current_step: CURRENT_STEP });
    } catch {
      if (mounted.current && version === replacement.current) Alert.alert('Could not finish setup', 'Please try again.');
      return;
    } finally {
      submitGuard.current = false;
      if (mounted.current) setSubmitting(false);
    }
    if (!mounted.current || version !== replacement.current) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push(ONBOARDING_ROUTES[8]);
  };

  // Initial choice screen
  if (step === 'initial') {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={handleBack} />
        <QuizContainer animationKey="initial">
          <QuizQuestion
            question="Do you have workout routines you'd like to save?"
            subtitle="Create templates for your regular workouts"
          />

          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[styles.choiceButton, { backgroundColor: tint }]}
              onPress={handleYes}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Yes, set up templates"
            >
              <ThemedText style={[styles.choiceButtonText, { color: onTint }]}>Yes, let&apos;s set them up</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.choiceButton,
                { backgroundColor: inputBg },
              ]}
              onPress={handleNo}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Skip for now"
            >
              <ThemedText style={styles.choiceButtonTextSecondary}>Skip for now</ThemedText>
            </TouchableOpacity>
          </View>
        </QuizContainer>
      </ThemedView>
    );
  }

  // Name workout screen
  if (step === 'name') {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={handleBack} />
        <QuizContainer
          animationKey="name"
          footer={
            <QuizButtonGroup
              onSkip={finishOnboarding}
              onContinue={handleNameContinue}
              continueDisabled={busy || !workoutName.trim()}
              skipDisabled={busy}
              continueLoading={submitting || draftSaving}
            />
          }
        >
          <QuizQuestion question="Name this workout" subtitle="e.g., Push Day, Leg Day, Full Body" />

          <View style={styles.inputContainer}>
            <QuizInput
              value={workoutName}
              onChangeText={(text) => { if (!submitGuard.current && !busy) setWorkoutName(text); }}
              placeholder="Workout name..."
              autoFocus
            />
          </View>
        </QuizContainer>
      </ThemedView>
    );
  }

  // Add lifts screen
  if (step === 'lifts') {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={handleBack} />
        <QuizContainer
          animationKey="lifts"
          footer={
            <QuizButtonGroup
              onSkip={finishOnboarding}
              onContinue={handleFinishWorkout}
              continueDisabled={busy || lifts.length === 0 || editingIndex !== null}
              skipDisabled={busy}
              continueLoading={submitting || draftSaving}
              continueLabel="Save Workout"
            />
          }
        >
          <View style={styles.questionWithBadge}>
            <QuizQuestion question={`Add lifts to "${workoutName}"`} subtitle="Build your workout one exercise at a time" />
            {lifts.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: tint }]}>
                <ThemedText style={[styles.countBadgeText, { color: onTint }]}>{lifts.length}</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.liftInputs}>
            <QuizInput
              value={currentLift.name}
              onChangeText={(text) => changeLift('name', text)}
              error={errors.name}
              placeholder="Exercise name..."
            />
            <View style={styles.setsRepsRow}>
              <View style={styles.smallInput}>
                <ThemedText style={styles.smallLabel}>Sets</ThemedText>
                <QuizInput
                  value={currentLift.sets}
                  onChangeText={(text) => changeLift('sets', text)}
                  error={errors.sets}
                  placeholder="3"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.smallInput}>
                <ThemedText style={styles.smallLabel}>Reps</ThemedText>
                <QuizInput
                  value={currentLift.reps}
                  onChangeText={(text) => changeLift('reps', text)}
                  error={errors.reps}
                  placeholder="10"
                  keyboardType="numeric"
                />
              </View>
              {editingIndex !== null ? (
                <TouchableOpacity
                  style={[
                    styles.addLiftButton,
                    { backgroundColor: inputBg },
                  ]}
                  onPress={handleCancelEdit}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel edit"
                >
                  <IconSymbol name="xmark" size={20} color={textColor} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.addLiftButton,
                  { backgroundColor: tint },
                  busy && styles.addLiftButtonDisabled,
                ]}
                onPress={handleAddLift}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={editingIndex !== null ? 'Save exercise' : 'Add exercise'}
              >
                <IconSymbol name={editingIndex !== null ? "checkmark" : "plus"} size={20} color={onTint} />
              </TouchableOpacity>
            </View>
          </View>

          {lifts.length > 0 && (
            <ScrollView
              style={styles.liftsList}
              contentContainerStyle={styles.liftsListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {lifts.map((lift, index) => (
                <Animated.View
                  key={`${lift.name}-${index}`}
                  entering={FadeIn}
                  exiting={FadeOut}
                  layout={Layout.springify()}
                >
                  <TouchableOpacity
                    onPress={() => handleEditLift(index)}
                    disabled={busy}
                    style={[
                      styles.liftItem,
                      { backgroundColor: secondaryBg },
                      editingIndex === index && { borderColor: tint, borderWidth: 2 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${lift.name}`}
                    accessibilityState={{ selected: editingIndex === index, disabled: busy }}
                  >
                    <View style={styles.liftInfo}>
                      <ThemedText style={styles.liftName}>{lift.name}</ThemedText>
                      {(lift.sets || lift.reps) && (
                        <ThemedText style={styles.liftDetails}>
                          {lift.sets && `${lift.sets} ${Number(lift.sets) === 1 ? 'set' : 'sets'}`}
                          {lift.sets && lift.reps && ' × '}
                          {lift.reps && `${lift.reps} ${Number(lift.reps) === 1 ? 'rep' : 'reps'}`}
                        </ThemedText>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleRemoveLift(index);
                      }}
                      disabled={busy}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${lift.name}`}
                    >
                      <IconSymbol
                        name="xmark.circle.fill"
                        size={22}
                        color={placeholder}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </QuizContainer>
      </ThemedView>
    );
  }

  // Add more workouts screen
  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={handleBack} />
      <QuizContainer animationKey="addMore">
        <QuizQuestion
          question="Workout saved!"
          subtitle={`You've created ${savedWorkouts.length} workout${savedWorkouts.length > 1 ? 's' : ''}`}
        />

        <View style={styles.savedList}>
          {savedWorkouts.map((workout, index) => (
            <View
              key={`${workout.name}-${index}`}
              style={[
                styles.savedItem,
                { backgroundColor: secondaryBg },
              ]}
            >
              <IconSymbol name="checkmark.circle.fill" size={20} color={tint} />
              <ThemedText style={styles.savedName}>{workout.name}</ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.choiceButtons}>
          <TouchableOpacity
            style={[styles.choiceButton, { backgroundColor: tint }]}
            onPress={handleAddAnother}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Add another workout"
          >
            <ThemedText style={[styles.choiceButtonText, { color: onTint }]}>Add another workout</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.choiceButton,
              { backgroundColor: inputBg },
            ]}
            onPress={finishOnboarding}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Done, finish setup"
          >
            <ThemedText style={styles.choiceButtonTextSecondary}>
              I&apos;m done
            </ThemedText>
          </TouchableOpacity>
        </View>
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  choiceButtons: {
    gap: 12,
    marginTop: 24,
  },
  choiceButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  choiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  choiceButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 24,
  },
  liftInputs: {
    gap: 12,
    marginBottom: 16,
  },
  setsRepsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  smallInput: {
    flex: 1,
  },
  smallLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
  addLiftButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  addLiftButtonDisabled: {
    opacity: 0.5,
  },
  liftsList: {
    maxHeight: 200,
    marginBottom: 24,
  },
  liftsListContent: {
    gap: 8,
  },
  liftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  liftInfo: {
    flex: 1,
  },
  liftName: {
    fontSize: 16,
    fontWeight: '500',
  },
  liftDetails: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  savedList: {
    gap: 8,
    marginBottom: 24,
  },
  savedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  savedName: {
    fontSize: 16,
    fontWeight: '500',
  },
  questionWithBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
