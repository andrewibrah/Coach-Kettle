import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function OnboardingLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'slide_from_right',
        contentStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="height" />
      <Stack.Screen name="age" />
      <Stack.Screen name="current-weight" />
      <Stack.Screen name="goal-weight" />
      <Stack.Screen name="focus" />
      <Stack.Screen name="pr-lifts" />
      <Stack.Screen name="pr-values" />
      <Stack.Screen name="workout-setup" />
      <Stack.Screen name="complete" />
    </Stack>
  );
}
