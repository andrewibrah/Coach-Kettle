import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
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
  useColorScheme,
} from 'react-native';

import { AppLogo } from '@/components/AppLogo';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { setLastAuthenticatedAt } from '@/lib/authLock';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const inputBorderColor = isDark ? Colors.dark.icon : Colors.light.icon;
  const placeholderColor = isDark ? Colors.dark.placeholder : Colors.light.placeholder;
  const oauthBorderColor = isDark ? Colors.dark.border : Colors.light.border;

  // Create redirect URL
  // In Expo Go: uses exp:// scheme (dynamic URL)
  // In dev/prod builds: uses coachkettle:// scheme (stable)
  const redirectTo = makeRedirectUri({
    scheme: 'coachkettle',
    path: 'auth/callback',
  });

  // Log redirect URL in dev for debugging
  useEffect(() => {
    if (__DEV__) {
      console.log('[SignUp] OAuth redirect URL:', redirectTo);
      console.log('[SignUp] Ensure this is in Supabase Dashboard Redirect URLs');
    }
  }, [redirectTo]);

  // Listen for deep link events as fallback for OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const parsed = Linking.parse(event.url);

      if (parsed.path?.includes('auth/callback') && parsed.queryParams?.code) {
        setLoading(true);
        try {
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(
            parsed.queryParams.code as string
          );
          if (sessionError) throw sessionError;

          await setLastAuthenticatedAt();
          router.replace('/(tabs)');
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

  async function signUpWithEmail() {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    if (password !== confirmPassword) return Alert.alert('Error', 'Passwords do not match');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');

    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);
    if (error) Alert.alert('Sign Up Failed', error.message);
    else {
      if (!data.session) {
        Alert.alert('Verification Sent', 'Please check your email to confirm your account.');
      } else {
        await setLastAuthenticatedAt();
        router.replace('/(tabs)');
      }
    }
  }

  async function signUpWithAppleNative() {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      console.log('[SignUp] Apple credential received, signing in with Supabase...');

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      await setLastAuthenticatedAt();
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === '1001') {
        console.log('[SignUp] User cancelled Apple Sign In');
        return;
      }
      console.error('[SignUp] Apple Sign In error:', {
        code: err?.code,
        message: err?.message,
        domain: err?.domain,
        userInfo: err?.userInfo,
        stack: err?.stack,
      });
      const message = err?.message
        || (err?.code ? `Apple authentication failed (code ${err.code}). Please try again.` : 'Apple authentication failed. Please try again.');
      Alert.alert('Apple Sign In Failed', message);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOAuth(provider: 'google') {
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
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          { showInRecents: true }
        );

        if (result.type === 'success' && result.url) {
          const parsed = Linking.parse(result.url);

          if (parsed.queryParams?.code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(
              parsed.queryParams.code as string
            );
            if (sessionError) throw sessionError;

            await setLastAuthenticatedAt();
            router.replace('/(tabs)');
            return;
          }

          if (parsed.queryParams?.access_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: parsed.queryParams.access_token as string,
              refresh_token: parsed.queryParams.refresh_token as string || '',
            });
            if (sessionError) throw sessionError;

            await setLastAuthenticatedAt();
            router.replace('/(tabs)');
            return;
          }

          if (parsed.queryParams?.error) {
            throw new Error(
              (parsed.queryParams.error_description as string) ||
              (parsed.queryParams.error as string)
            );
          }
        } else if (result.type === 'dismiss') {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await setLastAuthenticatedAt();
            router.replace('/(tabs)');
            return;
          }
        }
      }
    } catch (err: any) {
      console.error('[SignUp] OAuth error:', err);
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
            <AppLogo size={120} />
            <ThemedText type="title" style={styles.title}>Create Account</ThemedText>
            <ThemedText style={styles.subtitle}>Join Coach Kettle today</ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: inputBorderColor }]}
                onChangeText={setEmail}
                value={email}
                placeholder="user@example.com"
                placeholderTextColor={placeholderColor}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: inputBorderColor }]}
                onChangeText={setPassword}
                value={password}
                placeholder="Create a password"
                placeholderTextColor={placeholderColor}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Confirm Password</ThemedText>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: inputBorderColor }]}
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={placeholderColor}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 }]}
              onPress={signUpWithEmail}
              disabled={loading}
            >
              <ThemedText style={styles.buttonText}>{loading ? 'Creating account...' : 'Sign Up'}</ThemedText>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <ThemedText style={styles.orText}>OR</ThemedText>
              <View style={styles.line} />
            </View>

            {/*
              Use the NATIVE Apple button so iPad has a proper anchor for the
              ASAuthorizationController popover. See sign-in.tsx for context.
            */}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={styles.appleButton}
              onPress={signUpWithAppleNative}
            />

            <TouchableOpacity style={[styles.oauthButton, { borderColor: oauthBorderColor }]} onPress={() => signInWithOAuth('google')}>
              <Ionicons name="logo-google" size={24} color={textColor} />
              <ThemedText style={styles.oauthText}>Sign up with Google</ThemedText>
            </TouchableOpacity>

          </View>

          <View style={styles.footer}>
            <ThemedText>Already have an account? </ThemedText>
            <Link href={"/auth/sign-in" as any} asChild>
              <TouchableOpacity>
                <ThemedText type="link">Sign In</ThemedText>
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
  },
  appleButton: {
    height: 50,
    width: '100%',
    marginBottom: 12,
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
