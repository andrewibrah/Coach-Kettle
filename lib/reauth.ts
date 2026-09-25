/**
 * Provider re-authentication for sensitive actions (account deletion).
 *
 * The same sign-in flows as app/auth/sign-in.tsx (Google via the shared
 * lib/authRedirect.ts helpers) without their navigation: each call performs a real sign-in, which gives the session a fresh `amr`
 * timestamp for the delete-account recency check. Nothing here is persisted;
 * the password and the Apple authorization code only pass through.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';

import type { ReauthMethod, ReauthResult } from '@/lib/accountDeletion';
import { establishSessionFromParams, openOAuthSession } from '@/lib/authRedirect';
import { supabase } from '@/lib/supabase';

async function reauthWithPassword(email: string | null | undefined, password: string | undefined): Promise<ReauthResult> {
    if (!email || !password) return { status: 'failed' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return { status: 'failed' };
    return { status: 'ok', userId: data.user.id };
}

async function reauthWithApple(): Promise<ReauthResult> {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
        credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    } catch (err: any) {
        // ERR_REQUEST_CANCELED is fired when the user dismisses the SIWA sheet
        if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === '1001') return { status: 'cancelled' };
        return { status: 'failed' };
    }
    if (!credential.identityToken) return { status: 'failed' };

    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
    });
    if (error || !data?.user) return { status: 'failed' };
    // Single-use and valid for 5 minutes: handed straight to deleteAccount for Apple token revocation.
    return { status: 'ok', userId: data.user.id, appleAuthorizationCode: credential.authorizationCode };
}

async function reauthWithGoogle(): Promise<ReauthResult> {
    const redirectTo = makeRedirectUri({ scheme: 'coachkettle', path: 'auth/callback' });
    const outcome = await openOAuthSession('google', redirectTo);
    // Unlike sign-in, a dismissed browser never falls back to getSession(): the
    // existing session is the stale one this re-auth is meant to replace.
    if (outcome.type !== 'success') return { status: 'cancelled' };

    // Throws on a provider error param or a failed exchange; reauthenticate() maps that to 'failed'.
    const session = await establishSessionFromParams(outcome.params);
    if (!session?.userId) return { status: 'failed' };
    return { status: 'ok', userId: session.userId };
}

export async function reauthenticate(
    method: ReauthMethod,
    credentials: { email?: string | null; password?: string },
): Promise<ReauthResult> {
    try {
        if (method === 'password') return await reauthWithPassword(credentials.email, credentials.password);
        if (method === 'apple') return await reauthWithApple();
        return await reauthWithGoogle();
    } catch {
        return { status: 'failed' };
    }
}

/** Sign out on this device only (no server call; the user may no longer exist). */
export async function signOutLocal(): Promise<void> {
    await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Re-auth landed on a different account: put the original session back. If that
 * fails, sign out locally rather than leave the other account signed in.
 */
export async function restoreSession(previous: { access_token: string; refresh_token: string } | null): Promise<void> {
    if (previous) {
        const { error } = await supabase.auth.setSession({
            access_token: previous.access_token,
            refresh_token: previous.refresh_token,
        });
        if (!error) return;
    }
    await signOutLocal();
}
