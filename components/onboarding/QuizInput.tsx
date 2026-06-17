import React, { useState } from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';

interface QuizInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  autoFocus?: boolean;
  maxLength?: number;
  error?: string;
}

export function QuizInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoFocus,
  maxLength,
  error,
}: QuizInputProps) {
  const secondaryBg = useThemeColor({}, 'secondaryBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholderColor = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');
  const dangerColor = useThemeColor({}, 'danger');

  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleFocus = () => {
    setIsFocused(true);
    scale.value = withSpring(1.02);
  };

  const handleBlur = () => {
    setIsFocused(false);
    scale.value = withSpring(1);
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200)} style={animatedStyle}>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: secondaryBg,
            color: textColor,
            borderColor: error ? dangerColor : isFocused ? tint : 'transparent',
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {error && <ThemedText style={[styles.error, { color: dangerColor }]}>{error}</ThemedText>}
    </Animated.View>
  );
}

interface QuizUnitPickerProps {
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
}

export function QuizUnitPicker({ options, selected, onSelect }: QuizUnitPickerProps) {
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const secondaryBg = useThemeColor({}, 'secondaryBackground');

  const handleSelect = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(value);
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(250)} style={styles.pickerContainer}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.pickerOption,
            { backgroundColor: selected === option.value ? tint : secondaryBg },
          ]}
          onPress={() => handleSelect(option.value)}
          activeOpacity={0.7}
        >
          <ThemedText
            style={[
              styles.pickerText,
              selected === option.value && [styles.pickerTextSelected, { color: onTint }],
            ]}
          >
            {option.label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

interface QuizNumberInputWithUnitProps {
  value: string;
  onChangeValue: (text: string) => void;
  unit: string;
  onChangeUnit: (unit: string) => void;
  unitOptions: { label: string; value: string }[];
  placeholder?: string;
  error?: string;
}

export function QuizNumberInputWithUnit({
  value,
  onChangeValue,
  unit,
  onChangeUnit,
  unitOptions,
  placeholder,
  error,
}: QuizNumberInputWithUnitProps) {
  return (
    <View style={styles.numberWithUnitContainer}>
      <View style={styles.numberInputWrapper}>
        <QuizInput
          value={value}
          onChangeText={onChangeValue}
          placeholder={placeholder}
          keyboardType="decimal-pad"
          error={error}
        />
      </View>
      <QuizUnitPicker options={unitOptions} selected={unit} onSelect={onChangeUnit} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  error: {
    fontSize: 14,
    marginTop: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerTextSelected: {
    fontWeight: '700',
  },
  numberWithUnitContainer: {
    gap: 16,
  },
  numberInputWrapper: {
    flex: 1,
  },
});
