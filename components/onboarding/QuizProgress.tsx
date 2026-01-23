import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface QuizProgressProps {
  currentStep: number;
  totalSteps: number;
}

export function QuizProgress({ currentStep, totalSteps }: QuizProgressProps) {
  const colorScheme = useColorScheme();
  const progress = (currentStep / totalSteps) * 100;

  const animatedWidth = useAnimatedStyle(() => ({
    width: withSpring(`${progress}%`, { damping: 15, stiffness: 100 }),
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
    justifyContent: 'flex-end',
    marginBottom: 8,
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
