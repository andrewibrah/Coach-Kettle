import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { AppLogo } from '@/components/AppLogo';
import { useAuthLock } from '@/contexts/AuthLockProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { HapticTab } from '@/components/ui/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const { isCheckingLock, needsTermsAcceptance } = useAuthLock();
  const { profileLoading, needsOnboarding } = useProfile();
  const { isLoading: entitlementLoading, needsPaywall, needsInitialPaywall } = useEntitlement();

  // Show loading while checking auth state, lock state, profile state, or entitlement state
  if (loading || isCheckingLock || profileLoading || entitlementLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <AppLogo size={150} />
      </ThemedView>
    );
  }

  // No session - redirect to sign in
  if (!session) {
    return <Redirect href={"/auth/sign-in" as any} />;
  }

  // Redirect to ToS if needed (before onboarding)
  if (needsTermsAcceptance) {
    return <Redirect href="/terms-of-service" />;
  }

  // Session exists but needs onboarding - redirect to onboarding
  if (needsOnboarding) {
    return <Redirect href={"/onboarding" as any} />;
  }

  // Needs paywall - trial/sub expired or initial offer not yet dismissed
  if (needsPaywall || needsInitialPaywall) {
    return <Redirect href={"/paywall" as any} />;
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
