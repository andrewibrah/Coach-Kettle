import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/contexts/AuthProvider';

export default function SettingsLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  // Redirect to sign in if not authenticated
  if (!loading && !session) {
    return <Redirect href={"/auth/sign-in" as any} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colorScheme === 'dark' ? '#151718' : '#ffffff',
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="pr-tracking" />
      <Stack.Screen name="templates" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="nutrition-preferences" />
    </Stack>
  );
}
