import { useTheme } from '@/components/ThemeProvider';
import { useColorScheme as useSystemColorScheme } from 'react-native';

/**
 * Returns the current color scheme, respecting user preference if set.
 * Falls back to system color scheme.
 */
export function useColorScheme(): 'light' | 'dark' {
  const systemScheme = useSystemColorScheme();

  // Try to use ThemeProvider if available
  try {
    const { colorScheme } = useTheme();
    return colorScheme;
  } catch {
    // ThemeProvider not available, fall back to system
    return systemScheme ?? 'light';
  }
}
