// Edge Function: iap
// In-App Purchase receipt verification, restore, and App Store Server Notifications v2
// Env: APPLE_SHARED_SECRET — run: supabase secrets set APPLE_SHARED_SECRET=<your_secret>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { compactVerify, importX509 } from "https://deno.land/x/jose@v5.9.3/index.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars");
}

// Admin client for auth verification and service-level operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

function respondJson(body: unknown, status = 200) {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// ─── Apple receipt verification helper ──────────────────────────────────────

const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

interface AppleReceiptResponse {
    status: number;
    environment?: string;
    latest_receipt_info?: AppleTransaction[];
    latest_receipt?: string;
}

interface AppleTransaction {
    original_transaction_id: string;
    transaction_id: string;
    product_id: string;
    expires_date_ms: string;
    purchase_date_ms: string;
    is_trial_period: string;
    is_in_intro_offer_period?: string;
    cancellation_date_ms?: string;
}

/**
 * Posts receipt data to Apple's verifyReceipt endpoint.
 * Automatically retries against sandbox if production returns 21007.
 */
async function verifyWithApple(receiptData: string): Promise<{ response: AppleReceiptResponse; environment: string }> {
    const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");
    if (!sharedSecret) {
        throw new Error("APPLE_SHARED_SECRET not configured");
    }

    const payload = {
        "receipt-data": receiptData,
        "password": sharedSecret,
        "exclude-old-transactions": true,
    };

    // Try production first
    const prodRes = await fetch(APPLE_PRODUCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const prodBody: AppleReceiptResponse = await prodRes.json();

    // 21007 means this is a sandbox receipt — retry against sandbox
    if (prodBody.status === 21007) {
        console.log("[iap] Sandbox receipt detected, retrying with sandbox endpoint");
        const sandboxRes = await fetch(APPLE_SANDBOX_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const sandboxBody: AppleReceiptResponse = await sandboxRes.json();
        return { response: sandboxBody, environment: "sandbox" };
    }

    return {
        response: prodBody,
        environment: prodBody.environment?.toLowerCase() === "sandbox" ? "sandbox" : "production",
    };
}

/**
 * Base64url decode helper for JWS payload decoding.
 */
function base64UrlDecode(str: string): string {
    return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

// ─── Apple JWS signature verification ───────────────────────────────────────

// Apple Root CA G3 SHA-256 fingerprint (lowercase hex, no colons)
const APPLE_ROOT_CA_G3_FINGERPRINT = "63343afbd6b5b53dc2074abd75c19d573718894ab0ece2e715ebb15423279883";

/**
 * Verifies an Apple ASSN v2 JWS payload.
 * 1. Extracts x5c certificate chain from the JWS header.
 * 2. Verifies the root certificate is Apple Root CA G3 (by SHA-256 fingerprint).
 * 3. Verifies the JWS signature using the leaf certificate's public key.
 * Returns the decoded payload on success; throws on any verification failure.
 */
async function verifyAppleJWS(jws: string): Promise<Record<string, unknown>> {
    const parts = jws.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWS format: expected 3 parts");
    }

    // Parse the protected header
    let header: { x5c?: string[]; alg?: string };
    try {
        header = JSON.parse(base64UrlDecode(parts[0]));
    } catch {
        throw new Error("Failed to parse JWS header");
    }

    const { x5c, alg = "ES256" } = header;
    if (!Array.isArray(x5c) || x5c.length < 2) {
        throw new Error("Missing or incomplete x5c certificate chain in JWS header");
    }

    // 1. Verify root certificate fingerprint against Apple Root CA G3
    const rootDerBytes = Uint8Array.from(atob(x5c[x5c.length - 1]), (c) => c.charCodeAt(0));
    const rootDigest = await crypto.subtle.digest("SHA-256", rootDerBytes);
    const rootHex = [...new Uint8Array(rootDigest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    if (rootHex !== APPLE_ROOT_CA_G3_FINGERPRINT) {
        throw new Error(`JWS root cert fingerprint mismatch — got ${rootHex}`);
    }

    // 2. Import leaf certificate and verify JWS signature
    const leafPem = [
        "-----BEGIN CERTIFICATE-----",
        x5c[0],
        "-----END CERTIFICATE-----",
    ].join("\n");

    let publicKey: CryptoKey;
    try {
        publicKey = await importX509(leafPem, alg);
    } catch (e) {
        throw new Error(`Failed to import leaf certificate: ${e}`);
    }

    try {
        const { payload } = await compactVerify(jws, publicKey);
        return JSON.parse(new TextDecoder().decode(payload));
    } catch (e) {
        throw new Error(`JWS signature verification failed: ${e}`);
    }
}

// ─── verify_receipt ─────────────────────────────────────────────────────────
// Verifies an App Store receipt and provisions the user's entitlement.

async function handleVerifyReceipt(
    userId: string,
    body: { receipt_data: string; product_id: string },
): Promise<Response> {
    const { receipt_data, product_id } = body;

    if (!receipt_data || !product_id) {
        return respondJson({ error: "receipt_data and product_id are required" }, 400);
    }

    console.log(`[iap] verify_receipt called by user ${userId} for product ${product_id}`);

    // 1. Verify with Apple
    let appleResult: { response: AppleReceiptResponse; environment: string };
    try {
        appleResult = await verifyWithApple(receipt_data);
    } catch (err) {
        console.error("[iap] Apple verification request failed:", err);
        return respondJson({ error: "Failed to verify receipt with Apple" }, 502);
    }

    const { response: appleResponse, environment } = appleResult;

    if (appleResponse.status !== 0) {
        console.error(`[iap] Apple returned non-zero status: ${appleResponse.status}`);
        return respondJson(
            { error: "Receipt verification failed", apple_status: appleResponse.status },
            400,
        );
    }

    // 2. Extract transaction data
    const transactions = appleResponse.latest_receipt_info;
    if (!transactions || transactions.length === 0) {
        console.error("[iap] No transactions in Apple response");
        return respondJson({ error: "No transaction data in receipt" }, 400);
    }

    // Find the transaction matching the requested product_id
    const txn = transactions.find((t) => t.product_id === product_id);
    if (!txn) {
        console.error(`[iap] No transaction found for product_id: ${product_id}`);
        return respondJson({ error: `No transaction found for product ${product_id}` }, 400);
    }

    const originalTransactionId = txn.original_transaction_id;
    const expiresDateMs = parseInt(txn.expires_date_ms, 10);
    const periodEnd = new Date(expiresDateMs);
    const periodStart = new Date(parseInt(txn.purchase_date_ms, 10));

    console.log(`[iap] Verified: txn=${originalTransactionId}, product=${product_id}, expires=${periodEnd.toISOString()}, env=${environment}`);

    // 3. Upsert into subscriptions table
    const { data: subData, error: subError } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
            {
                user_id: userId,
                apple_original_transaction_id: originalTransactionId,
                apple_product_id: product_id,
                status: "active",
                current_period_start: periodStart.toISOString(),
                current_period_end: periodEnd.toISOString(),
                environment,
            },
            { onConflict: "user_id,apple_original_transaction_id" },
        )
        .select("id")
        .single();

    if (subError) {
        console.error("[iap] Failed to upsert subscription:", subError);
        return respondJson({ error: "Failed to save subscription" }, 500);
    }

    const subscriptionId = subData.id;

    // 4. Update user_entitlements
    const { error: entError } = await supabaseAdmin
        .from("user_entitlements")
        .update({
            status: "sub_active",
            source: "subscription",
            expires_at: periodEnd.toISOString(),
            subscription_id: subscriptionId,
            paywall_dismissed: true,
        })
        .eq("user_id", userId);

    if (entError) {
        console.error("[iap] Failed to update user_entitlements:", entError);
        // Non-fatal — subscription was saved, entitlement update can be retried
    }

    // 5. Log to subscription_events (idempotent)
    const { error: eventError } = await supabaseAdmin
        .from("subscription_events")
        .upsert(
            {
                user_id: userId,
                subscription_id: subscriptionId,
                event_type: "purchase_verified",
                raw_payload: appleResponse,
                idempotency_key: `${originalTransactionId}_verified`,
            },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
        );

    if (eventError) {
        console.error("[iap] Failed to log subscription event:", eventError);
        // Non-fatal — the subscription is still valid
    }

    // 6. Return success
    return respondJson({
        ok: true,
        data: {
            status: "sub_active",
            expires_at: periodEnd.toISOString(),
        },
    });
}

// ─── restore ────────────────────────────────────────────────────────────────
// Restores purchases by verifying receipt and finding all active subscriptions.

async function handleRestore(
    userId: string,
    body: { receipt_data: string },
): Promise<Response> {
    const { receipt_data } = body;

    if (!receipt_data) {
        return respondJson({ error: "receipt_data is required" }, 400);
    }

    console.log(`[iap] restore called by user ${userId}`);

    // 1. Verify with Apple
    let appleResult: { response: AppleReceiptResponse; environment: string };
    try {
        appleResult = await verifyWithApple(receipt_data);
    } catch (err) {
        console.error("[iap] Apple verification request failed during restore:", err);
        return respondJson({ error: "Failed to verify receipt with Apple" }, 502);
    }

    const { response: appleResponse, environment } = appleResult;

    if (appleResponse.status !== 0) {
        console.error(`[iap] Apple returned non-zero status during restore: ${appleResponse.status}`);
        return respondJson(
            { error: "Receipt verification failed", apple_status: appleResponse.status },
            400,
        );
    }

    const transactions = appleResponse.latest_receipt_info;
    if (!transactions || transactions.length === 0) {
        console.log("[iap] No transactions in receipt during restore");
        return respondJson({ ok: true, data: { status: "no_active_subscription" } });
    }

    // 2. Find all active subscriptions (expires_date_ms > now)
    const now = Date.now();
    const activeTransactions = transactions.filter(
        (t) => parseInt(t.expires_date_ms, 10) > now && !t.cancellation_date_ms,
    );

    if (activeTransactions.length === 0) {
        console.log("[iap] No active subscriptions found during restore");
        return respondJson({ ok: true, data: { status: "no_active_subscription" } });
    }

    // 3. Process each active subscription — pick the one with the latest expiry for entitlement
    let latestExpiry = new Date(0);
    let latestSubscriptionId: string | null = null;

    for (const txn of activeTransactions) {
        const originalTransactionId = txn.original_transaction_id;
        const expiresDateMs = parseInt(txn.expires_date_ms, 10);
        const periodEnd = new Date(expiresDateMs);
        const periodStart = new Date(parseInt(txn.purchase_date_ms, 10));

        console.log(`[iap] Restoring txn=${originalTransactionId}, product=${txn.product_id}, expires=${periodEnd.toISOString()}`);

        // Upsert subscription
        const { data: subData, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .upsert(
                {
                    user_id: userId,
                    apple_original_transaction_id: originalTransactionId,
                    apple_product_id: txn.product_id,
                    status: "active",
                    current_period_start: periodStart.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    environment,
                },
                { onConflict: "user_id,apple_original_transaction_id" },
            )
            .select("id")
            .single();

        if (subError) {
            console.error(`[iap] Failed to upsert subscription for txn ${originalTransactionId}:`, subError);
            continue;
        }

        // Log event (idempotent)
        await supabaseAdmin
            .from("subscription_events")
            .upsert(
                {
                    user_id: userId,
                    subscription_id: subData.id,
                    event_type: "purchase_restored",
                    raw_payload: txn,
                    idempotency_key: `${originalTransactionId}_restored`,
                },
                { onConflict: "idempotency_key", ignoreDuplicates: true },
            );

        // Track the subscription with the latest expiry
        if (periodEnd > latestExpiry) {
            latestExpiry = periodEnd;
            latestSubscriptionId = subData.id;
        }
    }

    // 4. Update user_entitlements with the best (latest-expiring) subscription
    if (latestSubscriptionId) {
        const { error: entError } = await supabaseAdmin
            .from("user_entitlements")
            .update({
                status: "sub_active",
                source: "subscription",
                expires_at: latestExpiry.toISOString(),
                subscription_id: latestSubscriptionId,
                paywall_dismissed: true,
            })
            .eq("user_id", userId);

        if (entError) {
            console.error("[iap] Failed to update user_entitlements during restore:", entError);
        }

        return respondJson({
            ok: true,
            data: {
                status: "sub_active",
                expires_at: latestExpiry.toISOString(),
            },
        });
    }

    // Should not reach here given activeTransactions.length > 0 check above,
    // but handle gracefully
    return respondJson({ ok: true, data: { status: "no_active_subscription" } });
}

// ─── notifications (App Store Server Notifications v2) ──────────────────────
// Webhook endpoint for Apple server-to-server notifications.
// Apple sends these directly — no user auth required.
// Always returns 200 to Apple (Apple retries on non-2xx).

async function handleNotification(
    body: { signedPayload: string },
): Promise<Response> {
    const { signedPayload } = body;

    if (!signedPayload) {
        // Still return 200 to prevent Apple retries on malformed requests
        console.error("[iap] Notification missing signedPayload");
        return respondJson({ ok: true });
    }

    try {
        // 1. Verify JWS signature and decode outer payload
        let decodedPayload: Record<string, unknown>;
        try {
            decodedPayload = await verifyAppleJWS(signedPayload);
        } catch (verifyErr) {
            console.error("[iap] JWS verification failed:", verifyErr);
            // Return 200 so Apple doesn't retry; log the rejection
            await supabaseAdmin.from("subscription_events").insert({
                event_type: "apple_server_notification_verification_failed",
                raw_payload: { error: String(verifyErr) },
                idempotency_key: `verification_failed_${Date.now()}`,
            }).catch(() => { /* best-effort log */ });
            return respondJson({ ok: true });
        }

        // 2. Extract notification data
        const notificationType: string = decodedPayload.notificationType as string;
        const subtype: string | undefined = decodedPayload.subtype as string | undefined;
        const notificationUUID: string | undefined = decodedPayload.notificationUUID as string | undefined;

        console.log(`[iap] Notification received: type=${notificationType}, subtype=${subtype ?? "none"}, uuid=${notificationUUID ?? "unknown"}`);

        // Decode and verify the inner signedTransactionInfo JWS
        const signedTransactionInfo: string | undefined = (decodedPayload.data as Record<string, unknown>)?.signedTransactionInfo as string | undefined;
        if (!signedTransactionInfo) {
            console.error("[iap] No signedTransactionInfo in notification payload");
            await logRawNotification(decodedPayload, notificationUUID);
            return respondJson({ ok: true });
        }

        let txnInfo: Record<string, unknown>;
        try {
            txnInfo = await verifyAppleJWS(signedTransactionInfo);
        } catch (txnVerifyErr) {
            console.error("[iap] Inner signedTransactionInfo verification failed:", txnVerifyErr);
            await logRawNotification(decodedPayload, notificationUUID);
            return respondJson({ ok: true });
        }

        const originalTransactionId: string = txnInfo.originalTransactionId as string;
        const productId: string = txnInfo.productId as string;
        const expiresDate: number | undefined = txnInfo.expiresDate as number | undefined; // milliseconds
        const txnEnvironment: string = (txnInfo.environment as string)?.toLowerCase() === "sandbox" ? "sandbox" : "production";

        console.log(`[iap] Transaction info: originalTxnId=${originalTransactionId}, product=${productId}, env=${txnEnvironment}`);

        // 3. Find the user via subscriptions table
        const { data: subRecord, error: lookupError } = await supabaseAdmin
            .from("subscriptions")
            .select("id, user_id")
            .eq("apple_original_transaction_id", originalTransactionId)
            .single();

        if (lookupError || !subRecord) {
            console.error(`[iap] No subscription found for original_transaction_id=${originalTransactionId}:`, lookupError?.message ?? "not found");
            await logRawNotification(decodedPayload, notificationUUID);
            return respondJson({ ok: true });
        }

        const subscriptionId: string = subRecord.id;
        const userId: string = subRecord.user_id;

        // 4. Handle each notification type
        switch (notificationType) {
            case "DID_RENEW": {
                // Subscription renewed — update period end, ensure active status
                const newPeriodEnd = expiresDate ? new Date(expiresDate).toISOString() : null;

                const subUpdate: Record<string, unknown> = {
                    status: "active",
                    apple_product_id: productId,
                };
                if (newPeriodEnd) {
                    subUpdate.current_period_end = newPeriodEnd;
                }

                await supabaseAdmin
                    .from("subscriptions")
                    .update(subUpdate)
                    .eq("id", subscriptionId);

                const entUpdate: Record<string, unknown> = {
                    status: "sub_active",
                    source: "subscription",
                };
                if (newPeriodEnd) {
                    entUpdate.expires_at = newPeriodEnd;
                }

                await supabaseAdmin
                    .from("user_entitlements")
                    .update(entUpdate)
                    .eq("user_id", userId);

                console.log(`[iap] DID_RENEW processed for user ${userId}, new period end: ${newPeriodEnd}`);
                break;
            }

            case "EXPIRED": {
                // Subscription expired
                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "expired" })
                    .eq("id", subscriptionId);

                await supabaseAdmin
                    .from("user_entitlements")
                    .update({ status: "sub_expired" })
                    .eq("user_id", userId);

                console.log(`[iap] EXPIRED processed for user ${userId}`);
                break;
            }

            case "DID_FAIL_TO_RENEW": {
                // Billing retry period — subscription may still recover
                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "billing_retry" })
                    .eq("id", subscriptionId);

                console.log(`[iap] DID_FAIL_TO_RENEW processed for user ${userId}`);
                break;
            }

            case "REFUND": {
                // Refund issued — revoke access
                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "revoked" })
                    .eq("id", subscriptionId);

                await supabaseAdmin
                    .from("user_entitlements")
                    .update({ status: "sub_expired" })
                    .eq("user_id", userId);

                console.log(`[iap] REFUND processed for user ${userId}`);
                break;
            }

            case "DID_CHANGE_RENEWAL_STATUS": {
                // Auto-renew toggled on/off
                const autoRenew = subtype === "AUTO_RENEW_ENABLED";

                await supabaseAdmin
                    .from("subscriptions")
                    .update({ auto_renew_enabled: autoRenew })
                    .eq("id", subscriptionId);

                console.log(`[iap] DID_CHANGE_RENEWAL_STATUS processed for user ${userId}, auto_renew=${autoRenew}`);
                break;
            }

            case "SUBSCRIBED": {
                // New subscription purchase or resubscription after lapse.
                // verify_receipt already handles the initial purchase flow; this is a
                // belt-and-suspenders update in case the client receipt call is missed.
                const newPeriodEnd = expiresDate ? new Date(expiresDate).toISOString() : null;

                await supabaseAdmin
                    .from("subscriptions")
                    .update({
                        status: "active",
                        apple_product_id: productId,
                        ...(newPeriodEnd ? { current_period_end: newPeriodEnd } : {}),
                    })
                    .eq("id", subscriptionId);

                await supabaseAdmin
                    .from("user_entitlements")
                    .update({
                        status: "sub_active",
                        source: "subscription",
                        expires_at: newPeriodEnd,
                        paywall_dismissed: true,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", userId);

                console.log(`[iap] SUBSCRIBED: user ${userId} now sub_active`);
                break;
            }

            case "GRACE_PERIOD_EXPIRED": {
                // Billing retry period ended without successful renewal — expire the user.
                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "expired" })
                    .eq("id", subscriptionId);

                await supabaseAdmin
                    .from("user_entitlements")
                    .update({
                        status: "sub_expired",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", userId);

                console.log(`[iap] GRACE_PERIOD_EXPIRED: user ${userId} now sub_expired`);
                break;
            }

            default: {
                console.log(`[iap] Unhandled notification type: ${notificationType}, logging only`);
                break;
            }
        }

        // 5. Write to subscription_events with idempotency
        if (notificationUUID) {
            const { error: eventError } = await supabaseAdmin
                .from("subscription_events")
                .upsert(
                    {
                        user_id: userId,
                        subscription_id: subscriptionId,
                        event_type: notificationType,
                        event_subtype: subtype ?? null,
                        raw_payload: decodedPayload,
                        idempotency_key: notificationUUID,
                    },
                    { onConflict: "idempotency_key", ignoreDuplicates: true },
                );

            if (eventError) {
                console.error("[iap] Failed to log subscription event:", eventError);
            }
        } else {
            // No UUID — insert without idempotency key (best effort)
            await supabaseAdmin
                .from("subscription_events")
                .insert({
                    user_id: userId,
                    subscription_id: subscriptionId,
                    event_type: notificationType,
                    event_subtype: subtype ?? null,
                    raw_payload: decodedPayload,
                });
        }

    } catch (err) {
        console.error("[iap] Error processing notification:", err);
        // Still return 200 — Apple retries on non-2xx
    }

    // 6. Always return 200 to Apple
    return respondJson({ ok: true });
}

/**
 * Logs a raw notification payload when we can't fully process it.
 * Used as a fallback when transaction lookup fails or payload is incomplete.
 */
async function logRawNotification(
    payload: unknown,
    notificationUUID: string | undefined,
): Promise<void> {
    try {
        if (notificationUUID) {
            await supabaseAdmin
                .from("subscription_events")
                .upsert(
                    {
                        event_type: "apple_server_notification_unprocessed",
                        raw_payload: payload,
                        idempotency_key: `unprocessed_${notificationUUID}`,
                    },
                    { onConflict: "idempotency_key", ignoreDuplicates: true },
                );
        } else {
            await supabaseAdmin
                .from("subscription_events")
                .insert({
                    event_type: "apple_server_notification_unprocessed",
                    raw_payload: payload,
                });
        }
    } catch (err) {
        console.error("[iap] Failed to log raw notification:", err);
    }
}

// ─── Request Router ─────────────────────────────────────────────────────────

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return respondJson({ error: "Method not allowed" }, 405);
    }

    try {
        let body: Record<string, unknown>;
        try {
            body = await req.json();
        } catch {
            return respondJson({ error: "Invalid JSON" }, 400);
        }

        const action = body.action as string | undefined;

        if (!action) {
            return respondJson({ error: "action is required" }, 400);
        }

        // ── verify_receipt: requires user JWT ──────────────────────────
        if (action === "verify_receipt") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return respondJson({ code: 401, message: "Missing Authorization header" }, 401);
            }

            const token = authHeader.replace("Bearer ", "");
            const { data, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !data.user) {
                console.error("[iap] Auth verification failed:", error?.message ?? "no user");
                return respondJson({ code: 401, message: "Invalid JWT" }, 401);
            }

            console.log("[iap] User verified:", data.user.id);

            return await handleVerifyReceipt(data.user.id, body as {
                receipt_data: string;
                product_id: string;
            });
        }

        // ── restore: requires user JWT ─────────────────────────────────
        if (action === "restore") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return respondJson({ code: 401, message: "Missing Authorization header" }, 401);
            }

            const token = authHeader.replace("Bearer ", "");
            const { data, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !data.user) {
                console.error("[iap] Auth verification failed:", error?.message ?? "no user");
                return respondJson({ code: 401, message: "Invalid JWT" }, 401);
            }

            console.log("[iap] User verified for restore:", data.user.id);

            return await handleRestore(data.user.id, body as {
                receipt_data: string;
            });
        }

        // ── notifications: NO auth (Apple sends directly) ─────────────
        if (action === "notifications") {
            return await handleNotification(body as { signedPayload: string });
        }

        return respondJson({ error: `Unknown action: ${action}` }, 400);
    } catch (error) {
        console.error("[iap] Error:", error);
        return respondJson({ error: "Internal server error" }, 500);
    }
});
