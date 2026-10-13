// Edge Function: next-set
// Adaptive recommendations are disabled until D07 policy is approved.
// Keep the existing authentication and request validation barriers.
// A2: behind COACHING_POLICY.adaptiveNextSet a POST `evidence` body adds the deterministic
// `decision` (inert while NEXT_SET_POLICY is null). No AI provider or quota is involved.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";
import { liftNameVariants, resolveTrackedLift } from "../_shared/liftMatching.ts";
import { nextSetResponse, shapeBaseline } from "./baseline.ts";
import { COACHING_POLICY } from "../_shared/coachingPolicy.ts";
import { decideNextSet, NEXT_SET_POLICY } from "../_shared/nextSetDecision.ts";
import { canonicalAnswers, readNextSetEvidence } from "./evidence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  // The RPC uses auth.uid(); we need an authenticated client (not service-role)
  // for the RPC's auth.uid() check to pass.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await verifyAuth(req);
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  // Get exercise from POST body or GET query
  let exercise = "";
  let sessionId: unknown = null;
  let evidenceBody: unknown = undefined;
  try {
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      exercise = params.get("exercise") ?? "";
      sessionId = params.get("session");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      exercise = String(body?.exercise ?? "");
      sessionId = body?.sessionId;
      // Flag off: never read, so the response is unchanged.
      if (COACHING_POLICY.adaptiveNextSet) evidenceBody = body?.evidence;
    } else {
      return jsonRes({ error: "Method not allowed" }, 405);
    }
  } catch {
    return jsonRes({ error: "Invalid request" }, 400);
  }

  exercise = exercise.trim();
  if (!exercise) return jsonRes({ error: "exercise required" }, 400);

  const excludeSession = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
  const evidence = evidenceBody === undefined ? undefined : readNextSetEvidence(evidenceBody, excludeSession);
  if (evidence === null) return jsonRes({ error: "Invalid next-set evidence" }, 400);

  // D07 is unresolved. Logging integrity does not authorize adaptive thresholds:
  // never call legacy suggest_next_set; return only the prior completed-session baseline.
  // User-scoped client (caller JWT) so RLS applies; never service role.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data: tracked, error: trackedError } = await userClient.from("pr_tracked_lifts")
      .select("lift_name").eq("is_active", true);
    if (trackedError) throw new Error("Lift resolution unavailable");
    const trackedNames = (tracked ?? []).map((t: { lift_name: string }) => t.lift_name);
    const canonical = resolveTrackedLift(exercise, trackedNames) ?? exercise;
    // A2: evidence must be for the same lift as `exercise` (aliases resolve to one tracked lift);
    // it is then compared under the canonical key, with alias-keyed answers re-keyed to it.
    const liftKey = (name: string) => (resolveTrackedLift(name, trackedNames) ?? name).trim().toLowerCase().replace(/\s+/g, " ");
    const sameLift = (name: string) => liftKey(name) === liftKey(canonical);
    if (evidence && !sameLift(evidence.exerciseKey)) return jsonRes({ error: "Evidence is for a different exercise" }, 400);
    const { data, error } = await userClient.rpc("exercise_history_baseline", {
      p_names: liftNameVariants(canonical),
      p_exclude_session: excludeSession,
    });
    if (error) throw new Error("Baseline unavailable");
    const baseline = shapeBaseline(data, canonical);
    return jsonRes(evidence
      ? { ...nextSetResponse(baseline), decision: decideNextSet({ ...evidence, exerciseKey: canonical,
        answers: canonicalAnswers(evidence.answers, sameLift, canonical), baseline }, NEXT_SET_POLICY) }
      : nextSetResponse(baseline));
  } catch {
    return jsonRes({ error: "History unavailable" }, 500);
  }
});
