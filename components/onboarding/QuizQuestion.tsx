import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/themed-text';

interface QuizQuestionProps {
  question: string;
  subtitle?: string;
}

export function QuizQuestion({ question, subtitle }: QuizQuestionProps) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.container}>
      <ThemedText style={styles.question}>{question}</ThemedText>
      {subtitle && (
        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  question: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    lineHeight: 22,
  },
});
