import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import { fetchProfile, UserProfile } from './profile';

// Domain API re-exports (Phase 1 expansion)
export * as NutritionAPI from './nutrition';
export * as CoachingAPI from './coaching';
export * as ProgrammingAPI from './programming';
export * as BodyMetricsAPI from './bodyMetrics';
export * as ExerciseLibraryAPI from './exerciseLibrary';

// Cache for user profile to avoid repeated fetches
let cachedProfile: UserProfile | null = null;
let profileCacheTime = 0;
const PROFILE_CACHE_TTL = 60000; // 1 minute cache

async function getCachedProfile(userId: string): Promise<UserProfile | null> {
    const now = Date.now();
    if (cachedProfile && (now - profileCacheTime) < PROFILE_CACHE_TTL) {
        return cachedProfile;
    }

    cachedProfile = await fetchProfile(userId);
    profileCacheTime = now;
    return cachedProfile;
}

// Invalidate the profile cache (call after profile updates)
export function invalidateProfileCache(): void {
    cachedProfile = null;
    profileCacheTime = 0;
}

// Build personalized context for AI
function buildAIContextString(profile: UserProfile | null): string {
    if (!profile || !profile.ai_context) return '';

    const ctx = profile.ai_context as Record<string, unknown>;
    const parts: string[] = [];

    const height = ctx.height as { value?: number; unit?: string } | undefined;
    if (height?.value) {
        parts.push(`Height: ${height.value}${height.unit}`);
    }

    if (ctx.dob) {
        const age = Math.floor((Date.now() - new Date(ctx.dob as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        parts.push(`Age: ${age} years`);
    }

    const currentWeight = ctx.current_weight as { value?: number; unit?: string } | undefined;
    if (currentWeight?.value) {
        parts.push(`Current weight: ${currentWeight.value}${currentWeight.unit}`);
    }

    const goalWeight = ctx.goal_weight as { value?: number; unit?: string } | undefined;
    if (goalWeight?.value) {
        parts.push(`Goal weight: ${goalWeight.value}${goalWeight.unit}`);
    }

    const focus = ctx.focus as { type?: string; other?: string } | undefined;
    if (focus?.type && focus.type !== 'other') {
        const focusLabel = focus.type.replace('_', ' ');
        parts.push(`Fitness focus: ${focusLabel}`);
    } else if (focus?.other) {
        parts.push(`Fitness focus: ${focus.other}`);
    }

    const currentPrs = ctx.current_prs as { lift: string; best: { weight: number; reps: number; e1rm: number } }[] | undefined;
    if (currentPrs && currentPrs.length > 0) {
        const prStrings = currentPrs.map((pr) =>
            `${pr.lift}: ${pr.best.weight}lbs x ${pr.best.reps} (E1RM: ${pr.best.e1rm}lbs)`
        ).join(', ');
        parts.push(`Current PRs: ${prStrings}`);
    }

    return parts.length > 0 ? `\n\nUser Profile: ${parts.join('. ')}.` : '';
}

const API_BASE = `${supabaseUrl}/functions/v1`;

export type ApiWorkoutRow = {
    exercise: string;
    set: number;
    weightLbs: string;
    reps: string;
    notes: string;
    // Cardio fields
    isCardio?: boolean;
    durationMins?: number;
    distance?: number;
    distanceUnit?: 'miles' | 'km' | 'meters';
    heartRate?: number;
    calories?: number;
    level?: number;
};

export type CoachResponse = {
    answer: string;
};

export const api = {
    chat: async (message: string, rows: ApiWorkoutRow[], lastExercise?: string) => {
        const res = await fetchWithAuth(`${API_BASE}/chat`, {
            method: 'POST',
            body: JSON.stringify({
                message,
                rows,
                ...(lastExercise ? { lastExercise } : {}),
            }),
        });
        

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        return (await res.json()) as { rows?: ApiWorkoutRow[]; answer?: string };
    },

    askCoach: async (
        question: string,
        rows: ApiWorkoutRow[],
        onChunk?: (chunk: string) => void,
        chatHistory?: { role: string; content: string }[]
    ) => {
        // Profile context is now fetched server-side by the coach edge function
        const res = await fetchWithAuth(`${API_BASE}/coach`, {
            method: 'POST',
            body: JSON.stringify({
                question,
                rows,
                ...(chatHistory && chatHistory.length > 0 ? { chatHistory } : {}),
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        if (onChunk && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                onChunk(chunk);
            }

            return { answer: fullText } as CoachResponse;
        } else {
            const text = await res.text();
            return { answer: text } as CoachResponse;
        }
    },

    generateSessionReview: async (rows: ApiWorkoutRow[], workoutPart: string): Promise<{
        rating: number;
        strengths: string[];
        weakness: string;
        nextSessionNote: string;
    }> => {
        const profile = await getCachedProfile('');
        const profileContext = buildAIContextString(profile);

        const reviewPrompt = `You are generating a structured workout review. OVERRIDE your usual response style: respond ONLY with valid JSON — no plain text, no markdown, no preamble.${profileContext}

Analyze the current session (provided as current_session_rows) against the workout history and profile already in your context. Apply these exact rating criteria:

RATING (1-10):
- Base: 5. A completed session with reasonable effort.
- +1 if working weight is at or above 70% of e1RM for the primary compound lift (use PRs in context).
- +1 if rep ranges match the user's goal: strength=3-6 reps, hypertrophy=8-12 reps, endurance=12+ reps.
- +1 if total volume (sets x reps x weight) on the primary lift equals or exceeds the most recent same-part session in history.
- +1 if compound-to-isolation set ratio is 60% or higher.
- -1 if a late set shows a significant weight drop (20+ lbs) suggesting early failure.
- -1 if fewer than 3 exercises were logged for a strength session.
- Cap at 10, floor at 1.

STRENGTHS (array of 2-3 strings): Cite specific numbers from current_session_rows. Example: "Hit 185lbs x 8 on bench — solid hypertrophy rep range." Generic praise is not acceptable.

WEAKNESS (string): Name the specific problem and its evidence. Example: "Bench dropped from 185 to 165 on set 3 — cut to 2 working sets at this intensity next time." Do not write abstract feedback like "fatigue risk."

NEXT_SESSION_NOTE (string): Give a specific progressive overload instruction using actual numbers from this session. Example: "All reps completed at 185lbs — try 190x8 next ${workoutPart || 'session'}." If reps were missed, suggest dropping volume instead of adding weight.

JSON shape — respond with exactly this structure:
{"rating": <number>,"strengths": [<string>, <string>],"weakness": <string>,"nextSessionNote": <string>}`;

        try {
            const res = await fetchWithAuth(`${API_BASE}/coach`, {
                method: 'POST',
                body: JSON.stringify({ question: reviewPrompt, rows }),
            });

            if (!res.ok) {
                const body = await res.text();
                throw new Error(`HTTP ${res.status}: ${body}`);
            }

            const text = await res.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                rating: Math.min(10, Math.max(1, Number(parsed.rating) || 7)),
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : ['Great effort today!'],
                weakness: String(parsed.weakness || 'Keep pushing yourself'),
                nextSessionNote: String(parsed.nextSessionNote || 'Stay consistent and keep logging your workouts'),
            };
        } catch {
            return {
                rating: 7,
                strengths: ['Completed your workout', 'Logged all your sets'],
                weakness: 'Consider tracking more details',
                nextSessionNote: 'Keep up the consistency!',
            };
        }
    },

    parse: async (message: string, lex?: string) => {
        const res = await fetchWithAuth(`${API_BASE}/parse`, {
            method: 'POST',
            body: JSON.stringify({ message, lastExercise: lex }),
        });

        if (!res.ok) {
            throw new Error(`Parse failed: ${res.status}`);
        }

        return (await res.json()) as {
            kind: 'fast' | 'ai';
            reason?: string;
            rows?: { exercise: string; weightLbs: string; reps: string; notes: string }[];
            userHint?: string;
        };
    },

    saveWorkout: async (session: unknown) => {
        const res = await fetchWithAuth(`${API_BASE}/history`, {
            method: 'POST',
            body: JSON.stringify(session),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to save workout: ${res.status} - ${body}`);
        }
    },

    getHistory: async () => {
        const res = await fetchWithAuth(`${API_BASE}/history`, { method: 'GET' });
        if (!res.ok) throw new Error('Failed to fetch history');
        return await res.json();
    },

    deleteWorkout: async (id: string) => {
        const res = await fetchWithAuth(`${API_BASE}/history/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to delete workout: ${res.status} - ${body}`);
        }
    },

    logSet: async (row: ApiWorkoutRow) => {
        try {
            await fetchWithAuth(`${API_BASE}/log-set`, {
                method: 'POST',
                body: JSON.stringify(row),
            });
        } catch {
            // Fail silently for logging
        }
    },

    updateWorkoutMeta: async (workoutId: string, meta: { reflection?: string }) => {
        const res = await fetchWithAuth(`${API_BASE}/history/${workoutId}`, {
            method: 'PATCH',
            body: JSON.stringify(meta),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to update workout: ${res.status} - ${body}`);
        }

        return (await res.json()) as { ok: boolean };
    },

    checkTermsAcceptance: async () => {
        const res = await fetchWithAuth(`${API_BASE}/terms-acceptance`, { method: 'GET' });

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
    },

    // Entitlement methods
    getEntitlement: async () => {
        const res = await fetchWithAuth(`${API_BASE}/entitlements`, { method: 'GET' });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to get entitlement: ${res.status} - ${body}`);
        }
        return (await res.json()) as {
            ok: boolean;
            data: {
                status: string | null;
                source: string | null;
                expires_at: string | null;
                trial_days_remaining: number | null;
                subscription_id: string | null;
                paywall_dismissed: boolean;
            };
        };
    },

    bootstrapEntitlement: async () => {
        const res = await fetchWithAuth(`${API_BASE}/entitlements`, {
            method: 'POST',
            body: JSON.stringify({ action: 'bootstrap' }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to bootstrap entitlement: ${res.status} - ${body}`);
        }
        return (await res.json()) as {
            ok: boolean;
            data: {
                entitlement_status: string;
                expires_at: string;
                is_new_trial: boolean;
                paywall_dismissed: boolean;
            };
        };
    },

    dismissPaywall: async () => {
        const res = await fetchWithAuth(`${API_BASE}/entitlements`, {
            method: 'POST',
            body: JSON.stringify({ action: 'dismiss_paywall' }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to dismiss paywall: ${res.status} - ${body}`);
        }
        return (await res.json()) as { ok: boolean };
    },

    checkAiUsage: async () => {
        const res = await fetchWithAuth(`${API_BASE}/entitlements`, {
            method: 'POST',
            body: JSON.stringify({ action: 'check_ai_usage' }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to check AI usage: ${res.status} - ${body}`);
        }
        return (await res.json()) as {
            ok: boolean;
            data: {
                count: number;
                limit: number;
                is_pro: boolean;
                remaining: number;
            };
        };
    },

    verifyReceipt: async (receiptData: string, productId: string) => {
        const res = await fetchWithAuth(`${API_BASE}/iap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify_receipt', receipt_data: receiptData, product_id: productId }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to verify receipt: ${res.status} - ${body}`);
        }
        return (await res.json()) as {
            ok: boolean;
            data: {
                status: string;
                expires_at: string;
            };
        };
    },

    restorePurchase: async (receiptData: string) => {
        const res = await fetchWithAuth(`${API_BASE}/iap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restore', receipt_data: receiptData }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to restore purchase: ${res.status} - ${body}`);
        }
        return (await res.json()) as {
            ok: boolean;
            data: {
                status: string;
                expires_at?: string;
            };
        };
    },

    recordTermsAcceptance: async (termsVersion?: string, privacyVersion?: string) => {
        const res = await fetchWithAuth(`${API_BASE}/terms-acceptance`, {
            method: 'POST',
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
    },
};
