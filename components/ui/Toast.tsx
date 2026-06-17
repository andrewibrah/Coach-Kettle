import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { ToastType } from '@/hooks/useToast';

type Props = {
  message: string;
  type?: ToastType;
  onDismiss: () => void;
};

export function Toast({ message, type = 'success', onDismiss }: Props) {
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');
  const tintColor = useThemeColor({}, 'tint');
  const insets = useSafeAreaInsets();

  const bgColor = type === 'success' ? successColor : type === 'error' ? dangerColor : tintColor;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(20).stiffness(300)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.container, { top: insets.top + 12 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        style={[styles.pill, { backgroundColor: bgColor }]}
        accessibilityRole="button"
        accessibilityLabel={`${message} — tap to dismiss`}
      >
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    maxWidth: '85%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
