import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useAuth } from '@/components/AuthProvider';
import { useAuthLock } from '@/components/AuthLockProvider';
import { LockScreen } from '@/components/LockScreen';
import { HapticTab } from '@/components/ui/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ActivityIndicator } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const { isLocked, isCheckingLock } = useAuthLock();

  // Show loading while checking auth state or lock state
  if (loading || isCheckingLock) {
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
  // This prevents any protected UI from flashing before the lock is enforced
  if (isLocked) {
    return <LockScreen />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'none' }, // Hiding the footer as requested
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
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: null,
        }}
      />
    </Tabs>
  );
}

