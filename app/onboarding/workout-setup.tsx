import { useAuth } from '@/components/AuthProvider';
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
import { Colors } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addTemplateItem, createWorkoutTemplate } from '@/lib/profile';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 8;

type Step = 'initial' | 'name' | 'lifts' | 'addMore';

interface WorkoutLift {
  name: string;
  sets: string;
  reps: string;
}

export default function WorkoutSetupScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { session } = useAuth();
  const { updateOnboardingStep, completeOnboarding } = useProfile();

  const [step, setStep] = useState<Step>('initial');
  const [workoutName, setWorkoutName] = useState('');
  const [currentLift, setCurrentLift] = useState<WorkoutLift>({ name: '', sets: '3', reps: '10' });
  const [lifts, setLifts] = useState<WorkoutLift[]>([]);
  const [savedWorkouts, setSavedWorkouts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleYes = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('name');
  };

  const handleNo = async () => {
    await finishOnboarding();
  };

  const handleNameContinue = () => {
    if (workoutName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep('lifts');
    }
  };

  const handleAddLift = () => {
    if (currentLift.name.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (editingIndex !== null) {
        // Update existing lift
        const updated = [...lifts];
        updated[editingIndex] = currentLift;
        setLifts(updated);
        setEditingIndex(null);
      } else {
        // Add new lift
        setLifts([...lifts, currentLift]);
      }
      setCurrentLift({ name: '', sets: '3', reps: '10' });
    }
  };

  const handleEditLift = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentLift(lifts[index]);
    setEditingIndex(index);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setCurrentLift({ name: '', sets: '3', reps: '10' });
  };

  const handleRemoveLift = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLifts(lifts.filter((_, i) => i !== index));
  };

  const handleFinishWorkout = async () => {
    setLoading(true);
    try {
      if (session?.user?.id && workoutName.trim()) {
        // Create workout template
        const template = await createWorkoutTemplate(session.user.id, workoutName);

        if (template) {
          // Add all lifts to template with display_order
          for (let i = 0; i < lifts.length; i++) {
            const lift = lifts[i];
            const result = await addTemplateItem(
              session.user.id,
              template.id,
              lift.name,
              lift.sets ? parseInt(lift.sets, 10) : 3,
              lift.reps ? parseInt(lift.reps, 10) : 10,
              undefined, // No weight during onboarding
              undefined, // No notes
              i          // display_order
            );
            
            if (!result) {
              throw new Error(`Failed to add exercise: ${lift.name}`);
            }
          }
          
          setSavedWorkouts([...savedWorkouts, workoutName]);
        } else {
          throw new Error('Failed to create workout template');
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep('addMore');
    } catch (err) {
      console.error('Error saving workout:', err);
      Alert.alert(
        'Save Failed',
        'Could not save your workout routine. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnother = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkoutName('');
    setLifts([]);
    setCurrentLift({ name: '', sets: '3', reps: '10' });
    setEditingIndex(null);
    setStep('name');
  };

  const finishOnboarding = async () => {
    setLoading(true);
    try {
      await updateOnboardingStep(CURRENT_STEP);
      await completeOnboarding();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/onboarding/complete' as any);
    } catch (err) {
      console.error('Error completing onboarding:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial choice screen
  if (step === 'initial') {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-values' as any)} />
        <QuizContainer animationKey="initial">
          <QuizQuestion
            question="Do you have workout routines you'd like to save?"
            subtitle="Create templates for your regular workouts"
          />

          <View style={styles.choiceButtons}>
            <TouchableOpacity
              style={[styles.choiceButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
              onPress={handleYes}
            >
              <ThemedText style={styles.choiceButtonText}>Yes, let's set them up</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.choiceButton,
                { backgroundColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' },
              ]}
              onPress={handleNo}
              disabled={loading}
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
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-values' as any)} />
        <QuizContainer
          animationKey="name"
          footer={
            <QuizButtonGroup
              onSkip={finishOnboarding}
              onContinue={handleNameContinue}
              continueDisabled={!workoutName.trim()}
              continueLoading={loading}
            />
          }
        >
          <QuizQuestion question="Name this workout" subtitle="e.g., Push Day, Leg Day, Full Body" />

          <View style={styles.inputContainer}>
            <QuizInput
              value={workoutName}
              onChangeText={setWorkoutName}
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
        <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-values' as any)} />
        <QuizContainer
          animationKey="lifts"
          footer={
            <QuizButtonGroup
              onSkip={finishOnboarding}
              onContinue={handleFinishWorkout}
              continueDisabled={lifts.length === 0}
              continueLoading={loading}
              continueLabel="Save Workout"
            />
          }
        >
          <View style={styles.questionWithBadge}>
            <QuizQuestion question={`Add lifts to "${workoutName}"`} subtitle="Build your workout one exercise at a time" />
            {lifts.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}>
                <ThemedText style={styles.countBadgeText}>{lifts.length}</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.liftInputs}>
            <QuizInput
              value={currentLift.name}
              onChangeText={(text) => setCurrentLift({ ...currentLift, name: text })}
              placeholder="Exercise name..."
            />
            <View style={styles.setsRepsRow}>
              <View style={styles.smallInput}>
                <ThemedText style={styles.smallLabel}>Sets</ThemedText>
                <QuizInput
                  value={currentLift.sets}
                  onChangeText={(text) => setCurrentLift({ ...currentLift, sets: text })}
                  placeholder="3"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.smallInput}>
                <ThemedText style={styles.smallLabel}>Reps</ThemedText>
                <QuizInput
                  value={currentLift.reps}
                  onChangeText={(text) => setCurrentLift({ ...currentLift, reps: text })}
                  placeholder="10"
                  keyboardType="numeric"
                />
              </View>
              {editingIndex !== null ? (
                <TouchableOpacity
                  style={[
                    styles.addLiftButton,
                    { backgroundColor: colorScheme === 'dark' ? '#444' : '#ccc' },
                  ]}
                  onPress={handleCancelEdit}
                >
                  <IconSymbol name="xmark" size={20} color={colorScheme === 'dark' ? '#fff' : '#333'} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.addLiftButton,
                  { backgroundColor: Colors[colorScheme ?? 'light'].tint },
                  !currentLift.name.trim() && styles.addLiftButtonDisabled,
                ]}
                onPress={handleAddLift}
                disabled={!currentLift.name.trim()}
              >
                <IconSymbol name={editingIndex !== null ? "checkmark" : "plus"} size={20} color="#fff" />
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
                    style={[
                      styles.liftItem,
                      { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f5f5f5' },
                      editingIndex === index && { borderColor: Colors[colorScheme ?? 'light'].tint, borderWidth: 2 },
                    ]}
                  >
                    <View style={styles.liftInfo}>
                      <ThemedText style={styles.liftName}>{lift.name}</ThemedText>
                      {(lift.sets || lift.reps) && (
                        <ThemedText style={styles.liftDetails}>
                          {lift.sets && `${lift.sets} sets`}
                          {lift.sets && lift.reps && ' × '}
                          {lift.reps && `${lift.reps} reps`}
                        </ThemedText>
                      )}
                    </View>
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleRemoveLift(index);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <IconSymbol
                        name="xmark.circle.fill"
                        size={22}
                        color={colorScheme === 'dark' ? '#666' : '#999'}
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
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/pr-values' as any)} />
      <QuizContainer animationKey="addMore">
        <QuizQuestion
          question="Workout saved!"
          subtitle={`You've created ${savedWorkouts.length} workout${savedWorkouts.length > 1 ? 's' : ''}`}
        />

        <View style={styles.savedList}>
          {savedWorkouts.map((name) => (
            <View
              key={name}
              style={[
                styles.savedItem,
                { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f5f5f5' },
              ]}
            >
              <IconSymbol name="checkmark.circle.fill" size={20} color={Colors[colorScheme ?? 'light'].tint} />
              <ThemedText style={styles.savedName}>{name}</ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.choiceButtons}>
          <TouchableOpacity
            style={[styles.choiceButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={handleAddAnother}
          >
            <ThemedText style={styles.choiceButtonText}>Add another workout</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.choiceButton,
              { backgroundColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' },
            ]}
            onPress={finishOnboarding}
            disabled={loading}
          >
            <ThemedText style={styles.choiceButtonTextSecondary}>
              {loading ? 'Finishing...' : "I'm done"}
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
    color: '#fff',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
