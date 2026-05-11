import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface TutorialSlideProps {
  title: string;
  subtitle: string;
  body: string;
  placeholder?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
}

export function TutorialSlide({
  title,
  subtitle,
  body,
  placeholder,
  isFirst,
  isLast,
}: TutorialSlideProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  const topAreaHeight = height * 0.55;

  return (
    <View style={[styles.slide, { width }]}>
      {/* Top area: visual */}
      {!isFirst && !isLast && (
        <View style={[styles.topArea, { height: topAreaHeight }]}>
          {placeholder}
        </View>
      )}

      {isFirst && (
        <View style={[styles.topArea, styles.emojiArea, { height: topAreaHeight }]}>
          <Text style={styles.emoji}>🏋️</Text>
        </View>
      )}

      {isLast && (
        <View style={[styles.topArea, styles.emojiArea, { height: topAreaHeight }]}>
          <Text style={styles.emoji}>💪</Text>
        </View>
      )}

      {/* Bottom text area */}
      <View style={[styles.textArea, { paddingBottom: insets.bottom + 80 }]}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: tintColor }]}>
          {subtitle}
        </ThemedText>
        <ThemedText style={styles.body}>{body}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  topArea: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emojiArea: {},
  emoji: {
    fontSize: 72,
  },
  textArea: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 22,
  },
});
