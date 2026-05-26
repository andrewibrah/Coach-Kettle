import 'react-native-reanimated';

import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { useColorScheme } from '@/hooks/useColorScheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
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

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
          headerStyle: { backgroundColor: colorScheme === 'dark' ? Colors.dark.background : Colors.light.background },
          headerTintColor: colorScheme === 'dark' ? Colors.dark.text : Colors.light.text,
        }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}
