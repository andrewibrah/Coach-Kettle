/**
 * Shared handling for Supabase auth redirects (OAuth / magic link) used by
 * sign-in, the auth callback route and re-authentication (lib/reauth.ts).
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

export type AuthRedirectParams = Record<string, string | string[] | undefined>;

/**
 * Query params of an auth redirect URL. If there are none, falls back to the
 * hash: Supabase implicit flow returns tokens there (#access_token=...).
 */
export function parseAuthRedirectParams(url: string): AuthRedirectParams {
  let queryParams: AuthRedirectParams | null | undefined = Linking.parse(url).queryParams;

  if ((!queryParams || Object.keys(queryParams).length === 0) && url.includes('#')) {
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

  return queryParams ?? {};
}

/**
 * Turns redirect params into a session: PKCE code exchange, else implicit-flow
 * tokens. Throws on a Supabase error or an `error` param from the provider.
 * Returns null when the params carry none of these.
 */
export async function establishSessionFromParams(params: AuthRedirectParams): Promise<{ userId: string | null } | null> {
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code as string);
    if (error) throw error;
    return { userId: data?.user?.id ?? null };
  }

  if (params.access_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token as string,
      refresh_token: (params.refresh_token as string) || '',
    });
    if (error) throw error;
    return { userId: data?.user?.id ?? null };
  }

  if (params.error) {
    throw new Error((params.error_description as string) || (params.error as string));
  }

  return null;
}

/**
 * Starts provider OAuth in an in-app auth session. Throws if Supabase can't
 * build the authorize URL.
 */
export async function openOAuthSession(
  provider: 'google',
  redirectTo: string,
): Promise<{ type: 'success'; params: AuthRedirectParams } | { type: 'dismiss' } | { type: 'other' }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) return { type: 'other' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: true });

  if (result.type === 'success' && result.url) {
    return { type: 'success', params: parseAuthRedirectParams(result.url) };
  }
  if (result.type === 'dismiss') return { type: 'dismiss' };
  return { type: 'other' };
}
