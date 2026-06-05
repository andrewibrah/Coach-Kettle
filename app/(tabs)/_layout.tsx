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
    return <Redirect href="/auth/sign-in" />;
  }

  // Redirect to ToS if needed (before onboarding)
  if (needsTermsAcceptance) {
    return <Redirect href="/terms-of-service" />;
  }

  // Session exists but needs onboarding - redirect to onboarding
  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  // Needs paywall - trial/sub expired or initial offer not yet dismissed
  if (needsPaywall || needsInitialPaywall) {
    return <Redirect href="/paywall" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'flex' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="fork.knife" color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.line.uptrend.xyaxis" color={color} />,
        }}
      />
      <Tabs.Screen
        name="timer"
        options={{
          title: 'Timer',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="timer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="line.3.horizontal" color={color} />,
        }}
      />
      {/* History is accessible via the More tab — hidden from tab bar but route is preserved */}
      <Tabs.Screen
        name="history"
        options={{ href: null }}
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
