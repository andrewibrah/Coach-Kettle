// Shared authentication utilities
import { supabase, supabaseAnonKey } from './supabase';

/**
 * Get auth headers for API calls to Supabase Edge Functions.
 * Handles session refresh automatically.
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
    let { data: { session }, error } = await supabase.auth.getSession();

    // If no session or error, try to refresh
    if (!session || error) {
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshedSession) {
            throw new Error('Not authenticated - please sign in');
        }
        session = refreshedSession;
    }

    // Check if token expires soon (within 5 minutes) and refresh proactively
    if (session.expires_at) {
        const expiresAt = session.expires_at * 1000;
        const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

        if (expiresAt < fiveMinutesFromNow) {
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

            if (!refreshError && refreshedSession) {
                session = refreshedSession;
            }
        }
    }

    if (!session?.access_token) {
        throw new Error('Not authenticated - please sign in');
    }

    return {
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
    };
}

/**
 * Get auth headers with Content-Type for JSON requests
 */
export async function getJsonAuthHeaders(): Promise<HeadersInit> {
    const authHeaders = await getAuthHeaders();
    return { ...authHeaders, 'Content-Type': 'application/json' };
}

/**
 * Fetch with automatic 401 retry after session refresh
 */
export async function fetchWithAuth(url: string, options: RequestInit, retries = 1): Promise<Response> {
    const headers = await getJsonAuthHeaders();

    const res = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
    });

    // If 401 and we have retries left, try refreshing the session
    if (res.status === 401 && retries > 0) {
        const { data, error } = await supabase.auth.refreshSession();

        if (error || !data.session) {
            return res;
        }

        return fetchWithAuth(url, options, retries - 1);
    }

    return res;
}
