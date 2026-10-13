import { isPerformedRow } from './performedSets';
import { supabaseUrl } from './supabase';
import type { LogRow } from '../types/workout';
import type { CoachingContext } from './coachingContext';
import type { COACHING_POLICY } from './coachingPolicy';
import { fetchWithAuth } from './auth';
import { fetchProfile, UserProfile } from './profile';
import { parseFeatureGateError } from './entitlements';

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
// Client responsiveness deadline, not coaching policy: max silence (no response
// or chunk) before a coach request is aborted as retryable. Longer than P2's 5000 ms
// optional-review wait because first token includes server context fetch + provider latency.
const COACH_IDLE_MS = 20000;

export type ApiWorkoutRow = {
    // Optional canonical evidence; legacy/parse responses may omit it.
    id?: LogRow["id"];
    timestamp?: LogRow["timestamp"];
    performance?: LogRow["performance"];
    setKind?: LogRow["setKind"];
    plannedTarget?: LogRow["plannedTarget"];
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

export type LogSetPR = {
    liftName: string;
    weight: number;
    reps: number;
    newE1rm: number;
    previousE1rm: number | null;
};

export type LogSetResult = {
    ok: boolean;
    exercise?: string;
    pr?: LogSetPR | null;
};

export type DeleteAccountErrorCode =
    | 'CONFIRMATION_REQUIRED'
    | 'REAUTH_REQUIRED'
    | 'CONFIG_MISSING'
    | 'REVENUECAT_DELETE_FAILED'
    | 'STORAGE_DELETE_FAILED'
    | 'DB_PURGE_FAILED'
    | 'AUTH_DELETE_FAILED';

const DELETE_ACCOUNT_ERROR_CODES: DeleteAccountErrorCode[] = [
    'CONFIRMATION_REQUIRED',
    'REAUTH_REQUIRED',
    'CONFIG_MISSING',
    'REVENUECAT_DELETE_FAILED',
    'STORAGE_DELETE_FAILED',
    'DB_PURGE_FAILED',
    'AUTH_DELETE_FAILED',
];

/**
 * A delete-account failure the server explained. `REAUTH_REQUIRED` means the session's
 * last sign-in is over 5 minutes old: sign in again, then retry. Every step is idempotent,
 * so retrying after any other code is safe.
 */
export class DeleteAccountError extends Error {
    readonly code: DeleteAccountErrorCode | null;
    readonly status: number;
    constructor(message: string, code: DeleteAccountErrorCode | null, status: number) {
        super(message);
        this.name = 'DeleteAccountError';
        this.code = code;
        this.status = status;
    }
}

export const api = {
    // `context` is supplied only while COACHING_POLICY.contextualDisclosures is on.
    chat: async (message: string, rows: ApiWorkoutRow[], lastExercise?: string, context?: CoachingContext) => {
        const res = await fetchWithAuth(`${API_BASE}/chat`, {
            method: 'POST',
            body: JSON.stringify({
                message,
                rows,
                ...(lastExercise ? { lastExercise } : {}),
                ...(context ? { context } : {}),
            }),
        });
        

        if (!res.ok) {
            const body = await res.text();
            const gateError = parseFeatureGateError(res.status, body);
            if (gateError) throw gateError;
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        return (await res.json()) as { rows?: ApiWorkoutRow[]; answer?: string };
    },

    askCoach: async (
        question: string,
        rows: ApiWorkoutRow[],
        onChunk?: (chunk: string) => void,
        chatHistory?: { role: string; content: string }[],
        context?: CoachingContext,
        clock = { setTimeout, clearTimeout }
    ) => {
        // A stalled request or stream must not leave the coach Loading forever:
        // abort when nothing arrives for COACH_IDLE_MS.
        const controller = new AbortController();
        let expire!: (error: Error) => void;
        const stalled = new Promise<never>((_, reject) => { expire = reject; });
        stalled.catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arm = () => {
            clock.clearTimeout(timer);
            // Settle the readable error first: real fetch rejects a pending read on abort.
            timer = clock.setTimeout(() => { expire(new Error('Coach stopped responding.')); controller.abort(); }, COACH_IDLE_MS);
        };
        try {
            arm();
            // Profile context is now fetched server-side by the coach edge function
            const res = await Promise.race([fetchWithAuth(`${API_BASE}/coach`, {
                method: 'POST',
                body: JSON.stringify({
                    question,
                    rows,
                    ...(chatHistory && chatHistory.length > 0 ? { chatHistory } : {}),
                    ...(context ? { context } : {}),
                }),
                signal: controller.signal,
            }), stalled]);

            if (!res.ok) {
                const body = await Promise.race([res.text(), stalled]);
                const gateError = parseFeatureGateError(res.status, body);
                if (gateError) throw gateError;
                throw new Error(`HTTP ${res.status}: ${body}`);
            }

            if (onChunk && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';

                while (true) {
                    const { done, value } = await Promise.race([reader.read(), stalled]);
                    if (done) break;
                    arm();
                    const chunk = decoder.decode(value, { stream: true });
                    fullText += chunk;
                    onChunk(chunk);
                }

                return { answer: fullText } as CoachResponse;
            } else {
                const text = await Promise.race([res.text(), stalled]);
                return { answer: text } as CoachResponse;
            }
        } finally {
            clock.clearTimeout(timer);
        }
    },

    // Q2a/Q4a switches; omitted policy means off (pre-policy prompt and payload).
    generateSessionReview: async (rows: ApiWorkoutRow[], workoutPart: string, policy?: Pick<typeof COACHING_POLICY, 'reviewSetPolicy' | 'suppressReviewLoadAdvice'>): Promise<{
        rating: number;
        strengths: string[];
        weakness: string;
        nextSessionNote: string;
    }> => {
        rows = rows.filter(row => !row.isCardio && row.setKind !== 'cardio' && isPerformedRow(row) &&
            !(policy?.reviewSetPolicy && row.setKind === 'warmup'));
        if (!rows.length) throw new Error('Session review unavailable');
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
- -1 if a late set shows a significant weight drop (20+ lbs) suggesting early failure.${policy?.reviewSetPolicy ? ' Rows with setKind "backoff" or "drop" are prescribed lighter sets: never apply this penalty to them.' : ''}
- -1 if fewer than 3 exercises were logged for a strength session.
- Cap at 10, floor at 1.

STRENGTHS (array of 2-3 strings): Cite specific numbers from current_session_rows. Example: "Hit 185lbs x 8 on bench — solid hypertrophy rep range." Generic praise is not acceptable.

WEAKNESS (string): Name the specific problem and its evidence. Example: "Bench dropped from 185 to 165 on set 3 — cut to 2 working sets at this intensity next time." Do not write abstract feedback like "fatigue risk."

${policy?.suppressReviewLoadAdvice
    ? `NEXT_SESSION_NOTE (string): Name one specific focus for next ${workoutPart || 'session'} using evidence from this session (rep completion, set quality). Do not prescribe any weight, load or load increase.`
    : `NEXT_SESSION_NOTE (string): Give a specific progressive overload instruction using actual numbers from this session. Example: "All reps completed at 185lbs — try 190x8 next ${workoutPart || 'session'}." If reps were missed, suggest dropping volume instead of adding weight.`}

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
            if (!parsed || typeof parsed.rating !== 'number' || !Number.isFinite(parsed.rating)
                || parsed.rating < 1 || parsed.rating > 10
                || !Array.isArray(parsed.strengths) || !parsed.strengths.every((item: unknown) => typeof item === 'string')
                || typeof parsed.weakness !== 'string' || typeof parsed.nextSessionNote !== 'string') {
                throw new Error('Invalid session review');
            }

            return {
                rating: parsed.rating,
                strengths: parsed.strengths.slice(0, 3),
                weakness: parsed.weakness,
                // Q4a enforcement: a numeric load in the note is dropped, never rewritten.
                nextSessionNote: policy?.suppressReviewLoadAdvice && /\d+(\.\d+)?\s*(lb|lbs|kg|pounds|%)/i.test(parsed.nextSessionNote)
                    ? '' : parsed.nextSessionNote,
            };
        } catch {
            // Optional AI failure must not manufacture evidence of completion.
            throw new Error('Session review unavailable');
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

    /** `expectedOwner` refuses to send under a different signed-in account (background sync). */
    saveWorkout: async (session: unknown, expectedOwner?: string) => {
        const res = await fetchWithAuth(`${API_BASE}/history`, {
            method: 'POST',
            body: JSON.stringify(session),
        }, 1, expectedOwner);

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
        // Deletion is terminal: an ID can never be reused/resurrected. Derive one
        // permanent identity instead of a clock key or a process-local retry cache.
        // This survives lost acknowledgements, successful retries and app restarts.
        const revision = Number.MAX_SAFE_INTEGER;
        const operationKey = `delete:${id}:terminal:v1`;
        const res = await fetchWithAuth(`${API_BASE}/history/${id}`, {
            method: 'DELETE', body: JSON.stringify({ id, revision, operationKey }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to delete workout: ${res.status} - ${body}`);
        }
        return await res.json();
    },

    logSet: async (row: ApiWorkoutRow & { dateISO?: string; sessionId?: string; rowId?: string; revision?: number; operationKey?: string; operation?: 'put' | 'drop' }): Promise<LogSetResult | null> => {
        try {
            const res = await fetchWithAuth(`${API_BASE}/log-set`, {
                method: 'POST',
                body: JSON.stringify(row),
            });
            if (!res.ok) return null;
            return (await res.json()) as LogSetResult;
        } catch {
            // Fail silently for logging
            return null;
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

    checkTermsAcceptance: async (privacyVersion?: string) => {
        const query = privacyVersion ? `?privacy_version=${encodeURIComponent(privacyVersion)}` : '';
        const res = await fetchWithAuth(`${API_BASE}/terms-acceptance${query}`, { method: 'GET' });

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

    deleteAccount: async (options: { appleAuthorizationCode?: string } = {}) => {
        const res = await fetchWithAuth(`${API_BASE}/delete-account`, {
            method: 'POST',
            body: JSON.stringify({
                confirm: 'DELETE',
                ...(options.appleAuthorizationCode ? { apple_authorization_code: options.appleAuthorizationCode } : {}),
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            let code: DeleteAccountErrorCode | null = null;
            let message = '';
            try {
                const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
                const serverCode = body.error?.code;
                if (typeof serverCode === 'string' && (DELETE_ACCOUNT_ERROR_CODES as string[]).includes(serverCode)) {
                    code = serverCode as DeleteAccountErrorCode;
                }
                if (typeof body.error?.message === 'string') message = body.error.message;
            } catch {
                // Non-JSON body (gateway error page) — fall through to a generic message.
            }
            throw new DeleteAccountError(message || `HTTP ${res.status}`, code, res.status);
        }

        return (await res.json()) as { ok: true };
    },
};
