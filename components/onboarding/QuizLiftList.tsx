import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface QuizLiftAdderProps {
  onAdd: (liftName: string) => void;
  placeholder?: string;
  suggestions?: string[];
}

export function QuizLiftAdder({
  onAdd,
  placeholder = 'Enter lift name...',
  suggestions = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row'],
}: QuizLiftAdderProps) {
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const inputBg = useThemeColor({}, 'inputBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholderColor = useThemeColor({}, 'placeholder');

  const [value, setValue] = useState('');

  const handleAdd = () => {
    if (value.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onAdd(value.trim());
      setValue('');
    }
  };

  const handleSuggestion = (suggestion: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(suggestion);
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200)}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[
            styles.addButton,
            { backgroundColor: tint },
            !value.trim() && styles.addButtonDisabled,
          ]}
          onPress={handleAdd}
          disabled={!value.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add lift"
        >
          <IconSymbol name="plus" size={20} color={onTint} />
        </TouchableOpacity>
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <ThemedText style={styles.suggestionsLabel}>Quick add:</ThemedText>
          <View style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                style={[styles.suggestionChip, { backgroundColor: secondaryBg }]}
                onPress={() => handleSuggestion(suggestion)}
                accessibilityRole="button"
                accessibilityLabel={`Quick add ${suggestion}`}
              >
                <ThemedText style={styles.suggestionText}>{suggestion}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

interface QuizLiftListProps {
  lifts: string[];
  onRemove: (lift: string) => void;
}

export function QuizLiftList({ lifts, onRemove }: QuizLiftListProps) {
  if (lifts.length === 0) {
    return (
      <Animated.View entering={FadeIn} style={styles.emptyState}>
        <ThemedText style={styles.emptyText}>No lifts added yet</ThemedText>
      </Animated.View>
    );
  }

  return (
    <View style={styles.listContainer}>
      {lifts.map((lift, index) => (
        <LiftItem
          key={`${lift}-${index}`}
          lift={lift}
          onRemove={() => onRemove(lift)}
        />
      ))}
    </View>
  );
}

interface LiftItemProps {
  lift: string;
  onRemove: () => void;
}

function LiftItem({ lift, onRemove }: LiftItemProps) {
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const iconColor = useThemeColor({}, 'icon');

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleRemove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.9);
    setTimeout(onRemove, 100);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      layout={Layout.springify()}
      style={animatedStyle}
    >
      <View style={[styles.liftItem, { backgroundColor: secondaryBg }]}>
        <ThemedText style={styles.liftName}>{lift}</ThemedText>
        <TouchableOpacity onPress={handleRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={`Remove ${lift}`}>
          <IconSymbol name="xmark.circle.fill" size={22} color={iconColor} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  suggestionsContainer: {
    marginTop: 16,
  },
  suggestionsLabel: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 8,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContainer: {
    gap: 8,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.5,
  },
  liftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  liftName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
});
