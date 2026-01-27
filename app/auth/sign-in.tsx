import { Ionicons } from '@expo/vector-icons';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { checkServerTermsAcceptance, setLastAuthenticatedAt } from '@/lib/authLock';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const primaryColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  // Helper: Complete auth and navigate based on terms acceptance
  const completeAuthAndNavigate = async () => {
    // 1. Set TTL timestamp
    await setLastAuthenticatedAt();

    // 2. Wait for session to be fully established
    // The Supabase SDK needs time to persist the session to AsyncStorage
    console.log('[SignIn] Waiting for session to be established...');

    let sessionConfirmed = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session && !error) {
        console.log('[SignIn] Session confirmed:', {
          userId: session.user?.id,
          expiresAt: session.expires_at
        });
        sessionConfirmed = true;
        break;
      }
      console.log('[SignIn] Session not ready yet, attempt', i + 1);
    }

    if (!sessionConfirmed) {
      console.error('[SignIn] Failed to confirm session after multiple attempts');
      // Still try to navigate - the AuthProvider might handle it
      router.replace('/(tabs)');
      return;
    }

    // 3. Check terms acceptance
    try {
      const termsStatus = await checkServerTermsAcceptance();

      // Fail-safe: If status is null (check failed) or explicitly needs acceptance, redirect to ToS
      if (!termsStatus || termsStatus.needsAcceptance) {
        if (!termsStatus) console.warn('[SignIn] Terms check failed or returned null, defaulting to strict acceptance');
        else console.log('[SignIn] Redirecting to Terms of Service');

        router.replace('/terms-of-service');
      } else {
        console.log('[SignIn] Redirecting to Home');
        router.replace('/(tabs)');
      }
    } catch (e) {
      // Fallback: If any unexpected error occurs, still navigate to home
      // The AuthLockProvider will handle the terms check on mount
      console.warn('[SignIn] Failed to check terms, proceeding to home:', e);
      router.replace('/(tabs)');
    }
  };


  // Create redirect URL
  // In Expo Go: uses exp:// scheme (dynamic URL)
  // In dev/prod builds: uses coachkettle:// scheme (stable)
  const redirectTo = makeRedirectUri({
    scheme: 'coachkettle',
    path: 'auth/callback',
    // For Expo Go development, this will still return exp:// URL
    // The scheme is only used in standalone builds
  });

  // Log redirect URL in dev for debugging and Supabase configuration
  useEffect(() => {
    if (__DEV__) {
      console.log('[SignIn] ========================================');
      console.log('[SignIn] OAuth redirect URL:', redirectTo);
      console.log('[SignIn] Add this URL (or wildcard pattern) to Supabase Dashboard:');
      console.log('[SignIn] Authentication → URL Configuration → Redirect URLs');
      console.log('[SignIn] For Expo Go, add: exp://*.exp.direct/--/auth/callback');
      console.log('[SignIn] For prod builds, add: coachkettle://auth/callback');
      console.log('[SignIn] ========================================');
    }
  }, [redirectTo]);

  // Listen for deep link events as fallback for OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      let { queryParams, path } = Linking.parse(event.url);

      // If no query params found, try parsing the hash from the raw URL manually
      // Supabase implicit flow often returns tokens in the hash #access_token=...
      if ((!queryParams || Object.keys(queryParams).length === 0) && event.url.includes('#')) {
        const hashPart = event.url.split('#')[1];
        if (hashPart) {
          const hashParams: Record<string, string> = {};
          hashPart.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
              hashParams[key] = decodeURIComponent(value);
            }
          });
          queryParams = { ...queryParams, ...hashParams };
        }
      }

      if (path?.includes('auth/callback') || event.url.includes('auth/callback')) {
        setLoading(true);
        try {
          // 1. Handle code exchange (PKCE flow)
          if (queryParams?.code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(
              queryParams.code as string
            );
            if (sessionError) throw sessionError;

            await completeAuthAndNavigate();
            return;
          }

          // 2. Handle access_token (Implicit flow & Magic Link)
          if (queryParams?.access_token && queryParams?.refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: queryParams.access_token as string,
              refresh_token: queryParams.refresh_token as string,
            });
            if (sessionError) throw sessionError;

            await completeAuthAndNavigate();
            return;
          }

          // 3. Handle standalone access_token (rare but possible)
          if (queryParams?.access_token) {
            // If we only have access token, we can try getting user to verify validity
            // But setSession usually requires refresh token for persistence
            // For now, we'll try setting it if present
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: queryParams.access_token as string,
              refresh_token: (queryParams.refresh_token as string) || '',
            });
            if (sessionError) throw sessionError;

            await completeAuthAndNavigate();
            return;
          }

          // 4. Handle error
          if (queryParams?.error) {
            throw new Error((queryParams.error_description as string) || (queryParams.error as string));
          }

        } catch (err: any) {
          Alert.alert('Authentication Error', err.message);
        } finally {
          setLoading(false);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [router]);

  async function signInWithEmail() {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      Alert.alert('Sign In Failed', error.message);
    } else {
      // Check terms and navigate
      await completeAuthAndNavigate();
      setLoading(false);
    }
  }

  async function signInWithOAuth(provider: 'google' | 'apple') {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        console.log('[SignIn] Opening OAuth URL:', data.url);
        console.log('[SignIn] Expected redirect:', redirectTo);

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          { showInRecents: true }
        );

        console.log('[SignIn] WebBrowser result:', result.type);

        if (result.type === 'success' && result.url) {
          console.log('[SignIn] Success URL:', result.url);
          let { queryParams } = Linking.parse(result.url);

          // Manual hash parsing if queryParams is empty but hash exists
          if ((!queryParams || Object.keys(queryParams).length === 0) && result.url.includes('#')) {
            const hashPart = result.url.split('#')[1];
            if (hashPart) {
              const hashParams: Record<string, string> = {};
              hashPart.split('&').forEach(pair => {
                const [key, value] = pair.split('=');
                if (key && value) {
                  hashParams[key] = decodeURIComponent(value);
                }
              });
              queryParams = { ...queryParams, ...hashParams };
            }
          }

          // Handle code exchange (PKCE flow)
          if (queryParams?.code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(
              queryParams.code as string
            );
            if (sessionError) throw sessionError;

            await completeAuthAndNavigate();
            return;
          }

          // Handle access_token (implicit flow fallback)
          if (queryParams?.access_token) {
            console.log('[SignIn] Found access_token in URL, setting session manually');
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: queryParams.access_token as string,
              refresh_token: (queryParams.refresh_token as string) || '',
            });
            if (sessionError) throw sessionError;

            await completeAuthAndNavigate();
            return;
          }

          // Handle error from OAuth provider
          if (queryParams?.error) {
            throw new Error(
              (queryParams.error_description as string) ||
              (queryParams.error as string)
            );
          }
        } else if (result.type === 'cancel') {
          console.log('[SignIn] User cancelled OAuth');
        } else if (result.type === 'dismiss') {
          // Browser was dismissed - check if session was established via deep link
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await completeAuthAndNavigate();
            return;
          }
        }
      }
    } catch (err: any) {
      console.error('[SignIn] OAuth error:', err);
      Alert.alert('OAuth Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>Welcome Back</ThemedText>
            <ThemedText style={styles.subtitle}>Sign in to continue your progress</ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: Colors.light.icon }]}
                onChangeText={setEmail}
                value={email}
                placeholder="user@example.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: Colors.light.icon }]}
                onChangeText={setPassword}
                value={password}
                placeholder="••••••••"
                placeholderTextColor="#999"
                secureTextEntry
              />
            </View>

            <Link href={"/auth/forgot-password" as any} asChild>
              <TouchableOpacity style={styles.forgotPassword}>
                <ThemedText type="link">Forgot Password?</ThemedText>
              </TouchableOpacity>
            </Link>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 }]}
              onPress={signInWithEmail}
              disabled={loading}
            >
              <ThemedText style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</ThemedText>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <ThemedText style={styles.orText}>OR</ThemedText>
              <View style={styles.line} />
            </View>

            <TouchableOpacity style={styles.oauthButton} onPress={() => signInWithOAuth('apple')}>
              <Ionicons name="logo-apple" size={24} color={textColor} />
              <ThemedText style={styles.oauthText}>Sign in with Apple</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.oauthButton} onPress={() => signInWithOAuth('google')}>
              <Ionicons name="logo-google" size={24} color={textColor} />
              <ThemedText style={styles.oauthText}>Sign in with Google</ThemedText>
            </TouchableOpacity>

          </View>

          <View style={styles.footer}>
            <ThemedText>Don&apos;t have an account? </ThemedText>
            <Link href={"/auth/sign-up" as any} asChild>
              <TouchableOpacity>
                <ThemedText type="link">Sign Up</ThemedText>
              </TouchableOpacity>
            </Link>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.7,
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  button: {
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
    opacity: 0.3,
  },
  orText: {
    marginHorizontal: 16,
    fontSize: 14,
    opacity: 0.5,
  },
  oauthButton: {
    flexDirection: 'row',
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
  },
  oauthText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: 16,
  },
});
