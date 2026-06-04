import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface Option {
  label: string;
  value: string;
  icon?: string;
  description?: string;
}

interface QuizOptionListProps {
  options: Option[];
  selected: string | string[] | null;
  onSelect: (value: string) => void;
  multiSelect?: boolean;
}

export function QuizOptionList({
  options,
  selected,
  onSelect,
  multiSelect = false,
}: QuizOptionListProps) {
  const colorScheme = useColorScheme();

  const isSelected = (value: string): boolean => {
    if (multiSelect && Array.isArray(selected)) {
      return selected.includes(value);
    }
    return selected === value;
  };

  const handleSelect = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(value);
  };

  return (
    <View style={styles.container}>
      {options.map((option, index) => (
        <OptionCard
          key={option.value}
          option={option}
          isSelected={isSelected(option.value)}
          onPress={() => handleSelect(option.value)}
          delay={index * 50}
          colorScheme={colorScheme}
        />
      ))}
    </View>
  );
}

interface OptionCardProps {
  option: Option;
  isSelected: boolean;
  onPress: () => void;
  delay: number;
  colorScheme: 'light' | 'dark' | null;
}

function OptionCard({ option, isSelected, onPress, delay, colorScheme }: OptionCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200 + delay)} style={animatedStyle}>
      <TouchableOpacity
        style={[
          styles.optionCard,
          {
            backgroundColor: isSelected
              ? Colors[colorScheme ?? 'light'].tint + '15'
              : colorScheme === 'dark'
              ? '#1c1c1e'
              : '#f5f5f5',
            borderColor: isSelected
              ? Colors[colorScheme ?? 'light'].tint
              : 'transparent',
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        <View style={styles.optionContent}>
          {option.icon && (
            <IconSymbol
              name={option.icon as any}
              size={24}
              color={
                isSelected
                  ? Colors[colorScheme ?? 'light'].tint
                  : colorScheme === 'dark'
                  ? '#aaa'
                  : '#666'
              }
              style={styles.optionIcon}
            />
          )}
          <View style={styles.optionTextContainer}>
            <ThemedText
              style={[
                styles.optionLabel,
                isSelected && { color: Colors[colorScheme ?? 'light'].tint },
              ]}
            >
              {option.label}
            </ThemedText>
            {option.description && (
              <ThemedText style={styles.optionDescription}>
                {option.description}
              </ThemedText>
            )}
          </View>
        </View>
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: isSelected
                ? Colors[colorScheme ?? 'light'].tint
                : 'transparent',
              borderColor: isSelected
                ? Colors[colorScheme ?? 'light'].tint
                : colorScheme === 'dark'
                ? '#444'
                : '#ccc',
            },
          ]}
        >
          {isSelected && (
            <IconSymbol name="checkmark" size={14} color={Colors[colorScheme ?? 'light'].tintForeground} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});
