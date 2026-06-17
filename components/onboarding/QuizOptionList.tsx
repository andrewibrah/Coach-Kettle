import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
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
}

function OptionCard({ option, isSelected, onPress, delay }: OptionCardProps) {
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const iconColor = useThemeColor({}, 'icon');
  const border = useThemeColor({}, 'border');

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
            backgroundColor: isSelected ? tint + '15' : secondaryBg,
            borderColor: isSelected ? tint : 'transparent',
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{ selected: isSelected }}
      >
        <View style={styles.optionContent}>
          {option.icon && (
            <IconSymbol
              name={option.icon as any}
              size={24}
              color={isSelected ? tint : iconColor}
              style={styles.optionIcon}
            />
          )}
          <View style={styles.optionTextContainer}>
            <ThemedText
              style={[styles.optionLabel, isSelected && { color: tint }]}
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
              backgroundColor: isSelected ? tint : 'transparent',
              borderColor: isSelected ? tint : border,
            },
          ]}
        >
          {isSelected && (
            <IconSymbol name="checkmark" size={14} color={onTint} />
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
    fontSize: 13,
    marginTop: 2,
    opacity: 0.7,
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
