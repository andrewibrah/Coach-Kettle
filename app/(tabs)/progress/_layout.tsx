import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function ProgressLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          // Hooks (useThemeColor) cannot be called inside screenOptions (plain object literal),
          // so useColorScheme() + ternary on literal hex is the standard Expo Router workaround.
          // Update both values if the app's base palette changes (Colors.dark.background / Colors.light.background).
          backgroundColor: colorScheme === 'dark' ? '#151718' : '#fff',
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="body" />
      <Stack.Screen name="strength" />
      <Stack.Screen name="resting-hr" />
      <Stack.Screen name="photos" />
    </Stack>
  );
}
