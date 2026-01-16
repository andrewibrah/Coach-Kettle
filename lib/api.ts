import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

// Use Supabase edge functions
const API_BASE = `${supabaseUrl}/functions/v1`;

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.info(`[api] Using Supabase Edge Functions: ${API_BASE}`);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  // Try to get current session
  let { data: { session }, error } = await supabase.auth.getSession();

  console.log("[getAuthHeaders] Initial session check:", {
    hasSession: !!session,
    hasError: !!error,
    errorMessage: error?.message,
    hasAccessToken: !!session?.access_token,
    expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    expiresIn: session?.expires_at ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000) : null,
  });

  // If no session or error, try to refresh
  if (!session || error) {
    console.log("[getAuthHeaders] No session or error, attempting refresh...");
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

    console.log("[getAuthHeaders] Refresh attempt:", {
      hasSession: !!refreshedSession,
      hasError: !!refreshError,
      errorMessage: refreshError?.message,
      hasAccessToken: !!refreshedSession?.access_token,
    });

    if (refreshError || !refreshedSession) {
      console.error("[getAuthHeaders] Refresh failed:", refreshError);
      throw new Error("Not authenticated - please sign in");
    }
    session = refreshedSession;
  }

  // Check if token is expired or expires soon (within 5 minutes)
  if (session.expires_at) {
    const expiresAt = session.expires_at * 1000; // Convert to milliseconds
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinutesFromNow) {
      console.log("[getAuthHeaders] Token expires soon, refreshing proactively...");
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

      console.log("[getAuthHeaders] Proactive refresh:", {
        hasSession: !!refreshedSession,
        hasError: !!refreshError,
        errorMessage: refreshError?.message,
      });

      if (!refreshError && refreshedSession) {
        session = refreshedSession;
      }
    }
  }

  if (!session?.access_token) {
    console.error("[getAuthHeaders] No access token available");
    throw new Error("Not authenticated - please sign in");
  }

  // Log token preview for debugging (without decoding)
  const tokenPreview = session.access_token.substring(0, 20) + "...";
  console.log("[getAuthHeaders] Using token:", {
    preview: tokenPreview,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  });


  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabaseAnonKey,
  };
}

async function getJsonAuthHeaders(): Promise<HeadersInit> {
  const authHeaders = await getAuthHeaders();
  return { ...authHeaders, "Content-Type": "application/json" };
}

export type ApiWorkoutRow = {
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
};

export type CoachResponse = {
  answer: string;
};

// Helper to handle 401 retries
async function fetchWithAuth(url: string, options: RequestInit, retries = 1): Promise<Response> {
  const headers = await getJsonAuthHeaders();

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  // If 401 and we have retries left, try refreshing the session
  if (res.status === 401 && retries > 0) {
    console.log(`[fetchWithAuth] Got 401 from ${url}, refreshing session and retrying...`);
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session) {
      console.error("[fetchWithAuth] Session refresh failed:", error);
      // Let the caller handle the 401 response from the original request or throw
      return res;
    }

    console.log("[fetchWithAuth] Session refreshed, retrying request...");
    // Retry with new token (getJsonAuthHeaders will pick up the new session)
    return fetchWithAuth(url, options, retries - 1);
  }

  return res;
}

export const api = {
  chat: async (message: string, rows: ApiWorkoutRow[]) => {
    const url = `${API_BASE}/chat`;

    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify({ message, rows }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} from ${url}: ${body}`);
      }

      return (await res.json()) as { rows: ApiWorkoutRow[]; answer?: string };
    } catch (error) {
      throw new Error(`Chat request failed: ${error}`);
    }
  },
  askCoach: async (question: string, rows: ApiWorkoutRow[], onChunk?: (chunk: string) => void) => {
    const url = `${API_BASE}/coach`;

    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify({ question, rows }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} from ${url}: ${body}`);
      }

      if (onChunk && res.body) {
        // Streaming mode
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          onChunk(chunk);
        }

        return { answer: fullText } as CoachResponse;
      } else {
        // Fallback for non-streaming or if no body (server returns text/plain now)
        const text = await res.text();
        return { answer: text } as CoachResponse;
      }
    } catch (error) {
      throw new Error(`Coach request failed: ${error}`);
    }
  },
  parse: async (message: string, lex?: string) => {
    const url = `${API_BASE}/parse`;

    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify({ message, lastExercise: lex }),
      });

      if (!res.ok) {
        throw new Error(`Parse failed: ${res.status}`);
      }

      return (await res.json()) as {
        kind: "fast" | "ai";
        reason?: string;
        rows?: { exercise: string; weightLbs: string; reps: string; notes: string }[];
        userHint?: string;
      };
    } catch (error) {
      throw new Error(`Parse request failed: ${error}`);
    }
  },
  saveWorkout: async (session: any) => {
    const url = `${API_BASE}/history`;
    console.log("[api.saveWorkout] Sending to:", url);
    console.log("[api.saveWorkout] Session data:", JSON.stringify(session, null, 2));

    let res: Response;
    try {
      res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify(session),
      });
    } catch (error) {
      console.error("[api.saveWorkout] Network error:", error);
      throw new Error(`Network error saving workout: ${error}`);
    }

    console.log("[api.saveWorkout] Response status:", res.status);
    if (!res.ok) {
      const body = await res.text();
      console.error("[api.saveWorkout] Error response:", body);
      throw new Error(`Failed to save workout: ${res.status} - ${body}`);
    }
    console.log("[api.saveWorkout] Save successful");
  },
  getHistory: async () => {
    const url = `${API_BASE}/history`;
    // For GET/DELETE we shouldn't use getJsonAuthHeaders inside fetchWithAuth blindly because it adds Content-Type
    // But fetchWithAuth uses getJsonAuthHeaders which adds Content-Type: application/json. 
    // Usually fine for GET but let's just use it for consistency or make fetchWithAuth more flexible.
    // Actually getHistory doesn't send body so Content-Type json is fine/ignored.

    // We need to implement fetchWithAuth to use getAuthHeaders for simple requests if we want, 
    // but getJsonAuthHeaders is fine for most Supabase functions.

    const res = await fetchWithAuth(url, { method: "GET" });
    if (!res.ok) throw new Error("Failed to fetch history");
    return await res.json();
  },
  deleteWorkout: async (id: string) => {
    const url = `${API_BASE}/history/${id}`;
    await fetchWithAuth(url, { method: "DELETE" });
  },
  logSet: async (row: ApiWorkoutRow) => {
    const url = `${API_BASE}/log-set`;

    try {
      await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify(row),
      });
    } catch (error) {
      console.error("[api.logSet] Failed to log set:", error);
      // Fail silently for logging
    }
  },
};
