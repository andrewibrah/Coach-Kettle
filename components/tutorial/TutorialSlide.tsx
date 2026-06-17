import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
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
}: TutorialSlideProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  const hasMedia = !!placeholder;

  return (
    <View style={[styles.slide, { width }]}>
      <View
        style={[
          styles.textArea,
          { paddingTop: insets.top + 72 },
          !hasMedia && styles.textAreaCentered,
        ]}
      >
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: tintColor }]}>
          {subtitle}
        </ThemedText>
        <ThemedText style={styles.body}>{body}</ThemedText>
      </View>

      {hasMedia && (
        <View style={styles.mediaArea}>
          {placeholder}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  textArea: {
    paddingHorizontal: 28,
    alignItems: "center",
  },
  textAreaCentered: {
    flex: 1,
    justifyContent: "center",
  },
  mediaArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 22,
    textAlign: "center",
  },
});
