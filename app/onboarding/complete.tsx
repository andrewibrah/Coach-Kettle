import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const placeholder = useThemeColor({}, 'placeholder');
  const dangerColor = useThemeColor({}, 'danger');
  const { batchSaveAndComplete } = useOnboarding();

  const [saving, setSaving] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkScale = useSharedValue(0);

  useEffect(() => {
    const saveData = async () => {
      const result = await batchSaveAndComplete();

      if (result.success) {
        setSaving(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        checkScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100 }));
      } else {
        setSaving(false);
        setError(result.error || 'Failed to save your data');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    saveData();
  }, [batchSaveAndComplete, checkScale]);

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)' as any);
  };

  const handleRetry = async () => {
    setSaving(true);
    setError(null);
    const result = await batchSaveAndComplete();

    if (result.success) {
      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      checkScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100 }));
    } else {
      setSaving(false);
      setError(result.error || 'Failed to save your data');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Loading state
  if (saving) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.centered, { paddingBottom: insets.bottom }]}>
          <ActivityIndicator size="large" color={tint} />
          <ThemedText style={[styles.loadingText, { color: placeholder }]}>
            Saving your profile...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Error state
  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.centered, { paddingBottom: insets.bottom }]}>
          <View style={[styles.iconCircle, { backgroundColor: dangerColor }]}>
            <IconSymbol name="xmark" size={32} color="#fff" />
          </View>

          <ThemedText style={styles.title}>Something went wrong</ThemedText>
          <ThemedText style={[styles.message, { color: placeholder }]}>
            {error}
          </ThemedText>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: tint }]}
            onPress={handleRetry}
            activeOpacity={0.8}
          >
            <ThemedText style={[styles.buttonText, { color: onTint }]}>Try Again</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // Success state
  return (
    <ThemedView style={styles.container}>
      <View style={[styles.centered, { paddingBottom: insets.bottom }]}>
        <Animated.View
          style={[
            styles.iconCircle,
            { backgroundColor: tint },
            checkAnimatedStyle,
          ]}
        >
          <IconSymbol name="checkmark" size={32} color={onTint} />
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(400)} style={styles.textContainer}>
          <ThemedText style={styles.title}>You’re all set!</ThemedText>
          <ThemedText style={[styles.message, { color: placeholder }]}>
            Your profile has been saved. Ready to start tracking your workouts.
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(600)} style={styles.buttonWrapper}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: tint }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <ThemedText style={[styles.buttonText, { color: onTint }]}>Continue</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 20,
  },
  buttonWrapper: {
    width: '100%',
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
