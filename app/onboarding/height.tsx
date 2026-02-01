
import {
    QuizButtonGroup,
    QuizContainer,
    QuizInput,
    QuizProgress,
    QuizQuestion,
    QuizUnitPicker,
} from '@/components/onboarding';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useProfile } from '@/contexts/ProfileContext';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 8;
const CURRENT_STEP = 1;

export default function HeightScreen() {
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, updateOnboardingStep } = useProfile();

  const [unit, setUnit] = useState<string>(profile?.height_unit || 'in');
  
  // Metric State
  const [cmValue, setCmValue] = useState('');
  
  // Imperial State
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize values
  useEffect(() => {
    if (profile?.height_value) {
      if (profile.height_unit === 'cm') {
        setCmValue(profile.height_value.toString());
      } else {
        const totalInches = profile.height_value;
        setFeet(Math.floor(totalInches / 12).toString());
        setInches(Math.round(totalInches % 12).toString());
      }
    }
  }, [profile]);

  const validateHeight = (): boolean => {
    if (unit === 'cm') {
       if (!cmValue.trim()) return true;
       const val = parseFloat(cmValue);
       if (isNaN(val) || val < 50 || val > 300) {
         setError('Please enter a height between 50-300 cm');
         return false;
       }
    } else {
       if (!feet.trim() && !inches.trim()) return true;
       const ft = parseFloat(feet || '0');
       const inc = parseFloat(inches || '0');
       
       if (isNaN(ft) || isNaN(inc)) {
          setError('Invalid number');
          return false;
       }
       // Total inches check (20 inches ~ 1.6ft, 120 inches ~ 10ft)
       const total = (ft * 12) + inc;
       if (total < 20 || total > 120) {
          setError('Please enter a valid height');
          return false;
       }
    }

    setError('');
    return true;
  };

  const handleContinue = async () => {
    if (!validateHeight()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    try {
      let finalValue = 0;
      let hasData = false;

      if (unit === 'cm') {
        if (cmValue.trim()) {
          finalValue = parseFloat(cmValue);
          hasData = true;
        }
      } else {
        if (feet.trim() || inches.trim()) {
           const ft = parseFloat(feet || '0');
           const inc = parseFloat(inches || '0');
           finalValue = (ft * 12) + inc;
           hasData = true;
        }
      }

      if (hasData) {
        await updateProfile({
          height_value: finalValue,
          height_unit: unit as 'cm' | 'in',
        });
      }
      
      await updateOnboardingStep(CURRENT_STEP);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/onboarding/age' as any);
    } catch (err) {
      console.error('Error saving height:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(CURRENT_STEP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/onboarding/age' as any);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <QuizProgress currentStep={CURRENT_STEP} totalSteps={TOTAL_STEPS} onBack={() => router.push('/onboarding/' as any)} />

      <QuizContainer
        animationKey="height"
        footer={
          <QuizButtonGroup
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={!!error}
            continueLoading={loading}
          />
        }
      >
        <QuizQuestion
          question="What's your height?"
          subtitle="This helps us provide more accurate fitness advice"
        />

        <View style={styles.inputContainer}>
          {unit === 'cm' ? (
             <QuizInput
                value={cmValue}
                onChangeText={(t) => {
                   setCmValue(t);
                   setError('');
                }}
                placeholder="175"
                keyboardType="decimal-pad"
                error={error}
             />
          ) : (
            <View style={styles.imperialContainer}>
               <View style={styles.imperialInput}>
                  <QuizInput
                    value={feet}
                    onChangeText={(t) => { setFeet(t); setError(''); }}
                    placeholder="5"
                    keyboardType="number-pad"
                    error={error}
                  />
                  <ThemedView style={styles.unitLabel}><ThemedText style={{opacity: 0.5}}>ft</ThemedText></ThemedView>
               </View>
               <View style={styles.imperialInput}>
                  <QuizInput
                    value={inches}
                    onChangeText={(t) => { setInches(t); setError(''); }}
                    placeholder="10"
                    keyboardType="number-pad"
                    error={error}
                  />
                   <ThemedView style={styles.unitLabel}><ThemedText style={{opacity: 0.5}}>in</ThemedText></ThemedView>
               </View>
            </View>
          )}

          <View style={styles.unitPickerWrapper}>
             <QuizUnitPicker 
               options={[
                  { label: 'ft / in', value: 'in' },
                  { label: 'cm', value: 'cm' },
               ]} 
               selected={unit} 
               onSelect={setUnit} 
             />
          </View>
        </View>
      </QuizContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 24,
    gap: 24,
  },
  unitPickerWrapper: {
     marginTop: 8,
  },
  imperialContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  imperialInput: {
    flex: 1,
    position: 'relative',
  },
  unitLabel: {
    position: 'absolute',
    right: 16,
    top: 24,
  },
});
