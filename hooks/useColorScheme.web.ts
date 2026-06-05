import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useTheme } from '@/contexts/ThemeProvider';

/**
 * Web color scheme.
 *
 * Like the native hook, this respects the user's saved preference from
 * `ThemeProvider` (system / light / dark) — NOT just the OS scheme. Previously
 * this file returned only the OS scheme, so toggling the theme in settings did
 * nothing on web.
 *
 * Static rendering (`web.output: "static"`) pre-renders with no `localStorage`,
 * so we report 'light' until the client has hydrated to avoid a hydration
 * mismatch; the pre-paint guard in `app/+html.tsx` paints the correct
 * background before this resolves, so there's no visible flash.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const systemScheme = useRNColorScheme();

  let resolved: 'light' | 'dark';
  try {
    resolved = useTheme().colorScheme;
  } catch {
    resolved = systemScheme === 'dark' ? 'dark' : 'light';
  }

  return hasHydrated ? resolved : 'light';
}
