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

  // VoiceOver derives "N of M" from the number of routes in the navigator, not the
  // number of rendered buttons. `history` below is intentionally kept as a route
  // (reachable from More) but hidden from the bar with `href: null`, so the default
  // announcement was "1 of 6" .. "5 of 6" for five visible tabs. Supplying explicit
  // labels corrects the announcement WITHOUT removing a working route.
  const visibleTabs = ['Home', 'Timer', 'Nutrition', 'Progress', 'More'];
  const tabA11yLabel = (title: string) =>
    `${title}, tab, ${visibleTabs.indexOf(title) + 1} of ${visibleTabs.length}`;

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
          tabBarAccessibilityLabel: tabA11yLabel('Home'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="timer"
        options={{
          title: 'Timer',
          tabBarAccessibilityLabel: tabA11yLabel('Timer'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="timer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarAccessibilityLabel: tabA11yLabel('Nutrition'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="fork.knife" color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarAccessibilityLabel: tabA11yLabel('Progress'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.line.uptrend.xyaxis" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarAccessibilityLabel: tabA11yLabel('More'),
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
