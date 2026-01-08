import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // This route captures the redirect.
    // The supabase client or WebBrowser session handling logic should have already processed the token/code.
    // We just redirect to home/tabs.
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText>Verifying...</ThemedText>
    </ThemedView>
  );
}
