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

  // Debug: Check JWT Algo
  try {
    const headerPart = session.access_token.split('.')[0];
    const decodedHeader = JSON.parse(atob(headerPart));
    console.log("[getAuthHeaders] Token Header:", decodedHeader);
  } catch (e) {
    console.log("[getAuthHeaders] Failed to decode token header");
  }

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
  generateSessionReview: async (rows: ApiWorkoutRow[], workoutPart: string): Promise<{
    rating: number;
    strengths: string[];
    weakness: string;
    nextSessionNote: string;
  }> => {
    const url = `${API_BASE}/coach`;

    const reviewPrompt = `Analyze this ${workoutPart || 'workout'} session and provide a JSON review with:
- rating: number 1-10 based on volume, intensity, exercise selection
- strengths: array of 2-3 brief positive points about the session
- weakness: one area to improve (string)
- nextSessionNote: one actionable tip for next session (string)

Respond ONLY with valid JSON, no other text. Example format:
{"rating":8,"strengths":["Good volume on compound lifts","Progressive overload on bench"],"weakness":"Could add more isolation work","nextSessionNote":"Try adding a finisher set next time"}`;

    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify({ question: reviewPrompt, rows }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const text = await res.text();

      // Try to parse JSON from the response
      // The response might have some text around the JSON, so we try to extract it
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        rating: Math.min(10, Math.max(1, Number(parsed.rating) || 7)),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : ["Great effort today!"],
        weakness: String(parsed.weakness || "Keep pushing yourself"),
        nextSessionNote: String(parsed.nextSessionNote || "Stay consistent and keep logging your workouts"),
      };
    } catch (error) {
      console.error("[api.generateSessionReview] Error:", error);
      // Return a fallback review if AI fails
      return {
        rating: 7,
        strengths: ["Completed your workout", "Logged all your sets"],
        weakness: "Consider tracking more details",
        nextSessionNote: "Keep up the consistency!",
      };
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

  // Terms Acceptance APIs
  checkTermsAcceptance: async () => {
    const url = `${API_BASE}/terms-acceptance`;

    try {
      const res = await fetchWithAuth(url, { method: "GET" });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to check terms acceptance: ${res.status} - ${body}`);
      }

      return (await res.json()) as {
        accepted: boolean;
        needs_acceptance: boolean;
        accepted_terms_version?: string;
        accepted_privacy_version?: string;
        accepted_at?: string;
        current_terms_version: string;
        current_privacy_version: string;
      };
    } catch (error) {
      console.error("[api.checkTermsAcceptance] Error:", error);
      throw error;
    }
  },

  recordTermsAcceptance: async (termsVersion?: string, privacyVersion?: string) => {
    const url = `${API_BASE}/terms-acceptance`;

    try {
      const res = await fetchWithAuth(url, {
        method: "POST",
        body: JSON.stringify({
          terms_version: termsVersion,
          privacy_version: privacyVersion,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to record terms acceptance: ${res.status} - ${body}`);
      }

      return (await res.json()) as {
        ok: boolean;
        accepted_at?: string;
        terms_version: string;
        privacy_version: string;
        message?: string;
      };
    } catch (error) {
      console.error("[api.recordTermsAcceptance] Error:", error);
      throw error;
    }
  },
};
