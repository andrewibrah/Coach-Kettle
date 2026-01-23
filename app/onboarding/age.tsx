import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import {
  QuizProgress,
  QuizContainer,
  QuizQuestion,
  QuizButtonGroup,
} from '@/components/onboarding';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 2;

export default function AgeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  const initialDate = profile?.dob ? new Date(profile.dob) : new Date(2000, 0, 1);
  const [date, setDate] = useState(initialDate);
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [hasSelected, setHasSelected] = useState(!!profile?.dob);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateAge = (dob: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  const validateAge = (): boolean => {
    if (!hasSelected) return true;

    const age = calculateAge(date);
    if (age < 13) {
      setError('You must be at least 13 years old');
      return false;
    }
    if (age > 120) {
      setError('Please enter a valid date of birth');
      return false;
    }

    setError('');
    return true;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      setDate(selectedDate);
      setHasSelected(true);
      setError('');
    }
  };

  const handleContinue = async () => {
    if (!validateAge()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    try {
      if (hasSelected) {
        await updateProfile({
          dob: date.toISOString().split('T')[0],
        });
      }
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/current-weight' as any);
    } catch (err) {
      console.error('Error saving age:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/current-weight' as any);
  };

  const age = hasSelected ? calculateAge(date) : null;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} />

      <QuizContainer animationKey="age">
        <QuizQuestion
          question="When were you born?"
          subtitle="Your age helps personalize workout recommendations"
        />

        <View style={styles.dateContainer}>
          {Platform.OS === 'android' && !showPicker && (
            <TouchableOpacity
              style={[
                styles.dateButton,
                { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f5f5f5' },
              ]}
              onPress={() => setShowPicker(true)}
            >
              <ThemedText style={styles.dateButtonText}>
                {hasSelected ? date.toLocaleDateString() : 'Select date of birth'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {showPicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
            />
          )}

          {hasSelected && age !== null && (
            <View style={styles.ageDisplay}>
              <ThemedText style={styles.ageText}>{age} years old</ThemedText>
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </View>

        <QuizButtonGroup
          onSkip={handleSkip}
          onContinue={handleContinue}
          continueDisabled={!!error}
          continueLoading={loading}
        />
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dateContainer: {
    marginBottom: 24,
  },
  dateButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  dateButtonText: {
    fontSize: 18,
    textAlign: 'center',
  },
  ageDisplay: {
    marginTop: 16,
    alignItems: 'center',
  },
  ageText: {
    fontSize: 20,
    fontWeight: '600',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
