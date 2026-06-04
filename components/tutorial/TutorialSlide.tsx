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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  const hasMedia = !!placeholder;
  // Focused media region anchored to the lower part of the screen.
  const mediaHeight = height * 0.48;

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
        <View style={[styles.mediaArea, { height: mediaHeight }]}>
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
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
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
