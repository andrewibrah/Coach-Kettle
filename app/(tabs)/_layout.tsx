import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useAuthLock } from '@/components/AuthLockProvider';
import { useAuth } from '@/components/AuthProvider';
import { LockScreen } from '@/components/LockScreen';
import { HapticTab } from '@/components/ui/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ActivityIndicator } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const { isLocked, isCheckingLock, needsTermsAcceptance } = useAuthLock();
  const { profileLoading, needsOnboarding } = useProfile();

  // Show loading while checking auth state, lock state, or profile state
  if (loading || isCheckingLock || profileLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
      </ThemedView>
    );
  }

  // No session - redirect to sign in
  if (!session) {
    return <Redirect href={"/auth/sign-in" as any} />;
  }

  // Session exists but is locked - show lock screen
  if (isLocked) {
    return <LockScreen />;
  }

  // Redirect to ToS if needed (before onboarding)
  if (needsTermsAcceptance) {
    return <Redirect href="/terms-of-service" />;
  }

  // Session exists but needs onboarding - redirect to onboarding
  if (needsOnboarding) {
    return <Redirect href={"/onboarding" as any} />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
