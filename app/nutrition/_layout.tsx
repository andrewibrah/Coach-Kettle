import { Stack } from 'expo-router';
import React from 'react';

export default function NutritionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="log" />
      <Stack.Screen name="plan" />
      <Stack.Screen name="targets" />
    </Stack>
  );
}
