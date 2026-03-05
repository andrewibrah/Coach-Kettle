/**
 * Multiline TextInput card for personal session reflections.
 * Renders inside SessionReviewModal and history detail.
 */

import { useThemeColor } from "@/hooks/use-theme-color";
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  placeholder?: string;
};

export function ReflectionInput({
  value,
  onChangeText,
  editable = true,
  placeholder = "How did the session feel? Any notes for next time...",
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const textColor = useThemeColor({}, "text");
  const placeholderColor = isDark ? "#6B7280" : "#9CA3AF";
  const cardBg = isDark ? "#1C1C1E" : "#F3F4F6";
  const inputBg = isDark ? "#2C2C2E" : "#FFFFFF";
  const borderColor = isDark ? "#3A3A3C" : "#E5E7EB";
  const mutedColor = isDark ? "#9CA3AF" : "#6B7280";

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerIcon, { color: mutedColor }]}>💭</Text>
        <Text style={[styles.headerText, { color: textColor }]}>
          Session Reflection
        </Text>
      </View>

      <TextInput
        style={[
          styles.input,
          {
            color: textColor,
            backgroundColor: inputBg,
            borderColor,
          },
          !editable && styles.inputReadonly,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        editable={editable}
        maxLength={2000}
        returnKeyType="default"
      />

      {editable && (
        <Text style={[styles.charCount, { color: mutedColor }]}>
          {value.length}/2000
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 14,
  },
  headerText: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  inputReadonly: {
    opacity: 0.8,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
  },
});
