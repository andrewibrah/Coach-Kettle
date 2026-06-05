import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { accentColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { checkServerTermsAcceptance, setLastAuthenticatedAt } from '@/lib/authLock';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

export default function AuthCallback() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Verifying...');

  useEffect(() => {
    async function handleCallback() {
      try {
        // Get the URL that opened this screen
        const url = await Linking.getInitialURL();
        let queryParams = url ? Linking.parse(url).queryParams : null;

        // Also check for hash params (implicit flow)
        if (url && (!queryParams || Object.keys(queryParams).length === 0) && url.includes('#')) {
          const hashPart = url.split('#')[1];
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

        if (queryParams) {
          // Handle OAuth code exchange (PKCE flow)
          if (queryParams.code) {
            setStatus('Exchanging code...');
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(
              queryParams.code as string
            );

            if (sessionError) {
              console.error('[AuthCallback] Code exchange failed:', sessionError);
              setError(sessionError.message);
              return;
            }

            await completeAuthAndNavigate();
            return;
          }

          // Handle access_token (implicit flow)
          if (queryParams.access_token) {
            setStatus('Setting session...');
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: queryParams.access_token as string,
              refresh_token: queryParams.refresh_token as string || '',
            });

            if (sessionError) {
              console.error('[AuthCallback] Set session failed:', sessionError);
              setError(sessionError.message);
              return;
            }

            await completeAuthAndNavigate();
            return;
          }

          // Handle error from OAuth provider
          if (queryParams.error) {
            const errorDesc = queryParams.error_description || queryParams.error;
            console.error('[AuthCallback] OAuth error:', errorDesc);
            setError(errorDesc as string);
            return;
          }
        }

        // Check if we already have a valid session (WebBrowser might have handled it)
        setStatus('Checking session...');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await completeAuthAndNavigate();
          return;
        }

        // No code, no token, no session - redirect to sign-in
        console.warn('[AuthCallback] No auth params found, redirecting to sign-in');
        router.replace('/auth/sign-in');

      } catch (err) {
        console.error('[AuthCallback] Error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    }

    async function completeAuthAndNavigate() {
      // 1. Refresh auth timestamp for TTL tracking
      await setLastAuthenticatedAt();

      // 2. Check if user needs to accept terms
      setStatus('Checking terms acceptance...');
      const termsStatus = await checkServerTermsAcceptance();

      console.log('[AuthCallback] Terms status:', termsStatus);

      if (termsStatus?.needsAcceptance) {
        // User needs to accept terms - redirect to terms screen
        console.log('[AuthCallback] User needs to accept terms, redirecting...');
        router.replace('/terms-of-service');
      } else {
        // User has accepted terms - go to main app
        console.log('[AuthCallback] Terms accepted, going to app...');
        router.replace('/(tabs)');
      }
    }

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <ThemedText style={{ color: '#EF4444', marginBottom: 16, textAlign: 'center' }}>
          {error}
        </ThemedText>
        <ThemedText
          style={{ color: accentColor(isDark) }}
          onPress={() => router.replace('/auth/sign-in')}
        >
          Back to Sign In
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <ThemedText style={{ marginTop: 16 }}>{status}</ThemedText>
    </ThemedView>
  );
}
