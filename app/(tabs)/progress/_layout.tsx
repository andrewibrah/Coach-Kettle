import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/contexts/AuthProvider';

export default function ProgressLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  if (!loading && !session) {
    return <Redirect href={"/auth/sign-in" as any} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
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
