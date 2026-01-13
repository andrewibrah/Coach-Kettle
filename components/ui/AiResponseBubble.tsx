import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";

type Props = {
  text: string;
  onDismiss: () => void;
};

export function AiResponseBubble({ text, onDismiss }: Props) {
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
      <View style={styles.bubble}>
        <View style={styles.header}>
          <View style={styles.botIcon}>
            <IconSymbol name="sparkles" size={16} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.title}>AI Coach</ThemedText>
        </View>
        <Text style={styles.message}>{text}</Text>
        <Pressable 
          onPress={onDismiss} 
          style={({pressed}) => [styles.dismissButton, pressed && styles.dismissPressed]}
        >
          <Text style={styles.dismissText}>Done</Text>
        </Pressable>
      </View>
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
    alignItems: 'flex-start', // Align bubble to left or center? Let's do full width usually or tailored.
  },
  bubble: {
    backgroundColor: '#1F2937', // Dark gray/blue
    borderRadius: 20,
    padding: 16,
    width: '100%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  botIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366F1', // Indigo
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
    fontSize: 14,
    color: '#E5E7EB',
  },
  message: {
    fontSize: 16,
    color: '#F3F4F6',
    lineHeight: 22,
    marginBottom: 16,
  },
  dismissButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  dismissPressed: {
    opacity: 0.8,
  },
  dismissText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
