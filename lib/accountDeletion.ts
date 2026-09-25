/**
 * Account deletion flow logic, kept free of React Native imports so it can be
 * tested directly. The screen (app/settings/delete-account.tsx) wires in the real
 * provider re-auth (lib/reauth.ts), api.deleteAccount and the local cleanup.
 *
 * Order: fresh provider sign-in -> same-user check -> delete-account function ->
 * local cleanup. The function refuses a session whose last real sign-in is older
 * than 5 minutes (REAUTH_REQUIRED), so the re-auth must come right before the call.
 */

export type ReauthMethod = 'password' | 'apple' | 'google';

export type ReauthResult =
    | { status: 'ok'; userId: string | null; appleAuthorizationCode?: string | null }
    | { status: 'cancelled' }
    | { status: 'failed' };

type AuthUserLike = {
    email?: string | null;
    app_metadata?: { provider?: string; providers?: string[] } | null;
    identities?: { provider?: string }[] | null;
};

export const DELETE_CONFIRMATION_WORD = 'DELETE';

export const DELETE_ACCOUNT_MESSAGES = {
    cancelled: 'Sign-in was cancelled. Your account was not deleted.',
    reauthFailed: "We couldn't confirm it's you. Check your details and try again. Your account was not deleted.",
    wrongAccount: 'That sign-in was for a different account. Your account was not deleted.',
    reauthRequired: "For your security, please confirm it's you again, then try again.",
    generic: "Couldn't delete your account. Nothing was removed from your device; try again.",
    unsupported: "We couldn't tell how you signed in. Email privacy@coachkettle.app and we'll delete your account.",
} as const;

/** Which sign-in to repeat before deleting: the user's own provider. */
export function resolveReauthMethod(user: AuthUserLike | null | undefined): ReauthMethod | null {
    if (!user) return null;
    const providers = [
        user.app_metadata?.provider,
        ...(user.app_metadata?.providers ?? []),
        ...(user.identities ?? []).map((identity) => identity.provider),
    ];
    for (const provider of providers) {
        if (provider === 'email' && user.email) return 'password';
        if (provider === 'apple') return 'apple';
        if (provider === 'google') return 'google';
    }
    return null;
}

export function isDeleteConfirmationValid(input: string): boolean {
    return input.trim() === DELETE_CONFIRMATION_WORD;
}

export async function runAccountDeletion(deps: {
    expectedUserId: string;
    reauthenticate: () => Promise<ReauthResult>;
    /** Put the pre-re-auth session back (re-auth landed on another account). */
    restoreSession: () => Promise<void>;
    deleteAccount: (options: { appleAuthorizationCode?: string }) => Promise<unknown>;
    cancelLocalNotifications: () => Promise<void>;
    /** AuthProvider.signOut: clearAllCaches, RevenueCat logout, Supabase sign-out. */
    signOut: () => Promise<void>;
    /** Drops the local session even if the server sign-out failed (the user no longer exists). */
    signOutLocal: () => Promise<void>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    let reauth: ReauthResult;
    try {
        reauth = await deps.reauthenticate();
    } catch {
        return { ok: false, message: DELETE_ACCOUNT_MESSAGES.reauthFailed };
    }
    if (reauth.status === 'cancelled') return { ok: false, message: DELETE_ACCOUNT_MESSAGES.cancelled };
    if (reauth.status !== 'ok' || !reauth.userId) return { ok: false, message: DELETE_ACCOUNT_MESSAGES.reauthFailed };

    if (reauth.userId !== deps.expectedUserId) {
        try {
            await deps.restoreSession();
        } catch {
            // restoreSession already falls back to a local sign-out.
        }
        return { ok: false, message: DELETE_ACCOUNT_MESSAGES.wrongAccount };
    }

    try {
        await deps.deleteAccount(reauth.appleAuthorizationCode ? { appleAuthorizationCode: reauth.appleAuthorizationCode } : {});
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        return { ok: false, message: code === 'REAUTH_REQUIRED' ? DELETE_ACCOUNT_MESSAGES.reauthRequired : DELETE_ACCOUNT_MESSAGES.generic };
    }

    // The account is gone server-side; every local step runs even if one fails.
    for (const step of [deps.cancelLocalNotifications, deps.signOut, deps.signOutLocal]) {
        try {
            await step();
        } catch {
            // Keep going: a stale session or cache must not survive the deletion.
        }
    }
    return { ok: true };
}
