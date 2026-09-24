import { useTheme } from '@/contexts/ThemeProvider';

/**
 * Returns the current color scheme, respecting user preference if set.
 * Falls back to system color scheme.
 *
 * `ThemeContext` has a non-null default value and is never undefined outside
 * a provider, so this calls `useTheme()` unconditionally — no try/catch
 * needed, and none allowed: catching around a hook call makes it conditional,
 * which violates the rules of hooks.
 */
export function useColorScheme(): 'light' | 'dark' {
  const { colorScheme } = useTheme();
  return colorScheme;
}
