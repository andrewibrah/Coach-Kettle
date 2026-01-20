import { Ionicons } from '@expo/vector-icons';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
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
import { setLastAuthenticatedAt } from '@/lib/authLock';
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

  // Create redirect URL
  const redirectTo = makeRedirectUri({
    scheme: 'easyworkouts',
    path: 'auth/callback',
  });

  async function signInWithEmail() {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) {
      Alert.alert('Sign In Failed', error.message);
    } else {
      // Refresh auth timestamp for TTL tracking
      await setLastAuthenticatedAt();
      router.replace('/(tabs)');
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
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (result.type === 'success' && result.url) {
          const params = Linking.parse(result.url);
          if (params.queryParams?.code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(params.queryParams.code as string);
            if (sessionError) throw sessionError;
          }
          // Refresh auth timestamp for TTL tracking
          await setLastAuthenticatedAt();
          router.replace('/(tabs)');
        }
      }
    } catch (err: any) {
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
