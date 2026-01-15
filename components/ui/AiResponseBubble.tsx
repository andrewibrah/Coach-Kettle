import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, useColorScheme } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";

type Props = {
  text: string;
  onDismiss: () => void;
};

export function AiResponseBubble({ text, onDismiss }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = isDark ? "#374151" : "#D6D6D6";

  useEffect(() => {
    if (Platform.OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  return (
    <Animated.View 
      entering={FadeInUp.springify().damping(20).stiffness(300)} 
      exiting={FadeOutDown.duration(200)}
      style={styles.container}
    >
      <ThemedView style={[styles.bubble, { backgroundColor, borderColor }]}>
        <View style={styles.header}>
          <View style={[styles.botIcon, { backgroundColor: isDark ? "#6366F1" : "#111827" }]}>
            <IconSymbol name="sparkles" size={16} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.title}>AI Coach</ThemedText>
        </View>
        <ThemedText style={styles.message}>{text}</ThemedText>
        <Pressable 
          onPress={onDismiss} 
          style={({pressed}) => [
            styles.dismissButton, 
            { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
            pressed && styles.dismissPressed
          ]}
        >
          <ThemedText style={styles.dismissText}>Done</ThemedText>
        </Pressable>
      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90, // Position above the input bar
    left: 16,
    right: 16,
    zIndex: 100,
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 14,
    padding: 16,
    width: '100%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  botIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
    fontSize: 14,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  dismissButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  dismissPressed: {
    opacity: 0.7,
  },
  dismissText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
