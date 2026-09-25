// delete-account request handler. Pure logic with injected dependencies so it runs under
// Deno (index.ts) and under node:test (handler.test.ts). No URL imports and no Deno.* here.
//
// Order (stops at the first failure before the auth delete; every step is idempotent, so a
// retry after any failure is safe):
//   0. verify bearer (anon client + getUser) → 401; confirm === "DELETE" → 400
//   1. recent sign-in from the verified token's amr claim → 403 REAUTH_REQUIRED
//   2. RevenueCat subscriber DELETE (200/404 ok) → 502 / 500 CONFIG_MISSING
//   3. Sign in with Apple token revocation (best effort: log one line and continue)
//   4. workout-media/{uid}/ storage sweep (caller's JWT, own-folder policies) → 500
//   5. public.delete_user_data(uid) in one transaction (service role) → 500
//   7. auth.admin.deleteUser(uid) (service role) → 500
//
// Logs carry only a step name and a status/code, never the uid, email, tokens or bodies.

type ApiError = { message?: string; code?: string; status?: number } | null;

type StorageEntry = { name?: unknown; id?: unknown };

export type StorageBucket = {
  list(
    prefix: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ): Promise<{ data: StorageEntry[] | null; error: ApiError }>;
  remove(paths: string[]): Promise<{ data: unknown; error: ApiError }>;
};

export type AuthUser = {
  id: string;
  app_metadata?: { provider?: unknown; providers?: unknown };
  identities?: { provider?: unknown }[] | null;
};

export type UserClient = {
  auth: { getUser(token: string): Promise<{ data: { user: AuthUser | null }; error: ApiError }> };
  storage: { from(bucket: string): StorageBucket };
};

export type AdminClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ApiError }>;
  auth: { admin: { deleteUser(id: string): Promise<{ data: unknown; error: ApiError }> } };
};

export type DeleteAccountDeps = {
  createUserClient(token: string): UserClient;
  admin: AdminClient;
  fetch(url: string, init: RequestInit): Promise<Response>;
  env(name: string): string | undefined;
  now(): number;
  log(line: string): void;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MEDIA_BUCKET = "workout-media";
const MAX_SIGN_IN_AGE_S = 5 * 60;
const MAX_CLOCK_SKEW_S = 60;
const LIST_PAGE = 100;
const REMOVE_BATCH = 100;
// Hard cap on the sweep: 200 list calls covers 20,000 objects at 100 per page. Hitting it
// fails the request before any DB or auth deletion instead of looping without bound.
const MAX_LIST_CALLS = 200;
// Apple rejects client secrets that expire more than 15777000 s (six months) out.
const APPLE_SECRET_TTL_S = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  METHOD_NOT_ALLOWED: "Method not allowed",
  UNAUTHORIZED: "Unauthorized",
  CONFIRMATION_REQUIRED: "Confirmation required",
  REAUTH_REQUIRED: "Please sign in again to delete your account",
  CONFIG_MISSING: "Account deletion is unavailable",
  REVENUECAT_DELETE_FAILED: "Account deletion failed; please try again",
  STORAGE_DELETE_FAILED: "Account deletion failed; please try again",
  DB_PURGE_FAILED: "Account deletion failed; please try again",
  AUTH_DELETE_FAILED: "Account deletion failed; please try again",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: string, status: number): Response {
  return json({ error: { code, message: MESSAGES[code] } }, status);
}

// Error codes from GoTrue/PostgREST are short identifiers; anything else is dropped so a
// message-shaped value can never carry PII into the log.
function safeCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : "unknown";
}

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Newest real sign-in in this session, from the access token's `amr` claim.
 * GoTrue writes an amr entry (method + timestamp) only when the session authenticates
 * (password, oauth/id_token, otp, mfa, ...); the refresh-token grant re-issues the access
 * token without touching those entries, so a refresh never makes a session look recent.
 * `token_refresh` is a documented method value, so it is excluded defensively.
 */
export function lastSignInSeconds(payload: Record<string, unknown>): number | null {
  const amr = payload.amr;
  if (!Array.isArray(amr)) return null;
  let newest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || method === "token_refresh") continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (newest === null || timestamp > newest) newest = timestamp;
  }
  return newest;
}

function hasAppleIdentity(user: AuthUser): boolean {
  if (user.identities?.some((identity) => identity?.provider === "apple")) return true;
  const meta = user.app_metadata ?? {};
  return meta.provider === "apple" || (Array.isArray(meta.providers) && meta.providers.includes("apple"));
}

async function appleClientSecret(
  teamId: string,
  keyId: string,
  clientId: string,
  privateKeyPem: string,
  nowS: number,
): Promise<string> {
  // The .p8 key is PKCS#8 PEM. Dashboards sometimes store it with literal "\n".
  const body = privateKeyPem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const claims = base64UrlEncode(enc.encode(JSON.stringify({
    iss: teamId,
    iat: nowS,
    exp: nowS + APPLE_SECRET_TTL_S,
    aud: "https://appleid.apple.com",
    sub: clientId,
  })));
  // Web Crypto ECDSA returns the raw r||s signature, which is the JWS ES256 encoding.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Best effort. Returns null on success or a log reason; never throws. */
async function revokeApple(deps: DeleteAccountDeps, code: string | null, nowS: number): Promise<string | null> {
  const teamId = deps.env("APPLE_TEAM_ID");
  const keyId = deps.env("APPLE_KEY_ID");
  const privateKey = deps.env("APPLE_PRIVATE_KEY");
  const clientId = deps.env("APPLE_CLIENT_ID");
  if (!teamId || !keyId || !privateKey || !clientId) return "missing_secret";
  if (!code) return "missing_code";

  let clientSecret: string;
  try {
    clientSecret = await appleClientSecret(teamId, keyId, clientId, privateKey, nowS);
  } catch {
    return "invalid_secret";
  }

  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  try {
    // Native iOS authorization codes were issued without a redirect_uri, so none is sent.
    const tokenRes = await deps.fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: form,
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) return `http_${tokenRes.status}`;
    const tokens = await tokenRes.json().catch(() => null) as { refresh_token?: unknown; access_token?: unknown } | null;
    // Apple documents a refresh_token for code exchange; revoking the access token also ends
    // the user session, so it is the fallback if a refresh token is ever absent.
    const [token, hint] = typeof tokens?.refresh_token === "string"
      ? [tokens.refresh_token, "refresh_token"]
      : typeof tokens?.access_token === "string"
      ? [tokens.access_token, "access_token"]
      : [null, null];
    if (!token || !hint) return "no_token";

    const revokeRes = await deps.fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: form,
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: hint,
      }).toString(),
    });
    return revokeRes.ok ? null : `http_${revokeRes.status}`;
  } catch {
    return "network";
  }
}

function isSafeSegment(name: unknown): name is string {
  return typeof name === "string" && name !== "" && name !== "." && name !== ".." && !name.includes("/");
}

/**
 * Every object path under `{uid}/`. Storage `list` is one folder level at a time and returns
 * folders with `id: null`, so this walks folders breadth-first and pages each one by offset.
 * Listing completes before anything is removed, so offsets never shift under the walk.
 */
async function collectObjectPaths(bucket: StorageBucket, uid: string): Promise<string[]> {
  const root = `${uid}/`;
  const paths: string[] = [];
  const folders = [uid];
  let listCalls = 0;
  while (folders.length > 0) {
    const prefix = folders.shift()!;
    for (let offset = 0;; offset += LIST_PAGE) {
      if (++listCalls > MAX_LIST_CALLS) throw new Error("list_cap");
      const { data, error } = await bucket.list(prefix, {
        limit: LIST_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("list");
      const entries = data ?? [];
      for (const entry of entries) {
        if (!isSafeSegment(entry.name)) throw new Error("unsafe_name");
        const path = `${prefix}/${entry.name}`;
        if (!path.startsWith(root)) throw new Error("outside_prefix");
        if (entry.id === null || entry.id === undefined) folders.push(path);
        else paths.push(path);
      }
      if (entries.length < LIST_PAGE) break;
    }
  }
  return paths;
}

export function createHandler(deps: DeleteAccountDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
    if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

    const token = /^Bearer\s+(\S+)$/i.exec((req.headers.get("Authorization") ?? "").trim())?.[1] ?? "";
    if (!token) return fail("UNAUTHORIZED", 401);
    const userClient = deps.createUserClient(token);
    let user: AuthUser | null = null;
    try {
      const { data, error } = await userClient.auth.getUser(token);
      user = error ? null : data.user;
    } catch {
      user = null;
    }
    if (!user || typeof user.id !== "string" || !UUID_RE.test(user.id)) return fail("UNAUTHORIZED", 401);
    const uid = user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (input.confirm !== "DELETE") return fail("CONFIRMATION_REQUIRED", 400);
    const rawCode = input.apple_authorization_code;
    const appleCode = typeof rawCode === "string" && rawCode.trim() !== "" ? rawCode.trim() : null;

    // 1. Recent sign-in. getUser() above already verified this exact token with GoTrue, so
    // decoding its payload without re-checking the signature only reads verified claims.
    const nowS = Math.floor(deps.now() / 1000);
    const payload = decodeJwtPayload(token);
    if (payload && payload.sub !== uid) return fail("UNAUTHORIZED", 401);
    const signedInAt = payload ? lastSignInSeconds(payload) : null;
    if (
      signedInAt === null ||
      nowS - signedInAt > MAX_SIGN_IN_AGE_S ||
      signedInAt - nowS > MAX_CLOCK_SKEW_S
    ) {
      return fail("REAUTH_REQUIRED", 403);
    }

    // 2. RevenueCat subscriber record (holds the uid and the email attribute).
    const rcKey = deps.env("REVENUECAT_SECRET_API_KEY");
    if (!rcKey) {
      deps.log("delete-account: step_failed step=revenuecat reason=missing_secret");
      return fail("CONFIG_MISSING", 500);
    }
    try {
      const rcRes = await deps.fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${rcKey}` },
      });
      // RevenueCat: "treat both 200 and 404 as successful 'ensure deleted' completion".
      if (rcRes.status !== 200 && rcRes.status !== 404) {
        deps.log(`delete-account: step_failed step=revenuecat status=${rcRes.status}`);
        return fail("REVENUECAT_DELETE_FAILED", 502);
      }
    } catch {
      deps.log("delete-account: step_failed step=revenuecat reason=network");
      return fail("REVENUECAT_DELETE_FAILED", 502);
    }

    // 3. Sign in with Apple revocation. Andrew's ruling: never blocks deletion.
    if (hasAppleIdentity(user)) {
      const reason = await revokeApple(deps, appleCode, nowS);
      if (reason) deps.log(`delete-account: apple_revoke_failed reason=${reason}`);
    }

    // 4. Storage objects are not cascaded by an auth delete. The caller's own JWT can list and
    // remove its folder through the 0027 st_sel/st_del policies, so no service key is used.
    try {
      const bucket = userClient.storage.from(MEDIA_BUCKET);
      const paths = await collectObjectPaths(bucket, uid);
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) throw new Error("remove");
      }
    } catch (error) {
      const stage = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unknown";
      deps.log(`delete-account: step_failed step=storage reason=${stage}`);
      return fail("STORAGE_DELETE_FAILED", 500);
    }

    // 5. Rows the auth cascade does not remove (event_logs, subscription_events payloads, and
    // workouts/workout_log/chats whose live FK state is unverified), in one transaction.
    try {
      const { data, error } = await deps.admin.rpc("delete_user_data", { p_user_id: uid });
      if (error) {
        deps.log(`delete-account: step_failed step=db_purge code=${safeCode(error.code)}`);
        return fail("DB_PURGE_FAILED", 500);
      }
      // "skipped" names tables that exist without a user_id column, so their rows were not
      // purged. Not a failure (the auth cascade still runs), but it must not be silent.
      // Only plain table identifiers are logged.
      const skipped = (data as { skipped?: unknown } | null)?.skipped;
      const tables = Array.isArray(skipped)
        ? skipped.filter((t): t is string => typeof t === "string" && /^[a-z_]{1,63}$/.test(t))
        : [];
      if (tables.length > 0) deps.log(`delete-account: purge_skipped tables=${tables.join(",")}`);
    } catch {
      deps.log("delete-account: step_failed step=db_purge code=unknown");
      return fail("DB_PURGE_FAILED", 500);
    }

    // 7. Delete the auth user last; its FK cascade removes every remaining per-user table.
    try {
      const { error } = await deps.admin.auth.admin.deleteUser(uid);
      if (error) {
        deps.log(`delete-account: step_failed step=auth_delete code=${safeCode(error.code)}`);
        return fail("AUTH_DELETE_FAILED", 500);
      }
    } catch {
      deps.log("delete-account: step_failed step=auth_delete code=unknown");
      return fail("AUTH_DELETE_FAILED", 500);
    }

    return json({ ok: true });
  };
}
