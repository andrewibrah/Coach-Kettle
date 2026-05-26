import { Stack } from 'expo-router';
import React from 'react';

export default function ProgramLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="week" />
      <Stack.Screen name="create" />
      <Stack.Screen name="day" />
    </Stack>
  );
}
