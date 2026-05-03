import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface QuizProgressProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
}

export function QuizProgress({ currentStep, totalSteps, onBack }: QuizProgressProps) {
  const colorScheme = useColorScheme();
  const progress = (currentStep / totalSteps) * 100;

  const animatedWidth = useAnimatedStyle(() => ({
    width: withSpring(`${progress}%`, { damping: 15, stiffness: 100 }),
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={colorScheme === 'dark' ? '#fff' : '#000'} />
            <ThemedText style={styles.backText}>Back</ThemedText>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
        <ThemedText style={styles.stepText}>
          Step {currentStep} of {totalSteps}
        </ThemedText>
      </View>
      <View
        style={[
          styles.track,
          { backgroundColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: Colors[colorScheme ?? 'light'].tint },
            animatedWidth,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  placeholder: {
    width: 60,
  },
  stepText: {
    fontSize: 14,
    opacity: 0.6,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

