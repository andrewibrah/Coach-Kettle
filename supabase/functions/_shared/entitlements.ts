// Shared entitlement provisioning + gating helpers.
// Provisioning (activate/expire) is used by revenuecat-webhook (event-driven)
// and entitlements (client-triggered sync). Gating (requireEntitlement /
// gateAiRequest) is read-only and used by every gated function (chat, coach,
// meal-plan, workout-templates). user_entitlements is the single source of
// truth, read via get_entitlement (which runs lazy expiry).

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Free-tier limits. Server-side mirror of SUBSCRIPTION.FEATURES in
// constants/subscription.ts — keep the two in sync.
export const FREE_AI_MESSAGES_PER_DAY = 5;
export const FREE_TEMPLATE_LIMIT = 5;

export type Tier = "pro" | "trial" | "free";

export interface EntitlementResult {
    tier: Tier;
    status: string | null;
}

/**
 * Derive the enforcement tier for a user. Trial = full pro access.
 * Throws on read failure — callers must fail closed (503), never allow.
 */
export async function requireEntitlement(
    supabase: SupabaseClient,
    userId: string,
): Promise<EntitlementResult> {
    const { data, error } = await supabase.rpc("get_entitlement", { p_user_id: userId });
    if (error) throw new Error(`get_entitlement failed: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    const status: string | null = row?.entitlement_status ?? null;
    const tier: Tier = status === "sub_active"
        ? "pro"
        : status === "trial_active"
        ? "trial"
        : "free";

    return { tier, status };
}

export type GateResult =
    | { allowed: true; tier: Tier }
    | { allowed: false; status: number; body: Record<string, unknown> };

/**
 * Gate one AI request. Pro and trial pass without touching the counter
 * (trial = full pro; keeps ai_usage data clean). Free users consume the
 * daily quota atomically: increment first, reject if over the limit.
 * Any entitlement/usage read failure fails closed with 503.
 */
export async function gateAiRequest(
    supabase: SupabaseClient,
    userId: string,
    logTag: string,
): Promise<GateResult> {
    let tier: Tier;
    try {
        ({ tier } = await requireEntitlement(supabase, userId));
    } catch (e) {
        console.error(`[${logTag}] Entitlement check failed (blocking):`, e);
        return {
            allowed: false,
            status: 503,
            body: { error: "Entitlement check unavailable", code: "ENTITLEMENT_UNAVAILABLE" },
        };
    }

    if (tier !== "free") return { allowed: true, tier };

    const { data, error } = await supabase.rpc("check_and_increment_ai_usage", {
        p_user_id: userId,
        p_limit: FREE_AI_MESSAGES_PER_DAY,
    });
    if (error) {
        console.error(`[${logTag}] AI usage check failed (blocking):`, error.message);
        return {
            allowed: false,
            status: 503,
            body: { error: "Usage check unavailable", code: "ENTITLEMENT_UNAVAILABLE" },
        };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.allowed) {
        return {
            allowed: false,
            status: 429,
            body: {
                error: "Daily AI message limit reached",
                code: "AI_LIMIT_REACHED",
                limit: FREE_AI_MESSAGES_PER_DAY,
                count: Math.min(
                    Number(row?.current_count ?? FREE_AI_MESSAGES_PER_DAY),
                    FREE_AI_MESSAGES_PER_DAY,
                ),
            },
        };
    }

    return { allowed: true, tier };
}

export interface ActivateOptions {
    userId: string;
    expiresAt: string; // ISO timestamp
    subscriptionId?: string | null;
}

/**
 * Flip a user's entitlement to sub_active. Idempotent upsert on user_id.
 * paywall_dismissed is forced true — paying users never see the paywall.
 *
 * Out-of-order guard: never move expires_at backward. A reordered/stale
 * RENEWAL carrying an earlier expiration must not shorten a period already
 * recorded from a newer event.
 */
export async function activateProEntitlement(
    supabase: SupabaseClient,
    { userId, expiresAt, subscriptionId }: ActivateOptions,
): Promise<{ error: Error | null }> {
    const { data: existing, error: readError } = await supabase
        .from("user_entitlements")
        .select("expires_at")
        .eq("user_id", userId)
        .maybeSingle();
    if (readError) return { error: new Error(readError.message) };

    if (
        existing?.expires_at &&
        new Date(existing.expires_at).getTime() > new Date(expiresAt).getTime()
    ) {
        // A newer period is already recorded — stale activation event. Keep the
        // later expiry; still ensure the user is marked active.
        const { error: statusErr } = await supabase
            .from("user_entitlements")
            .update({ status: "sub_active", paywall_dismissed: true, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        return { error: statusErr ? new Error(statusErr.message) : null };
    }

    const { error } = await supabase
        .from("user_entitlements")
        .upsert(
            {
                user_id: userId,
                status: "sub_active",
                source: "subscription",
                expires_at: expiresAt,
                subscription_id: subscriptionId ?? null,
                paywall_dismissed: true,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
        );

    return { error: error ? new Error(error.message) : null };
}

/**
 * Flip a user's entitlement to sub_expired — but only if no newer period exists.
 * Guard: if the stored expires_at is later than the event's expiration, a
 * renewal has already been processed (out-of-order webhook delivery) — skip.
 */
export async function expireProEntitlement(
    supabase: SupabaseClient,
    userId: string,
    eventExpiresAt: string | null,
): Promise<{ error: Error | null; skipped: boolean }> {
    const { data: row, error: readError } = await supabase
        .from("user_entitlements")
        .select("status, source, expires_at")
        .eq("user_id", userId)
        .maybeSingle();

    if (readError) return { error: new Error(readError.message), skipped: false };
    if (!row || row.source !== "subscription") return { error: null, skipped: true };

    if (
        eventExpiresAt &&
        row.expires_at &&
        new Date(row.expires_at).getTime() > new Date(eventExpiresAt).getTime()
    ) {
        // A newer subscription period is already recorded — stale event.
        return { error: null, skipped: true };
    }

    const { error } = await supabase
        .from("user_entitlements")
        .update({ status: "sub_expired", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("source", "subscription");

    return { error: error ? new Error(error.message) : null, skipped: false };
}
