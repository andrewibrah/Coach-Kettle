// Edge Function: notifications
//   GET ?action=prefs                          → fetch preferences (defaults if none)
//   POST {action:'register_token', expo_push_token, platform, device_id?, app_version?}
//   POST {action:'revoke_token', expo_push_token}
//   POST {action:'update_prefs', ...fields}    → upsert per-user prefs
//   POST {action:'send_test'}                  → send a test push to all active tokens
//   POST {action:'send', kind, title, body, payload?}  → send a categorized push
//                                                       (intended for internal callers)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function jsonRes(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verify(req: Request): Promise<string> {
  const h = req.headers.get("Authorization");
  if (!h) throw new Error("Unauthorized");
  const token = h.replace("Bearer ", "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

async function getPrefs(userId: string) {
  const { data } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data;
  // Defaults — match DB defaults
  return {
    user_id: userId,
    permission_granted: false,
    rest_timer_enabled: true,
    workout_reminder_enabled: true,
    workout_reminder_hour: 8,
    workout_reminder_minute: 0,
    nutrition_midday_enabled: true,
    nutrition_midday_hour: 14,
    daily_feedback_enabled: true,
    daily_feedback_hour: 21,
    pr_celebration_enabled: true,
    streak_milestones_enabled: true,
    harshness_escalation_enabled: true,
    meal_plan_enabled: true,
    weekly_recalibration_enabled: true,
    body_weight_reminder_enabled: true,
    resting_hr_alert_enabled: true,
    inactivity_reengagement_enabled: true,
    quiet_hours_start_hour: null,
    quiet_hours_end_hour: null,
    timezone: "America/Los_Angeles",
  };
}

async function activeTokensFor(userId: string): Promise<string[]> {
  const { data } = await admin
    .from("notification_subscriptions")
    .select("expo_push_token")
    .eq("user_id", userId)
    .is("revoked_at", null);
  return (data ?? []).map((r) => r.expo_push_token).filter((t) => typeof t === "string" && t.length > 0);
}

async function expoPush(messages: { to: string; title: string; body: string; data?: Record<string, unknown> }[]) {
  if (messages.length === 0) return { ok: true, results: [] };
  const resp = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, results: body };
}

async function logNotif(userId: string, kind: string, delivery: string, title: string | null, body: string | null, payload: unknown) {
  try {
    await admin.from("notification_log").insert({
      user_id: userId, kind, delivery, title, body, payload,
    });
  } catch (e) { console.warn("[notifications] log insert failed", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userId: string;
  try { userId = await verify(req); }
  catch { return jsonRes({ error: "Unauthorized" }, 401); }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") ?? "prefs";
      if (action === "prefs") {
        const prefs = await getPrefs(userId);
        return jsonRes({ prefs });
      }
      if (action === "tokens") {
        const tokens = await activeTokensFor(userId);
        return jsonRes({ tokens });
      }
      return jsonRes({ error: "unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "register_token") {
        const token = String(body.expo_push_token ?? "").trim();
        if (!token) return jsonRes({ error: "expo_push_token required" }, 400);
        const platform = ["ios", "android", "web"].includes(body.platform) ? body.platform : "ios";

        const { error } = await admin
          .from("notification_subscriptions")
          .upsert({
            user_id: userId,
            expo_push_token: token,
            platform,
            device_id: typeof body.device_id === "string" ? body.device_id.slice(0, 200) : null,
            app_version: typeof body.app_version === "string" ? body.app_version.slice(0, 40) : null,
            revoked_at: null,
          }, { onConflict: "user_id,expo_push_token" });
        if (error) throw error;

        // Mark permission granted on prefs row
        await admin
          .from("notification_preferences")
          .upsert({ user_id: userId, permission_granted: true }, { onConflict: "user_id" });

        return jsonRes({ ok: true });
      }

      if (action === "revoke_token") {
        const token = String(body.expo_push_token ?? "").trim();
        if (!token) return jsonRes({ error: "expo_push_token required" }, 400);
        const { error } = await admin
          .from("notification_subscriptions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("expo_push_token", token);
        if (error) throw error;
        return jsonRes({ ok: true });
      }

      if (action === "update_prefs") {
        const allowed = [
          "permission_granted",
          "rest_timer_enabled", "workout_reminder_enabled", "workout_reminder_hour", "workout_reminder_minute",
          "nutrition_midday_enabled", "nutrition_midday_hour", "daily_feedback_enabled", "daily_feedback_hour",
          "pr_celebration_enabled", "streak_milestones_enabled", "harshness_escalation_enabled",
          "meal_plan_enabled", "weekly_recalibration_enabled", "body_weight_reminder_enabled",
          "resting_hr_alert_enabled", "inactivity_reengagement_enabled",
          "quiet_hours_start_hour", "quiet_hours_end_hour", "timezone",
        ];
        const patch: Record<string, unknown> = { user_id: userId };
        for (const k of allowed) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const { data, error } = await admin
          .from("notification_preferences")
          .upsert(patch, { onConflict: "user_id" })
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ prefs: data });
      }

      if (action === "send_test") {
        const tokens = await activeTokensFor(userId);
        const msgs = tokens.map((t) => ({
          to: t,
          title: "Coach Kettle",
          body: "Test notification — you’re wired up. Stay locked in.",
          data: { kind: "test" },
        }));
        const result = await expoPush(msgs);
        await logNotif(userId, "test", result.ok ? "push_sent" : "push_failed", "Coach Kettle", "Test notification", { tokens });
        return jsonRes({ ok: result.ok, sent_to: tokens.length });
      }

      if (action === "send") {
        const kind = String(body.kind ?? "generic");
        const title = String(body.title ?? "Coach Kettle").slice(0, 80);
        const text = String(body.body ?? "").slice(0, 240);
        if (!text) return jsonRes({ error: "body required" }, 400);

        // Check that this kind is enabled for the user
        const prefs = await getPrefs(userId);
        const enabledKey = `${kind}_enabled` as keyof typeof prefs;
        if (enabledKey in prefs && (prefs as Record<string, unknown>)[enabledKey] === false) {
          return jsonRes({ ok: false, skipped: "disabled_by_user" });
        }

        const tokens = await activeTokensFor(userId);
        if (tokens.length === 0) return jsonRes({ ok: false, skipped: "no_tokens" });

        const msgs = tokens.map((t) => ({
          to: t,
          title,
          body: text,
          data: { kind, ...(typeof body.payload === "object" && body.payload ? body.payload : {}) },
        }));
        const result = await expoPush(msgs);
        await logNotif(userId, kind, result.ok ? "push_sent" : "push_failed", title, text, body.payload ?? null);
        return jsonRes({ ok: result.ok, sent_to: tokens.length });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[notifications] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
