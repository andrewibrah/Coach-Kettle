import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import { fetchProfile, UserProfile } from './profile';

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

    const currentPrs = ctx.current_prs as Array<{ lift: string; best: { weight: number; reps: number; e1rm: number } }> | undefined;
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
};

export type CoachResponse = {
    answer: string;
};

export const api = {
    chat: async (message: string, rows: ApiWorkoutRow[]) => {
        const res = await fetchWithAuth(`${API_BASE}/chat`, {
            method: 'POST',
            body: JSON.stringify({ message, rows }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        return (await res.json()) as { rows: ApiWorkoutRow[]; answer?: string };
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

        const reviewPrompt = `Analyze this ${workoutPart || 'workout'} session and provide a JSON review with:${profileContext}

Consider the user's profile when evaluating and providing advice.
- rating: number 1-10 based on volume, intensity, exercise selection
- strengths: array of 2-3 brief positive points about the session
- weakness: one area to improve (string)
- nextSessionNote: one actionable tip for next session (string)

Respond ONLY with valid JSON, no other text. Example format:
{"rating":8,"strengths":["Good volume on compound lifts","Progressive overload on bench"],"weakness":"Could add more isolation work","nextSessionNote":"Try adding a finisher set next time"}`;

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
        await fetchWithAuth(`${API_BASE}/history/${id}`, { method: 'DELETE' });
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
