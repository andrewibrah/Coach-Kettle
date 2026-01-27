import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { completeOnboarding } = useProfile();

  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0);

  useEffect(() => {
    // Complete onboarding in database
    completeOnboarding();

    // Trigger success haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate ring first, then checkmark
    ringScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 100 }));
    checkScale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 120 }));

    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/(tabs)' as any);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringScale.value,
  }));

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)' as any);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        {/* Success Icon */}
        <View style={styles.iconWrapper}>
          <Animated.View
            style={[
              styles.ring,
              { borderColor: Colors[colorScheme ?? 'light'].tint + '30' },
              ringAnimatedStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.checkCircle,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint },
              checkAnimatedStyle,
            ]}
          >
            <IconSymbol name="checkmark" size={40} color="#fff" />
          </Animated.View>
        </View>

        {/* Text Content */}
        <Animated.View entering={FadeInDown.duration(500).delay(500)} style={styles.textContent}>
          <ThemedText style={styles.title}>All Set!</ThemedText>
          <ThemedText style={[styles.subtitle, { color: isDark ? '#999' : '#666' }]}>
            Your profile is ready. Time to start tracking your workouts.
          </ThemedText>
        </Animated.View>

        {/* Features List */}
        <Animated.View entering={FadeIn.duration(400).delay(800)} style={styles.featuresList}>
          <FeatureItem
            icon="chart.line.uptrend.xyaxis"
            text="Track your progress"
            colorScheme={colorScheme}
          />
          <FeatureItem
            icon="trophy.fill"
            text="Hit new personal records"
            colorScheme={colorScheme}
          />
          <FeatureItem
            icon="brain.head.profile"
            text="Get AI coaching tips"
            colorScheme={colorScheme}
          />
        </Animated.View>
      </View>

      {/* Bottom Button */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(1000)}
        style={[styles.buttonContainer, { paddingBottom: insets.bottom + 24 }]}
      >
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.buttonText}>Start Training</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </ThemedView>
  );
}

interface FeatureItemProps {
  icon: string;
  text: string;
  colorScheme: 'light' | 'dark' | null;
}

function FeatureItem({ icon, text, colorScheme }: FeatureItemProps) {
  const isDark = colorScheme === 'dark';
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: isDark ? '#1c1c1e' : '#f5f5f5' }]}>
        <IconSymbol
          name={icon as any}
          size={18}
          color={Colors[colorScheme ?? 'light'].tint}
        />
      </View>
      <ThemedText style={styles.featureText}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  featuresList: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 16,
    fontWeight: '500',
  },
  buttonContainer: {
    paddingHorizontal: 24,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
