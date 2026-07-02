// Edge Function: revenuecat-webhook
// Receives RevenueCat webhook events and materializes them into
// subscriptions + user_entitlements. This is the authoritative pipeline that
// keeps server-side gating (chat/coach AI limits) in sync with purchases.
//
// Auth: RevenueCat sends the configured Authorization header verbatim.
// Set the same value in REVENUECAT_WEBHOOK_AUTH (Supabase secret) and in the
// RevenueCat dashboard webhook config.
//
// Deploy with --no-verify-jwt: requests come from RevenueCat, not a user.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { activateProEntitlement, expireProEntitlement } from "../_shared/entitlements.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// Event types that mean the subscription is (or became) active
const ACTIVE_EVENT_TYPES = new Set([
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    product_id?: string;
    original_transaction_id?: string;
    transaction_id?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number;
    environment?: string;
    cancel_reason?: string;
    expiration_reason?: string;
}

/** RevenueCat app_user_id is the Supabase auth UID (set in configureRevenueCat).
 *  Anonymous IDs ($RCAnonymousID:...) can appear before login — resolve via aliases. */
function resolveUserId(event: RevenueCatEvent): string | null {
    const candidates = [
        event.app_user_id,
        event.original_app_user_id,
        ...(event.aliases ?? []),
    ];
    for (const candidate of candidates) {
        if (candidate && UUID_RE.test(candidate)) return candidate;
    }
    return null;
}

function msToIso(ms: number | undefined | null): string | null {
    return typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null;
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/** Upsert the authoritative subscription record; returns its row id. */
async function upsertSubscription(
    userId: string,
    event: RevenueCatEvent,
    status: string,
    autoRenewEnabled: boolean,
): Promise<string | null> {
    const originalTxnId = event.original_transaction_id ?? event.transaction_id ?? null;

    const record = {
        user_id: userId,
        apple_original_transaction_id: originalTxnId,
        apple_product_id: event.product_id ?? null,
        status,
        current_period_start: msToIso(event.purchased_at_ms),
        current_period_end: msToIso(event.expiration_at_ms),
        auto_renew_enabled: autoRenewEnabled,
        environment: event.environment?.toLowerCase() === "sandbox" ? "sandbox" : "production",
        updated_at: new Date().toISOString(),
    };

    if (!originalTxnId) {
        // No stable key to upsert on — update the user's most recent row instead
        // of inserting duplicates (NULL keys bypass the unique constraint).
        const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing?.id) {
            await supabaseAdmin.from("subscriptions").update(record).eq("id", existing.id);
            return existing.id;
        }
        const { data: inserted, error } = await supabaseAdmin
            .from("subscriptions")
            .insert(record)
            .select("id")
            .single();
        if (error) throw new Error(`subscriptions insert failed: ${error.message}`);
        return inserted?.id ?? null;
    }

    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(record, { onConflict: "user_id,apple_original_transaction_id" })
        .select("id")
        .single();

    if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);
    return data?.id ?? null;
}

serve(async (req) => {
    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    // Authenticate: RevenueCat echoes back the configured Authorization header
    if (!webhookAuth) {
        console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_AUTH not configured — rejecting");
        return json({ error: "Webhook not configured" }, 500);
    }
    if (req.headers.get("Authorization") !== webhookAuth) {
        console.error("[revenuecat-webhook] Invalid Authorization header");
        return json({ error: "Unauthorized" }, 401);
    }

    let event: RevenueCatEvent;
    try {
        const body = await req.json();
        event = body?.event ?? {};
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    const eventType = event.type ?? "UNKNOWN";
    const eventId = event.id ?? null;
    const userId = resolveUserId(event);

    console.log(`[revenuecat-webhook] ${eventType} event=${eventId} user=${userId ?? "unresolved"}`);

    try {
        // Idempotency: record the event first; duplicate delivery short-circuits.
        if (eventId) {
            const { error: eventError } = await supabaseAdmin
                .from("subscription_events")
                .insert({
                    user_id: userId,
                    event_type: "revenuecat_webhook",
                    event_subtype: eventType,
                    raw_payload: event,
                    idempotency_key: `rc:${eventId}`,
                });

            if (eventError) {
                if (eventError.code === "23505") {
                    console.log(`[revenuecat-webhook] Duplicate event ${eventId}, skipping`);
                    return json({ ok: true, duplicate: true });
                }
                throw new Error(`event log insert failed: ${eventError.message}`);
            }
        }

        if (!userId) {
            // Anonymous purchase with no alias to a real user yet. Acknowledge so
            // RevenueCat doesn't retry forever; a later TRANSFER/alias event or the
            // client sync_revenuecat call will provision it.
            console.warn(`[revenuecat-webhook] Could not resolve user for event ${eventId} (${eventType})`);
            return json({ ok: true, unresolved_user: true });
        }

        if (ACTIVE_EVENT_TYPES.has(eventType)) {
            const expiresAt = msToIso(event.expiration_at_ms);
            if (!expiresAt) {
                console.warn(`[revenuecat-webhook] ${eventType} without expiration_at_ms, skipping provision`);
                return json({ ok: true, skipped: "no_expiration" });
            }
            const subscriptionId = await upsertSubscription(userId, event, "active", true);
            const { error } = await activateProEntitlement(supabaseAdmin, {
                userId,
                expiresAt,
                subscriptionId,
            });
            if (error) throw error;
            return json({ ok: true, provisioned: "sub_active" });
        }

        if (eventType === "CANCELLATION") {
            if (event.cancel_reason === "CUSTOMER_SUPPORT") {
                // Refund — access is revoked immediately, not at period end.
                await upsertSubscription(userId, event, "revoked", false);
                const { error } = await expireProEntitlement(
                    supabaseAdmin,
                    userId,
                    msToIso(event.expiration_at_ms),
                );
                if (error) throw error;
                return json({ ok: true, provisioned: "refund_revoked" });
            }
            // Auto-renew turned off; access continues until the period ends.
            await upsertSubscription(userId, event, "cancelled", false);
            return json({ ok: true, provisioned: "cancelled_pending_expiry" });
        }

        if (eventType === "BILLING_ISSUE") {
            // Grace period: keep entitlement; RevenueCat sends EXPIRATION if it ends.
            await upsertSubscription(userId, event, "billing_retry", true);
            return json({ ok: true, provisioned: "billing_retry" });
        }

        if (eventType === "EXPIRATION") {
            await upsertSubscription(userId, event, "expired", false);
            const { error, skipped } = await expireProEntitlement(
                supabaseAdmin,
                userId,
                msToIso(event.expiration_at_ms),
            );
            if (error) throw error;
            return json({ ok: true, provisioned: skipped ? "expire_skipped" : "sub_expired" });
        }

        // TEST, TRANSFER, SUBSCRIBER_ALIAS, etc. — logged above, no state change.
        console.log(`[revenuecat-webhook] Unhandled event type ${eventType}, logged only`);
        return json({ ok: true, logged_only: true });
    } catch (error) {
        // The idempotency row was written before provisioning. If provisioning
        // failed, remove it so RevenueCat's retry re-processes instead of being
        // short-circuited as a duplicate (which would strand the entitlement).
        if (eventId) {
            const { error: cleanupError } = await supabaseAdmin
                .from("subscription_events")
                .delete()
                .eq("idempotency_key", `rc:${eventId}`);
            if (cleanupError) {
                console.error(`[revenuecat-webhook] Failed to roll back event ${eventId}:`, cleanupError.message);
            }
        }
        // Non-2xx makes RevenueCat retry with backoff — desired for transient DB errors.
        console.error(`[revenuecat-webhook] Error processing ${eventType}:`, error);
        return json({ error: "Internal error" }, 500);
    }
});
