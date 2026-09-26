import 'react-native-reanimated';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router/react-navigation';
import Constants from 'expo-constants';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
// Private RN module (no public API exposes it). Its default export's
// handleException is where RN 0.86 sends uncaught React errors
// (src/private/renderer/errorhandling/ErrorHandlers.js onUncaughtError) and,
// via setUpErrorHandling.js, the ErrorUtils global handler's errors too.
import ExceptionsManager from 'react-native/Libraries/Core/ExceptionsManager';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthLockProvider } from '@/contexts/AuthLockProvider';
import { AuthProvider } from '@/contexts/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import { Colors } from '@/constants/theme';
import { EntitlementProvider } from '@/contexts/EntitlementContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { PRCelebrationProvider } from '@/contexts/PRCelebrationContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { NutritionProvider } from '@/contexts/NutritionContext';
import { CoachingProvider } from '@/contexts/CoachingContext';
import { ProgramProvider } from '@/contexts/ProgramContext';
import { NotificationsProvider } from '@/contexts/NotificationsProvider';
import { RestTimerProvider } from '@/contexts/RestTimerContext';
import { RestTimerToast } from '@/components/workout/RestTimerToast';
import { ThemedText } from '@/components/ui/themed-text';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { crashAlertTitle, formatCrashAlert, installCrashCapture, takeCrashRecord } from '@/lib/crashCapture';

// Module scope so it is in place before the first render. buildNumber is the
// binary's CFBundleVersion (the TestFlight build), not the app.json value.
const buildNumber = Constants.platform?.ios?.buildNumber;
const appVersion = Constants.expoConfig?.version ?? null;
installCrashCapture(ExceptionsManager, appVersion && buildNumber ? `${appVersion} (${buildNumber})` : appVersion);

export const unstable_settings = {
  anchor: '(tabs)',
};

// expo-router renders this instead of the root layout when it throws while
// rendering, so the message is on screen rather than aborting the app.
// https://docs.expo.dev/router/error-handling/ (contract: expo-router
// build/views/Try.d.ts ErrorBoundaryProps { error, retry }).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const background = useThemeColor({}, 'background');
  const danger = useThemeColor({}, 'danger');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  return (
    <View style={[styles.errorContainer, { backgroundColor: background }]}>
      <ThemedText type="subtitle">Something went wrong</ThemedText>
      <ThemedText style={[styles.errorMessage, { color: danger }]} selectable>
        {error.message}
      </ThemedText>
      <TouchableOpacity style={[styles.retryButton, { backgroundColor: tint }]} onPress={retry}>
        <ThemedText style={{ color: onTint }}>Retry</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

function RootLayout() {
  // Show (once) the crash recorded by installCrashCapture on the previous run.
  useEffect(() => {
    takeCrashRecord()
      .then((record) => {
        if (record) Alert.alert(crashAlertTitle(record), formatCrashAlert(record));
      })
      .catch(() => {});
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <EntitlementProvider>
            <OnboardingProvider>
              <PRCelebrationProvider>
                <AuthLockProvider>
                  <NotificationsProvider>
                    <NutritionProvider>
                      <CoachingProvider>
                        <ProgramProvider>
                          <RestTimerProvider>
                            <GestureHandlerRootView style={{ flex: 1 }}>
                              <RootLayoutNav />
                              <RestTimerToast />
                            </GestureHandlerRootView>
                          </RestTimerProvider>
                        </ProgramProvider>
                      </CoachingProvider>
                    </NutritionProvider>
                  </NotificationsProvider>
                </AuthLockProvider>
              </PRCelebrationProvider>
            </OnboardingProvider>
          </EntitlementProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default RootLayout;

// Build the navigation theme from our own design tokens so the navigator's
// surfaces (screen background, header card, borders) match the app exactly.
// Without this, react-navigation's stock backgrounds differ slightly from our
// tokens, which shows as a brief color mismatch when navigating / theme switching.
function navThemeFor(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.tint,
      background: c.background,
      card: c.headerBackground,
      text: c.text,
      border: c.border,
    },
  };
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const navTheme = navThemeFor(colorScheme === 'dark' ? 'dark' : 'light');

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="chats" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="history/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="nutrition" options={{ headerShown: false }} />
        <Stack.Screen name="coach" options={{ headerShown: false }} />
        <Stack.Screen name="progress" options={{ headerShown: false }} />
        <Stack.Screen name="program" options={{ headerShown: false }} />
        <Stack.Screen name="exercise-library" options={{ headerShown: false }} />
        <Stack.Screen name="terms-of-service" options={{
          headerShown: true,
          title: 'Terms of Service',
          presentation: 'modal',
          headerBackTitle: "",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: navTheme.colors.background },
          headerTintColor: navTheme.colors.text,
        }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  errorMessage: {
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
