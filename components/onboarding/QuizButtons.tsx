import React from 'react';
import { StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/theme';

interface QuizSkipButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function QuizSkipButton({ onPress, disabled }: QuizSkipButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200)}>
      <TouchableOpacity
        style={styles.skipButton}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <ThemedText style={[styles.skipText, disabled && styles.disabledText]}>
          Skip
        </ThemedText>
      </TouchableOpacity>
    </Animated.View>
  );
}

interface QuizContinueButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}

export function QuizContinueButton({
  onPress,
  disabled,
  loading,
  label = 'Continue',
}: QuizContinueButtonProps) {
  const colorScheme = useColorScheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(300)} style={animatedStyle}>
      <TouchableOpacity
        style={[
          styles.continueButton,
          { backgroundColor: Colors[colorScheme ?? 'light'].tint },
          (disabled || loading) && styles.disabledButton,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.continueText}>{label}</ThemedText>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

interface QuizButtonGroupProps {
  onSkip: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  continueLabel?: string;
  skipDisabled?: boolean;
}

export function QuizButtonGroup({
  onSkip,
  onContinue,
  continueDisabled,
  continueLoading,
  continueLabel,
  skipDisabled,
}: QuizButtonGroupProps) {
  return (
    <View style={styles.buttonGroup}>
      <QuizSkipButton onPress={onSkip} disabled={skipDisabled} />
      <QuizContinueButton
        onPress={onContinue}
        disabled={continueDisabled}
        loading={continueLoading}
        label={continueLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  skipButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  skipText: {
    fontSize: 16,
    opacity: 0.6,
  },
  disabledText: {
    opacity: 0.3,
  },
  continueButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 24,
  },
});
