# Coach Kettle — Subscription & Trial System Plan

---

## PHASE 0: REPO & SUPABASE DISCOVERY SUMMARY

### Existing Auth Flow

- **Sign-up**: `app/auth/sign-up.tsx` — email/password via `supabase.auth.signUp()` + OAuth (Apple/Google) via PKCE
- **Sign-in**: `app/auth/sign-in.tsx` — email/password via `supabase.auth.signInWithPassword()` + OAuth
- **Post-auth**: `completeAuthAndNavigate()` sets TTL timestamp, checks terms acceptance, redirects to `/(tabs)` or `/terms-of-service`
- **Profile creation**: `lib/profile.ts` → `ensureProfile(userId)` calls `/profile` edge function; creates row in `profiles` table
- **User metadata**: `profiles` table holds onboarding state, physical stats, fitness goals, AI context

### Navigation & Routing

```
app/_layout.tsx Provider Stack:
  ThemeProvider
    → AuthProvider          (session state)
      → ProfileProvider     (profile + onboarding check)
        → PRCelebrationProvider
          → AuthLockProvider (TTL + terms)
            → GestureHandlerRootView
              → Stack Navigator

app/(tabs)/_layout.tsx Redirect Chain:
  loading?         → ActivityIndicator
  !session?        → /auth/sign-in
  needsTerms?      → /terms-of-service
  needsOnboarding? → /onboarding
  else             → Render tabs (index, history)
```

**Gating insertion point**: After `needsOnboarding` check in `app/(tabs)/_layout.tsx`, add `needsSubscription` check → redirect to `/paywall`.

### Supabase Usage Patterns

- **Client**: `lib/supabase.ts` — hardcoded URL + anon key, AsyncStorage for session persistence
- **Edge functions**: All in `supabase/functions/`, use `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` for admin client
- **Auth in edge functions**: Manual JWT verification via `supabaseAdmin.auth.getUser(token)`, returns `user.id`
- **Response format**: `{ ok: true, data: ... }` or `{ error: "message" }`
- **CORS**: Standard preflight handling with `corsHeaders` object
- **Config**: `supabase/config.toml` has `verify_jwt = false` for all functions (manual verification in code)

### Existing Tables (All RLS-Enabled)

| Table | Purpose | RLS Pattern |
|-------|---------|-------------|
| `profiles` | User profile + onboarding | CRUD own (`auth.uid() = user_id`) |
| `workouts` | Saved workout sessions | CRUD own |
| `workout_log` | Per-set log entries | CRUD own |
| `chats` | Chat messages | CRUD own |
| `chat_history` | Coach conversations | CRUD own |
| `pr_tracked_lifts` | Which lifts to track PRs | CRUD own |
| `pr_lifts` | Current PR records | CRUD own |
| `pr_history` | PR breakthrough timeline | Select/Insert own |
| `workout_templates` | User workout templates | CRUD own |
| `workout_template_items` | Exercises within templates | CRUD own |
| `user_terms_acceptance` | ToS acceptance audit | Select/Insert only (immutable) |
| `event_logs` | Observability/audit | Select/Insert own |

### RLS Posture

All policies use optimized subselect pattern: `(SELECT auth.uid()) = user_id`. Edge functions bypass RLS via service role key and manually filter by user_id extracted from JWT.

### Existing Entitlement Logic

**None found.** No references to "premium", "trial", "subscription", "entitlement", "paywall", or "gate" exist in the codebase. This is a greenfield addition.

---

## PHASE 1: DESIGN — PLAN TREE

### Architecture A: DB-Driven Entitlements + Periodic Verification Stubs

**Schema**: `trial_grants` table records trial start; `user_entitlements` view computes derived state from trial window + subscription records. Edge function `/entitlements/me` queries this view. No webhook infrastructure; receipt verification is a stub that writes to `subscriptions` table.

**Flow**:
```
Signup → profile edge function also calls bootstrap_trial()
Check access → /entitlements/me queries derived view
Purchase (future) → /iap/verify_receipt writes subscription record
Expiry → computed at query time from timestamps
```

**Pros**: Minimal infrastructure, no webhook server needed initially, all state derived from timestamps.
**Cons**: No real-time subscription state updates; relies on client polling; receipt verification is purely a stub with no path to App Store Server Notifications without adding webhook endpoint later.
**Complexity**: Low.
**Failure modes**: Stale entitlement state if client doesn't poll; no server push for subscription changes; renewal/cancellation invisible until next poll.

---

### Architecture B: Edge-Function Verification + Webhook-Driven Subscription Status (RECOMMENDED)

**Schema**: `trial_grants` (immutable audit), `subscriptions` (authoritative App Store records), `user_entitlements` (materialized derived state). Edge functions: `/entitlements/bootstrap`, `/entitlements/me`, `/iap/verify_receipt` (stub), `/iap/notifications` (stub for App Store Server Notifications v2).

**Flow**:
```
Signup → /entitlements/bootstrap creates trial_grant + entitlement row
Check access → /entitlements/me returns cached entitlement state
Purchase (future) → client sends receipt → /iap/verify_receipt validates + writes subscription
Renewal/Cancel → App Store sends notification → /iap/notifications updates subscription + entitlement
Expiry → /entitlements/bootstrap sets trial_expires_at; cron or on-access check flips state
```

**Pros**: Server-authoritative; webhook endpoint ready for App Store Server Notifications v2; entitlement state is materialized (fast reads); clear separation of concerns; idempotent bootstrap.
**Cons**: More tables and endpoints to maintain; webhook requires public endpoint (Supabase Edge Functions support this).
**Complexity**: Medium.
**Failure modes**: Webhook delivery failure (mitigated by periodic reconciliation stub); edge function cold start on notification (acceptable latency).

---

### Architecture C: Local Gating with Server Sync

**Schema**: Entitlement status stored in `profiles.subscription_tier` column. Client writes trial start to AsyncStorage. Server syncs periodically.

**Flow**:
```
Signup → client sets trial_start in AsyncStorage
Check access → client computes from local timestamp
Purchase (future) → client calls StoreKit, writes to AsyncStorage + server
```

**Pros**: Fastest reads (local), works offline.
**Cons**: **FATALLY INSECURE** — client can forge premium status by manipulating AsyncStorage. No server authority. Clock manipulation bypasses trial. Violates security constraints. Included only as contrast.
**Complexity**: Low.
**Failure modes**: Complete bypass via device clock manipulation, AsyncStorage tampering, jailbroken device, or decompiled app modification.

---

### Tradeoff Table

| Criterion | A: DB-Driven | B: Edge+Webhook (REC) | C: Local Gating |
|-----------|:---:|:---:|:---:|
| Server-authoritative | Yes | Yes | **No** |
| Webhook-ready | No | Yes | No |
| Real-time state updates | No (polling) | Yes (webhook) | No |
| Implementation complexity | Low | Medium | Low |
| Offline resilience | None | Cached state | Full |
| Security | Strong | Strong | **Weak** |
| Future App Store integration | Partial | Full | None |
| Scales to multiple products | No | Yes | No |

### Decision: Architecture B

**Justification**: Architecture B is the only option that provides server-authoritative entitlements AND a webhook endpoint for App Store Server Notifications v2, which Apple strongly recommends and will eventually require. The materialized `user_entitlements` table gives fast reads while `subscriptions` provides the audit trail. The medium complexity is justified by the security requirements and the fact that this is a monetization-critical system. Architecture A would require rework to add webhooks later. Architecture C is disqualified on security grounds.

---

## PHASE 2: EXECUTION-READY PLAN

### 1. Architecture Overview

#### Data Flow Diagrams

**Trial Bootstrap (on first signup)**:
```
1. User completes signup (sign-up.tsx)
2. AuthProvider detects session
3. ProfileProvider calls ensureProfile(userId)
4. Profile edge function creates profile row
5. Client calls POST /entitlements/bootstrap (idempotent)
6. Edge function checks: trial_grant exists for user?
   a. YES → return existing entitlement (no-op)
   b. NO  → INSERT trial_grants row (trial_started_at = NOW(), trial_expires_at = NOW() + 7 days)
          → UPSERT user_entitlements row (status = 'trial_active', expires_at = trial_expires_at)
          → return entitlement state
7. EntitlementProvider caches result; app renders main content
```

**Access Check (on app open / foreground)**:
```
1. App opens or returns to foreground
2. EntitlementProvider calls GET /entitlements/me
3. Edge function queries user_entitlements WHERE user_id = auth.uid()
4. If trial_expires_at < NOW() AND status = 'trial_active':
   → UPDATE user_entitlements SET status = 'trial_expired'
   → return { status: 'trial_expired' }
5. Return entitlement state to client
6. Client routes based on status:
   - trial_active / sub_active  → /(tabs)
   - trial_expired / sub_expired → /paywall
```

**Future Purchase Flow (deferred)**:
```
1. User taps "Subscribe" on paywall screen
2. Client initiates StoreKit purchase (future)
3. On success, client receives receipt
4. Client calls POST /iap/verify_receipt with receipt data
5. Edge function validates receipt with App Store (future)
6. Edge function writes to subscriptions table
7. Edge function updates user_entitlements status = 'sub_active'
8. Client refreshes entitlement → paywall dismissed
```

**Future Webhook Flow (deferred)**:
```
1. App Store sends Server Notification v2 to POST /iap/notifications
2. Edge function validates JWS signature (future)
3. Edge function extracts notification type:
   - DID_RENEW → update subscriptions.expires_at; set entitlement = sub_active
   - DID_FAIL_TO_RENEW → set entitlement = sub_grace_period (if applicable)
   - EXPIRED → set entitlement = sub_expired
   - REFUND → set entitlement = sub_expired; log refund
4. Edge function writes to subscription_events log
5. User's next /entitlements/me call reflects updated state
```

#### State Machine

```
                        ┌─────────────────────┐
  New Account ─────────►│    TRIAL_ACTIVE      │
  (bootstrap)           │ (7-day window)       │
                        └──────────┬──────────┘
                                   │
                          trial_expires_at < NOW()
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │   TRIAL_EXPIRED      │◄──── access gated
                        │                      │
                        └──────────┬──────────┘
                                   │
                          subscription purchased
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │    SUB_ACTIVE        │◄──── auto-renew
                        │                      │─────────┐
                        └──────────┬──────────┘         │
                                   │                     │
                          subscription expires /          │
                          fails to renew                  │
                                   │                     │
                                   ▼                     │
                        ┌─────────────────────┐         │
                        │    SUB_EXPIRED       │         │
                        │                      │─────────┘
                        └─────────────────────┘  re-subscribe
```

**Valid states**: `trial_active`, `trial_expired`, `sub_active`, `sub_expired`

**Source-of-truth rules**:
1. `user_entitlements.status` is the single source of truth for access decisions
2. Only service-role / edge functions may write to `user_entitlements`, `subscriptions`, `trial_grants`
3. Client reads are always via `/entitlements/me` (never direct table query)
4. State transitions are computed server-side based on timestamps and App Store data
5. Trial can only be granted once per `auth.users.id` (enforced by UNIQUE constraint on `trial_grants.user_id`)

---

### 2. Database Plan

#### Tables

##### `trial_grants` — Immutable record of trial issuance

```sql
CREATE TABLE public.trial_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.trial_grants IS 'Immutable record of one-time trial grant per user. UNIQUE on user_id ensures exactly one trial.';
```

##### `subscriptions` — Authoritative App Store subscription records

```sql
CREATE TABLE public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    apple_original_transaction_id TEXT,
    apple_product_id        TEXT,
    status                  TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'billing_retry', 'revoked'))
                            DEFAULT 'active',
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    auto_renew_enabled      BOOLEAN DEFAULT TRUE,
    receipt_data            TEXT,
    environment             TEXT CHECK (environment IN ('sandbox', 'production')) DEFAULT 'production',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, apple_original_transaction_id)
);

COMMENT ON TABLE public.subscriptions IS 'Authoritative subscription records from App Store. Only writable by service-role.';
```

##### `user_entitlements` — Materialized derived entitlement state

```sql
CREATE TABLE public.user_entitlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('trial_active', 'trial_expired', 'sub_active', 'sub_expired'))
                    DEFAULT 'trial_active',
    source          TEXT NOT NULL CHECK (source IN ('trial', 'subscription', 'manual'))
                    DEFAULT 'trial',
    expires_at      TIMESTAMPTZ,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_entitlements IS 'Materialized entitlement state. Single source of truth for access gating. Only writable by service-role.';
```

##### `subscription_events` — Audit log for subscription lifecycle events

```sql
CREATE TABLE public.subscription_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    event_subtype   TEXT,
    raw_payload     JSONB,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT UNIQUE
);

COMMENT ON TABLE public.subscription_events IS 'Audit trail for all subscription lifecycle events (App Store notifications, manual changes).';
```

#### Indices

```sql
-- trial_grants
CREATE INDEX idx_trial_grants_user_id ON public.trial_grants (user_id);

-- subscriptions
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX idx_subscriptions_apple_txn ON public.subscriptions (apple_original_transaction_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions (user_id, status);

-- user_entitlements
CREATE INDEX idx_user_entitlements_user_id ON public.user_entitlements (user_id);
CREATE INDEX idx_user_entitlements_status ON public.user_entitlements (status);

-- subscription_events
CREATE INDEX idx_subscription_events_user_id ON public.subscription_events (user_id);
CREATE INDEX idx_subscription_events_idempotency ON public.subscription_events (idempotency_key);
CREATE INDEX idx_subscription_events_type ON public.subscription_events (event_type, processed_at DESC);
```

#### SQL Migration (Copy/Paste Runnable)

**File**: `supabase/migrations/0025_subscription_system.sql`

```sql
-- ============================================================
-- Migration 0025: Subscription & Trial System
-- ============================================================

-- 1. TABLES
-- ------------------------------------------------------------

-- Trial grants (immutable, one per user)
CREATE TABLE IF NOT EXISTS public.trial_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions (App Store authoritative records)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    apple_original_transaction_id TEXT,
    apple_product_id        TEXT,
    status                  TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'billing_retry', 'revoked'))
                            DEFAULT 'active',
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    auto_renew_enabled      BOOLEAN DEFAULT TRUE,
    receipt_data            TEXT,
    environment             TEXT CHECK (environment IN ('sandbox', 'production')) DEFAULT 'production',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, apple_original_transaction_id)
);

-- User entitlements (materialized derived state)
CREATE TABLE IF NOT EXISTS public.user_entitlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('trial_active', 'trial_expired', 'sub_active', 'sub_expired'))
                    DEFAULT 'trial_active',
    source          TEXT NOT NULL CHECK (source IN ('trial', 'subscription', 'manual'))
                    DEFAULT 'trial',
    expires_at      TIMESTAMPTZ,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscription events (audit log)
CREATE TABLE IF NOT EXISTS public.subscription_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    event_subtype   TEXT,
    raw_payload     JSONB,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT UNIQUE
);

-- 2. INDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trial_grants_user_id ON public.trial_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_txn ON public.subscriptions (apple_original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON public.user_entitlements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_status ON public.user_entitlements (status);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_idempotency ON public.subscription_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON public.subscription_events (event_type, processed_at DESC);

-- 3. ENABLE RLS
-- ------------------------------------------------------------

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- 4. REVOKE BROAD PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON public.trial_grants FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.user_entitlements FROM anon, authenticated;
REVOKE ALL ON public.subscription_events FROM anon, authenticated;

-- 5. RLS POLICIES — LEAST PRIVILEGE
-- ------------------------------------------------------------

-- trial_grants: users can only SELECT their own row; no INSERT/UPDATE/DELETE from client
GRANT SELECT ON public.trial_grants TO authenticated;

CREATE POLICY trial_grants_select_own ON public.trial_grants
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- subscriptions: users can only SELECT their own rows; no writes from client
GRANT SELECT ON public.subscriptions TO authenticated;

CREATE POLICY subscriptions_select_own ON public.subscriptions
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- user_entitlements: users can only SELECT their own row; no writes from client
GRANT SELECT ON public.user_entitlements TO authenticated;

CREATE POLICY user_entitlements_select_own ON public.user_entitlements
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- subscription_events: users can SELECT their own events; no writes from client
GRANT SELECT ON public.subscription_events TO authenticated;

CREATE POLICY subscription_events_select_own ON public.subscription_events
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- 6. TRIGGERS
-- ------------------------------------------------------------

-- Auto-update updated_at on subscriptions
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Auto-update updated_at on user_entitlements
CREATE TRIGGER trg_user_entitlements_updated_at
    BEFORE UPDATE ON public.user_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 7. HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS)
-- ------------------------------------------------------------

-- Bootstrap trial for a user (idempotent)
CREATE OR REPLACE FUNCTION public.bootstrap_trial(p_user_id UUID)
RETURNS TABLE(
    entitlement_status TEXT,
    expires_at TIMESTAMPTZ,
    is_new_trial BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trial_exists BOOLEAN;
    v_trial_expires TIMESTAMPTZ;
    v_entitlement_status TEXT;
BEGIN
    -- Check if trial already exists
    SELECT EXISTS(SELECT 1 FROM trial_grants WHERE user_id = p_user_id) INTO v_trial_exists;

    IF v_trial_exists THEN
        -- Return existing entitlement
        SELECT ue.status, ue.expires_at
        INTO v_entitlement_status, v_trial_expires
        FROM user_entitlements ue WHERE ue.user_id = p_user_id;

        -- If no entitlement row exists (edge case), create one from trial
        IF v_entitlement_status IS NULL THEN
            SELECT tg.trial_expires_at INTO v_trial_expires
            FROM trial_grants tg WHERE tg.user_id = p_user_id;

            INSERT INTO user_entitlements (user_id, status, source, expires_at)
            VALUES (
                p_user_id,
                CASE WHEN v_trial_expires > NOW() THEN 'trial_active' ELSE 'trial_expired' END,
                'trial',
                v_trial_expires
            )
            ON CONFLICT (user_id) DO NOTHING;

            SELECT ue.status, ue.expires_at
            INTO v_entitlement_status, v_trial_expires
            FROM user_entitlements ue WHERE ue.user_id = p_user_id;
        END IF;

        RETURN QUERY SELECT v_entitlement_status, v_trial_expires, FALSE;
        RETURN;
    END IF;

    -- Create new trial
    v_trial_expires := NOW() + INTERVAL '7 days';

    INSERT INTO trial_grants (user_id, trial_started_at, trial_expires_at)
    VALUES (p_user_id, NOW(), v_trial_expires);

    INSERT INTO user_entitlements (user_id, status, source, expires_at)
    VALUES (p_user_id, 'trial_active', 'trial', v_trial_expires)
    ON CONFLICT (user_id) DO UPDATE
        SET status = 'trial_active',
            source = 'trial',
            expires_at = v_trial_expires,
            updated_at = NOW();

    RETURN QUERY SELECT 'trial_active'::TEXT, v_trial_expires, TRUE;
END;
$$;

-- Get current entitlement state (with lazy expiry check)
CREATE OR REPLACE FUNCTION public.get_entitlement(p_user_id UUID)
RETURNS TABLE(
    entitlement_status TEXT,
    entitlement_source TEXT,
    expires_at TIMESTAMPTZ,
    trial_days_remaining INTEGER,
    subscription_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row user_entitlements%ROWTYPE;
    v_days_remaining INTEGER;
BEGIN
    SELECT * INTO v_row FROM user_entitlements WHERE user_id = p_user_id;

    IF v_row IS NULL THEN
        -- No entitlement exists; return null state (caller should bootstrap)
        RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::UUID;
        RETURN;
    END IF;

    -- Lazy expiry: if trial_active but expired, flip status
    IF v_row.status = 'trial_active' AND v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
        UPDATE user_entitlements
        SET status = 'trial_expired', updated_at = NOW()
        WHERE user_id = p_user_id AND status = 'trial_active';

        v_row.status := 'trial_expired';
    END IF;

    -- Lazy expiry: if sub_active but expired, flip status
    IF v_row.status = 'sub_active' AND v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
        UPDATE user_entitlements
        SET status = 'sub_expired', updated_at = NOW()
        WHERE user_id = p_user_id AND status = 'sub_active';

        v_row.status := 'sub_expired';
    END IF;

    -- Calculate trial days remaining
    IF v_row.source = 'trial' AND v_row.expires_at IS NOT NULL AND v_row.expires_at > NOW() THEN
        v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_row.expires_at - NOW()))::INTEGER);
    ELSE
        v_days_remaining := 0;
    END IF;

    RETURN QUERY SELECT
        v_row.status,
        v_row.source,
        v_row.expires_at,
        v_days_remaining,
        v_row.subscription_id;
END;
$$;
```

#### Notes on Backfill and Idempotency

- **Existing users**: When the app updates, existing users will hit `/(tabs)` → `EntitlementProvider` calls `/entitlements/bootstrap`. If no `trial_grants` row exists, a trial is created retroactively. This means existing users get a fresh 7-day trial on first app open after the update.
- **Alternative backfill**: If you want existing users to bypass trial (grandfather them), run a one-time migration:
  ```sql
  -- OPTIONAL: Grandfather existing users with active subscriptions
  INSERT INTO trial_grants (user_id, trial_started_at, trial_expires_at)
  SELECT id, NOW(), NOW() + INTERVAL '999 years'
  FROM auth.users
  WHERE id IN (SELECT DISTINCT user_id FROM workouts)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_entitlements (user_id, status, source, expires_at)
  SELECT id, 'trial_active', 'manual', NOW() + INTERVAL '999 years'
  FROM auth.users
  WHERE id IN (SELECT DISTINCT user_id FROM workouts)
  ON CONFLICT (user_id) DO NOTHING;
  ```
- **Idempotency**: `bootstrap_trial()` is fully idempotent. Calling it multiple times for the same user returns the existing trial without creating duplicates (enforced by `UNIQUE(user_id)` on `trial_grants` and `ON CONFLICT` on `user_entitlements`).

---

### 3. Backend Plan (Supabase Edge Functions)

#### Apple Value Placeholders

```env
# Add to Supabase project secrets (supabase secrets set)
APPLE_SUBSCRIPTION_PRODUCT_ID=<TO_FILL>
APPLE_SHARED_SECRET=<TO_FILL>
APPLE_APP_BUNDLE_ID=<TO_FILL>
APP_STORE_CONNECT_KEY_ID=<TO_FILL>
APP_STORE_CONNECT_ISSUER_ID=<TO_FILL>
APP_STORE_CONNECT_PRIVATE_KEY=<TO_FILL>
APP_STORE_ENVIRONMENT=sandbox  # Change to 'production' for release
```

#### Endpoint Definitions

##### POST `/entitlements/bootstrap`

**Purpose**: Create trial for new user on first access. Idempotent.

**Security**: Requires user JWT (Authorization header).

**File**: `supabase/functions/entitlements/index.ts`

**Contract**:
```typescript
// Request
POST /entitlements
Authorization: Bearer <jwt>
Content-Type: application/json
{ "action": "bootstrap" }

// Response 200
{
  "ok": true,
  "data": {
    "status": "trial_active",      // | "trial_expired" | "sub_active" | "sub_expired"
    "source": "trial",             // | "subscription" | "manual"
    "expires_at": "2026-02-22T00:00:00Z",
    "trial_days_remaining": 7,
    "is_new_trial": true,
    "subscription_id": null
  }
}
```

**Implementation sketch**:
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function verifyAuth(req: Request): Promise<string> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new Error("Unauthorized");
    return data.user.id;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const userId = await verifyAuth(req);

        if (req.method === "POST") {
            const body = await req.json();
            const action = body.action;

            if (action === "bootstrap") {
                // Idempotent trial bootstrap
                const { data, error } = await supabaseAdmin.rpc("bootstrap_trial", {
                    p_user_id: userId
                });

                if (error) throw error;
                const row = data[0];

                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        status: row.entitlement_status,
                        expires_at: row.expires_at,
                        is_new_trial: row.is_new_trial,
                    }
                }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        if (req.method === "GET") {
            // GET /entitlements → returns current entitlement state
            const { data, error } = await supabaseAdmin.rpc("get_entitlement", {
                p_user_id: userId
            });

            if (error) throw error;
            const row = data[0];

            // If no entitlement exists, auto-bootstrap
            if (!row.entitlement_status) {
                const { data: bootstrapData, error: bootstrapError } = await supabaseAdmin.rpc("bootstrap_trial", {
                    p_user_id: userId
                });
                if (bootstrapError) throw bootstrapError;
                const bRow = bootstrapData[0];
                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        status: bRow.entitlement_status,
                        source: "trial",
                        expires_at: bRow.expires_at,
                        trial_days_remaining: 7,
                        subscription_id: null,
                    }
                }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({
                ok: true,
                data: {
                    status: row.entitlement_status,
                    source: row.entitlement_source,
                    expires_at: row.expires_at,
                    trial_days_remaining: row.trial_days_remaining,
                    subscription_id: row.subscription_id,
                }
            }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e) {
        const status = e.message === "Unauthorized" ? 401 : 500;
        return new Response(JSON.stringify({ error: e.message }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
```

##### POST `/iap/verify_receipt` (Placeholder)

**Purpose**: Stub for future receipt verification. Accepts receipt data, returns normalized subscription record. Currently returns a structured error indicating Apple integration is pending.

**Security**: Requires user JWT.

**File**: `supabase/functions/iap/index.ts`

**Contract**:
```typescript
// Request
POST /iap
Authorization: Bearer <jwt>
Content-Type: application/json
{
  "action": "verify_receipt",
  "receipt_data": "<base64_receipt>",
  "product_id": "<TO_FILL>"
}

// Response 501 (Not Implemented — placeholder)
{
  "ok": false,
  "error": "Apple IAP verification not yet configured",
  "code": "IAP_NOT_CONFIGURED",
  "required_config": [
    "APPLE_SUBSCRIPTION_PRODUCT_ID",
    "APPLE_SHARED_SECRET"
  ]
}

// Future Response 200 (after Apple integration)
{
  "ok": true,
  "data": {
    "subscription_id": "uuid",
    "status": "active",
    "product_id": "com.coachkettle.monthly",
    "expires_at": "2026-03-15T00:00:00Z",
    "entitlement_status": "sub_active"
  }
}
```

**Implementation sketch**:
```typescript
// supabase/functions/iap/index.ts

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const userId = await verifyAuth(req);
        const body = await req.json();
        const action = body.action;

        if (action === "verify_receipt") {
            // PLACEHOLDER: Apple receipt verification not yet configured
            // When Apple Dev account is active, this will:
            // 1. Send receipt to Apple's verifyReceipt endpoint
            // 2. Parse the response for subscription status
            // 3. Write to subscriptions table
            // 4. Update user_entitlements

            const appleProductId = Deno.env.get("APPLE_SUBSCRIPTION_PRODUCT_ID");
            const appleSecret = Deno.env.get("APPLE_SHARED_SECRET");

            if (!appleProductId || !appleSecret) {
                return new Response(JSON.stringify({
                    ok: false,
                    error: "Apple IAP verification not yet configured",
                    code: "IAP_NOT_CONFIGURED",
                }), {
                    status: 501,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // FUTURE: Implement Apple receipt verification here
            // const appleResponse = await verifyWithApple(body.receipt_data, appleSecret);
            // const subscription = normalizeAppleResponse(appleResponse);
            // await writeSubscription(supabaseAdmin, userId, subscription);
            // await updateEntitlement(supabaseAdmin, userId, 'sub_active', subscription);

            return new Response(JSON.stringify({
                ok: false,
                error: "Apple IAP verification not yet implemented",
                code: "IAP_NOT_IMPLEMENTED",
            }), {
                status: 501,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (action === "notifications") {
            // PLACEHOLDER: App Store Server Notifications v2
            // This endpoint will be called by Apple, NOT by the client
            // It does NOT require user JWT — it validates Apple's JWS signature instead

            // When configured, this will:
            // 1. Validate JWS signature using Apple's public key
            // 2. Extract notification type (DID_RENEW, EXPIRED, REFUND, etc.)
            // 3. Look up user by original_transaction_id
            // 4. Update subscriptions table
            // 5. Update user_entitlements
            // 6. Log to subscription_events with idempotency_key

            const idempotencyKey = body.signedPayload
                ? `apple_notif_${hashPayload(body.signedPayload)}`
                : null;

            if (idempotencyKey) {
                // Check for duplicate
                const { data: existing } = await supabaseAdmin
                    .from("subscription_events")
                    .select("id")
                    .eq("idempotency_key", idempotencyKey)
                    .maybeSingle();

                if (existing) {
                    return new Response(JSON.stringify({ ok: true, deduplicated: true }), {
                        status: 200,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }

            // Log the raw event even before we can process it
            await supabaseAdmin.from("subscription_events").insert({
                event_type: "apple_notification_received",
                event_subtype: "unprocessed",
                raw_payload: body,
                idempotency_key: idempotencyKey,
            });

            return new Response(JSON.stringify({
                ok: true,
                message: "Notification logged but not yet processed (Apple integration pending)"
            }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e) {
        const status = e.message === "Unauthorized" ? 401 : 500;
        return new Response(JSON.stringify({ error: e.message }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});

// PLACEHOLDER: Hash function for idempotency keys
function hashPayload(payload: string): string {
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < Math.min(payload.length, 100); i++) {
        const char = payload.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
```

#### Security Model

| Endpoint | Auth | Who Calls | Input Validation | Idempotency |
|----------|------|-----------|-----------------|-------------|
| `GET /entitlements` | User JWT | Client app | userId from JWT only | Safe (read-only) |
| `POST /entitlements` (bootstrap) | User JWT | Client app | action field validated | Yes (UNIQUE constraint + ON CONFLICT) |
| `POST /iap` (verify_receipt) | User JWT | Client app | receipt_data required; product_id validated against env | Yes (upsert on original_transaction_id) |
| `POST /iap` (notifications) | Apple JWS (future) | Apple servers | JWS signature validation (future) | Yes (idempotency_key from payload hash) |

**Replay protection**:
- `/entitlements/bootstrap`: UNIQUE constraint on `trial_grants.user_id` prevents duplicate trials
- `/iap/notifications`: `subscription_events.idempotency_key` UNIQUE constraint deduplicates webhook deliveries
- `/iap/verify_receipt`: `subscriptions.UNIQUE(user_id, apple_original_transaction_id)` prevents duplicate subscription records

**Supabase config addition** (`supabase/config.toml`):
```toml
[functions.entitlements]
verify_jwt = false

[functions.iap]
verify_jwt = false
```

---

### 4. App Plan (Frontend)

#### EntitlementProvider

**New file**: `contexts/EntitlementContext.tsx`

```typescript
// contexts/EntitlementContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export type EntitlementStatus = 'trial_active' | 'trial_expired' | 'sub_active' | 'sub_expired' | 'loading' | 'unknown';

interface EntitlementState {
  status: EntitlementStatus;
  source: 'trial' | 'subscription' | 'manual' | null;
  expiresAt: string | null;
  trialDaysRemaining: number | null;
  subscriptionId: string | null;
}

interface EntitlementContextType {
  entitlement: EntitlementState;
  isLoading: boolean;
  hasAccess: boolean;             // true if trial_active or sub_active
  needsPaywall: boolean;          // true if trial_expired or sub_expired
  refreshEntitlement: () => Promise<void>;
}

const defaultState: EntitlementState = {
  status: 'loading',
  source: null,
  expiresAt: null,
  trialDaysRemaining: null,
  subscriptionId: null,
};

const EntitlementContext = createContext<EntitlementContextType>({
  entitlement: defaultState,
  isLoading: true,
  hasAccess: false,
  needsPaywall: false,
  refreshEntitlement: async () => {},
});

export const useEntitlement = () => useContext(EntitlementContext);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const fetchEntitlement = useCallback(async () => {
    if (!session?.access_token) {
      setEntitlement(defaultState);
      setIsLoading(false);
      return;
    }

    try {
      // Try GET first (existing entitlement)
      const getRes = await fetch(`${supabaseUrl}/functions/v1/entitlements`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
      });

      const getBody = await getRes.json();

      if (getBody.ok && getBody.data.status) {
        setEntitlement({
          status: getBody.data.status,
          source: getBody.data.source,
          expiresAt: getBody.data.expires_at,
          trialDaysRemaining: getBody.data.trial_days_remaining,
          subscriptionId: getBody.data.subscription_id,
        });
        setIsLoading(false);
        return;
      }

      // No entitlement exists — bootstrap
      const postRes = await fetch(`${supabaseUrl}/functions/v1/entitlements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'bootstrap' }),
      });

      const postBody = await postRes.json();

      if (postBody.ok) {
        setEntitlement({
          status: postBody.data.status,
          source: 'trial',
          expiresAt: postBody.data.expires_at,
          trialDaysRemaining: 7,
          subscriptionId: null,
        });
      } else {
        setEntitlement({ ...defaultState, status: 'unknown' });
      }
    } catch (error) {
      console.error('[EntitlementProvider] Error fetching entitlement:', error);
      setEntitlement({ ...defaultState, status: 'unknown' });
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  // Fetch on mount and session change
  useEffect(() => {
    if (session) {
      fetchEntitlement();
    } else {
      setEntitlement(defaultState);
      setIsLoading(false);
    }
  }, [session, fetchEntitlement]);

  // Re-check on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        fetchEntitlement();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [fetchEntitlement]);

  const hasAccess = entitlement.status === 'trial_active' || entitlement.status === 'sub_active';
  const needsPaywall = entitlement.status === 'trial_expired' || entitlement.status === 'sub_expired';

  return (
    <EntitlementContext.Provider value={{
      entitlement,
      isLoading,
      hasAccess,
      needsPaywall,
      refreshEntitlement: fetchEntitlement,
    }}>
      {children}
    </EntitlementContext.Provider>
  );
}
```

#### Provider Integration

**File to modify**: `app/_layout.tsx`

Add `EntitlementProvider` after `ProfileProvider` in the hierarchy:

```
ThemeProvider
  → AuthProvider
    → ProfileProvider
      → EntitlementProvider     ← NEW
        → PRCelebrationProvider
          → AuthLockProvider
            → GestureHandlerRootView
```

#### Navigation Gating

**File to modify**: `app/(tabs)/_layout.tsx`

Add entitlement check after onboarding check:

```typescript
import { useEntitlement } from '@/contexts/EntitlementContext';

// Inside TabLayout component, after existing checks:
const { needsPaywall, isLoading: entitlementLoading, entitlement } = useEntitlement();

// Add to loading check:
if (loading || isCheckingLock || profileLoading || entitlementLoading) {
  return <ActivityIndicator ... />;
}

// After needsOnboarding check, before rendering tabs:
if (needsPaywall) {
  return <Redirect href="/paywall" />;
}
```

#### New Screens

##### PaywallScreen

**New file**: `app/paywall.tsx`

```typescript
// app/paywall.tsx
import { useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useAuth } from '@/components/AuthProvider';

export default function PaywallScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const { entitlement, refreshEntitlement, hasAccess } = useEntitlement();
  const { signOut } = useAuth();
  const router = useRouter();

  const handleCheckAgain = useCallback(async () => {
    await refreshEntitlement();
    // If access is restored, the tab layout redirect will handle navigation
  }, [refreshEntitlement]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/auth/sign-in');
  }, [signOut, router]);

  // If access was restored (e.g., subscription activated), redirect
  if (hasAccess) {
    router.replace('/(tabs)');
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Your Free Trial Has Ended
        </ThemedText>

        <ThemedText style={styles.body}>
          Your 7-day free trial of Coach Kettle has expired.
          Subscribe to continue tracking your workouts, PRs, and getting AI coaching.
        </ThemedText>

        <ThemedText style={styles.price}>
          $3/month
        </ThemedText>

        {/* NO purchase button — will be added when Apple Dev account is active */}
        <ThemedText style={styles.comingSoon}>
          Subscription coming soon. Check back for updates.
        </ThemedText>

        {/* Check Again button — allows user to refresh if subscription was activated externally */}
        <Pressable onPress={handleCheckAgain} style={styles.checkAgainButton}>
          <ThemedText style={styles.checkAgainText}>Check Again</ThemedText>
        </Pressable>

        {/* Restore Purchases placeholder */}
        <Pressable onPress={handleCheckAgain} style={styles.restoreButton}>
          <ThemedText style={styles.restoreText}>Restore Purchases</ThemedText>
        </Pressable>

        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
```

##### Trial Banner Component

**New file**: `components/ui/TrialBanner.tsx`

A small banner shown on the main screen when trial is active, showing days remaining:

```typescript
// components/ui/TrialBanner.tsx
import { View, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ui/themed-text';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useThemeColor } from '@/hooks/use-theme-color';

export function TrialBanner() {
  const { entitlement } = useEntitlement();
  const accentColor = useThemeColor({}, 'tint');

  if (entitlement.status !== 'trial_active' || entitlement.trialDaysRemaining === null) {
    return null;
  }

  const daysText = entitlement.trialDaysRemaining === 1
    ? '1 day'
    : `${entitlement.trialDaysRemaining} days`;

  return (
    <View style={[styles.banner, { backgroundColor: accentColor + '15' }]}>
      <ThemedText style={styles.text}>
        Free trial: {daysText} remaining
      </ThemedText>
    </View>
  );
}
```

#### Settings Section — Entitlement Status

**File to modify**: `app/settings/index.tsx`

Add a section showing current entitlement status:

```typescript
// In settings/index.tsx, add to the settings list:
import { useEntitlement } from '@/contexts/EntitlementContext';

// Inside the component:
const { entitlement } = useEntitlement();

// In the render, add a section:
<SettingRow
  label="Subscription"
  value={
    entitlement.status === 'trial_active'
      ? `Trial (${entitlement.trialDaysRemaining}d left)`
      : entitlement.status === 'sub_active'
        ? 'Active'
        : entitlement.status === 'trial_expired'
          ? 'Trial Expired'
          : 'Inactive'
  }
  onPress={() => {
    if (entitlement.status === 'trial_expired' || entitlement.status === 'sub_expired') {
      router.push('/paywall');
    }
  }}
/>
```

#### Stack Registration

**File to modify**: `app/_layout.tsx` (RootLayoutNav)

Add paywall screen to the Stack:

```typescript
<Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false }} />
```

#### Data Fetching & Caching Strategy

1. **On app launch**: `EntitlementProvider` fetches entitlement state via `GET /entitlements`
2. **On foreground**: Re-fetches entitlement state (handles cases where subscription was activated/expired in background)
3. **Cache duration**: State lives in React context; refreshed on every foreground event
4. **No AsyncStorage cache**: Entitlement state is always fetched from server to prevent tampering. If offline, last known state from context is used (see offline rules below).

#### Offline Behavior Rules

1. **If cached state is `trial_active` or `sub_active`**: Allow access. The server will reconcile on next online check.
2. **If cached state is `trial_expired` or `sub_expired`**: Show paywall. User cannot bypass by going offline.
3. **If no cached state (first launch offline)**: Show loading spinner. Block access until server can be reached. (New users cannot start trial without server confirmation.)
4. **If network request fails**: Keep last known state. Show a non-blocking "Unable to verify subscription" toast after 3 failed attempts.

#### Error States and Fallbacks

| Scenario | Behavior |
|----------|----------|
| `/entitlements` returns 500 | Keep last known state; retry on next foreground |
| `/entitlements` returns 401 | Auth expired; re-authenticate via AuthProvider |
| No internet | Use cached context state; show toast after 3 retries |
| Bootstrap fails | Retry once; if still fails, show generic error with "Try Again" button |
| Unknown entitlement status | Treat as `trial_active` for 24 hours (grace), log to `event_logs` |

---

### 5. Future Purchase Wiring Plan (DEFERRED)

This section is self-contained. Execute it when your Apple Developer account is active and you have product IDs.

#### Prerequisites

Before executing this section, you must have:
- [ ] Active Apple Developer Program membership
- [ ] App Store Connect app created with bundle ID
- [ ] Auto-renewable subscription product configured in App Store Connect
- [ ] StoreKit configuration file for testing (optional but recommended)
- [ ] App Store Server Notifications v2 URL configured to point to your `/iap` edge function

#### Step 1: Install StoreKit Dependencies

```bash
npx expo install expo-in-app-purchases
# or if using react-native-iap:
npm install react-native-iap
```

#### Step 2: Add Product ID Configuration

**New file**: `lib/subscription.ts`

```typescript
// lib/subscription.ts

export const SUBSCRIPTION_CONFIG = {
  // FILL THESE IN when Apple Dev account is active
  PRODUCT_ID: '<TO_FILL>',  // e.g., 'com.coachkettle.monthly'
  PRODUCT_IDS: ['<TO_FILL>'],
};

// StoreKit purchase flow
export async function purchaseSubscription(): Promise<{ receipt: string }> {
  // Implementation with expo-in-app-purchases or react-native-iap
  throw new Error('Not implemented — Apple Dev account required');
}

// Restore purchases
export async function restorePurchases(): Promise<{ receipt: string | null }> {
  throw new Error('Not implemented — Apple Dev account required');
}

// Verify receipt with server
export async function verifyReceipt(
  receipt: string,
  accessToken: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const response = await fetch(`${supabaseUrl}/functions/v1/iap`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'verify_receipt',
      receipt_data: receipt,
      product_id: SUBSCRIPTION_CONFIG.PRODUCT_ID,
    }),
  });
  return response.json();
}
```

#### Step 3: Add Purchase Button to Paywall

**File to modify**: `app/paywall.tsx`

```typescript
// Replace the "coming soon" text with:
import { purchaseSubscription, verifyReceipt } from '@/lib/subscription';

const handlePurchase = async () => {
  try {
    setPurchasing(true);
    const { receipt } = await purchaseSubscription();
    const result = await verifyReceipt(receipt, session.access_token);

    if (result.ok) {
      await refreshEntitlement();
      router.replace('/(tabs)');
    } else {
      Alert.alert('Purchase Error', result.error || 'Unable to verify purchase');
    }
  } catch (error) {
    Alert.alert('Purchase Error', error.message);
  } finally {
    setPurchasing(false);
  }
};

// Add button:
<Pressable onPress={handlePurchase} disabled={purchasing} style={styles.purchaseButton}>
  <ThemedText style={styles.purchaseText}>
    {purchasing ? 'Processing...' : 'Subscribe — $3/month'}
  </ThemedText>
</Pressable>
```

#### Step 4: Implement Restore Purchases

**File to modify**: `app/paywall.tsx`

```typescript
import { restorePurchases, verifyReceipt } from '@/lib/subscription';

const handleRestore = async () => {
  try {
    setRestoring(true);
    const { receipt } = await restorePurchases();
    if (!receipt) {
      Alert.alert('No Purchases Found', 'No previous subscriptions found for this Apple ID.');
      return;
    }
    const result = await verifyReceipt(receipt, session.access_token);
    if (result.ok) {
      await refreshEntitlement();
      router.replace('/(tabs)');
    } else {
      Alert.alert('Restore Error', 'Unable to verify previous purchase');
    }
  } catch (error) {
    Alert.alert('Restore Error', error.message);
  } finally {
    setRestoring(false);
  }
};
```

#### Step 5: Implement Server-Side Receipt Verification

**File to modify**: `supabase/functions/iap/index.ts`

Replace the placeholder in `verify_receipt` action:

```typescript
// Inside action === "verify_receipt":
const appleProductId = Deno.env.get("APPLE_SUBSCRIPTION_PRODUCT_ID");
const appleSecret = Deno.env.get("APPLE_SHARED_SECRET");
const appleEnv = Deno.env.get("APP_STORE_ENVIRONMENT") || "production";

const verifyUrl = appleEnv === "sandbox"
  ? "https://sandbox.itunes.apple.com/verifyReceipt"
  : "https://buy.itunes.apple.com/verifyReceipt";

// Call Apple's verifyReceipt
const appleRes = await fetch(verifyUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    "receipt-data": body.receipt_data,
    "password": appleSecret,
    "exclude-old-transactions": true,
  }),
});

const appleData = await appleRes.json();

// Status 21007 = sandbox receipt sent to production; retry with sandbox URL
if (appleData.status === 21007) {
  // Retry with sandbox URL...
}

if (appleData.status !== 0) {
  throw new Error(`Apple verification failed: status ${appleData.status}`);
}

// Extract latest subscription info
const latestReceipt = appleData.latest_receipt_info?.[0];
if (!latestReceipt) throw new Error("No subscription found in receipt");

const originalTxnId = latestReceipt.original_transaction_id;
const expiresDate = new Date(parseInt(latestReceipt.expires_date_ms));
const isActive = expiresDate > new Date();

// Upsert subscription record
const { data: subData, error: subError } = await supabaseAdmin
  .from("subscriptions")
  .upsert({
    user_id: userId,
    apple_original_transaction_id: originalTxnId,
    apple_product_id: latestReceipt.product_id,
    status: isActive ? "active" : "expired",
    current_period_start: new Date(parseInt(latestReceipt.purchase_date_ms)),
    current_period_end: expiresDate,
    auto_renew_enabled: latestReceipt.auto_renew_status === "1",
    receipt_data: body.receipt_data,
    environment: appleEnv,
  }, {
    onConflict: "user_id,apple_original_transaction_id",
  })
  .select()
  .single();

// Update entitlement
await supabaseAdmin
  .from("user_entitlements")
  .upsert({
    user_id: userId,
    status: isActive ? "sub_active" : "sub_expired",
    source: "subscription",
    expires_at: expiresDate,
    subscription_id: subData.id,
  }, {
    onConflict: "user_id",
  });

// Log event
await supabaseAdmin.from("subscription_events").insert({
  user_id: userId,
  subscription_id: subData.id,
  event_type: "receipt_verified",
  event_subtype: isActive ? "active" : "expired",
  idempotency_key: `verify_${originalTxnId}_${Date.now()}`,
});
```

#### Step 6: Implement App Store Server Notifications v2

**File to modify**: `supabase/functions/iap/index.ts`

Replace the placeholder in `notifications` action with JWS validation and subscription state updates. Reference: [Apple App Store Server Notifications V2 documentation](https://developer.apple.com/documentation/appstoreservernotifications).

#### Step 7: Set Supabase Secrets

```bash
supabase secrets set APPLE_SUBSCRIPTION_PRODUCT_ID="com.coachkettle.monthly"
supabase secrets set APPLE_SHARED_SECRET="your_shared_secret_here"
supabase secrets set APPLE_APP_BUNDLE_ID="com.coachkettle.app"
supabase secrets set APP_STORE_ENVIRONMENT="sandbox"
```

#### Step 8: Configure App Store Server Notifications URL

In App Store Connect → Your App → App Information → App Store Server Notifications:
- URL: `https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1/iap`
- Version: V2

#### Files Modified Summary (Future Purchase Wiring)

| File | Change |
|------|--------|
| `lib/subscription.ts` | NEW — StoreKit purchase + restore functions |
| `app/paywall.tsx` | Add purchase button + restore button |
| `supabase/functions/iap/index.ts` | Implement receipt verification + notification processing |
| `package.json` | Add `expo-in-app-purchases` or `react-native-iap` |
| Supabase secrets | Add Apple credentials |

---

### 6. Acceptance Tests

#### Post-Implementation Checklist

| # | Test | Expected Result | Verification Method |
|---|------|-----------------|---------------------|
| 1 | New signup → trial starts | `trial_grants` row created; `user_entitlements.status = 'trial_active'`; app shows main content with trial banner | Create new account; check DB; observe UI |
| 2 | Trial banner shows days remaining | Banner displays "Free trial: 7 days remaining" (or fewer) | Check TrialBanner component on home screen |
| 3 | Trial expired simulation → gated | Set `trial_expires_at` to past date in DB; reopen app → redirected to `/paywall` | Manually update DB; reopen app |
| 4 | Paywall shows correct messaging | "Your Free Trial Has Ended" + price + "Check Again" button + "Restore Purchases" | Visual inspection of paywall screen |
| 5 | "Check Again" refreshes entitlement | Tapping "Check Again" calls `GET /entitlements`; if subscription was activated, navigates back to `/(tabs)` | Activate subscription in DB; tap "Check Again" |
| 6 | Server marks subscription active → access granted | Set `user_entitlements.status = 'sub_active'` in DB; app refreshes → paywall dismissed | Update DB; reopen app or tap "Check Again" |
| 7 | Client cannot forge premium status | No RLS INSERT/UPDATE/DELETE policy on `user_entitlements`, `subscriptions`, or `trial_grants` for `authenticated` role | Attempt `supabase.from('user_entitlements').update(...)` from client → should fail |
| 8 | RLS prevents cross-user access | User A cannot SELECT User B's entitlement/subscription/trial | Query with User A's JWT for User B's data → empty result |
| 9 | RLS prevents client writes to subscription tables | Client-side INSERT/UPDATE/DELETE on `subscriptions`, `user_entitlements`, `trial_grants` → denied | Test from client Supabase SDK |
| 10 | Bootstrap is idempotent | Calling `POST /entitlements { action: "bootstrap" }` twice returns same trial, does not extend expiry | Call bootstrap twice; verify `trial_expires_at` unchanged |
| 11 | Settings shows entitlement status | Settings screen displays "Trial (Xd left)" or "Active" or "Trial Expired" | Navigate to Settings; verify label |
| 12 | No purchase button exists | Paywall has NO functional purchase initiation; only "Check Again" and informational text | Visual inspection |
| 13 | Existing users get trial on update | User with existing workouts opens updated app → gets 7-day trial (or is grandfathered if backfill was run) | Login as existing user after migration |
| 14 | Offline behavior: cached access | With `trial_active` cached, go offline → app remains accessible | Enable airplane mode; verify app works |
| 15 | Offline behavior: cached expired | With `trial_expired` cached, go offline → paywall remains shown | Enable airplane mode; verify paywall persists |
| 16 | Edge function auth failure | Call `/entitlements` without JWT → 401 error | `curl` without Authorization header |

#### Security Verification Queries

Run these from a client-authenticated session to verify RLS:

```sql
-- Should return only the authenticated user's row (1 row)
SELECT * FROM user_entitlements;

-- Should FAIL (no INSERT policy for authenticated)
INSERT INTO user_entitlements (user_id, status) VALUES (auth.uid(), 'sub_active');
-- Expected: ERROR: new row violates row-level security policy

-- Should FAIL (no UPDATE policy for authenticated)
UPDATE user_entitlements SET status = 'sub_active' WHERE user_id = auth.uid();
-- Expected: 0 rows affected (no UPDATE policy)

-- Should FAIL (no DELETE policy for authenticated)
DELETE FROM user_entitlements WHERE user_id = auth.uid();
-- Expected: 0 rows affected (no DELETE policy)

-- Should FAIL (cross-user access)
SELECT * FROM user_entitlements WHERE user_id = '<other_user_id>';
-- Expected: 0 rows returned
```

---

## APPENDIX: File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/0025_subscription_system.sql` | Tables, indices, RLS, functions |
| `supabase/functions/entitlements/index.ts` | Bootstrap + entitlement check endpoint |
| `supabase/functions/iap/index.ts` | Receipt verification + notifications stubs |
| `contexts/EntitlementContext.tsx` | Client-side entitlement state provider |
| `app/paywall.tsx` | Paywall/gating screen |
| `components/ui/TrialBanner.tsx` | Trial days remaining banner |
| `lib/subscription.ts` | FUTURE — StoreKit purchase helpers |

### Modified Files

| File | Change |
|------|--------|
| `app/_layout.tsx` | Add `EntitlementProvider` to provider hierarchy |
| `app/(tabs)/_layout.tsx` | Add `needsPaywall` redirect check |
| `app/(tabs)/index.tsx` | Add `<TrialBanner />` component |
| `app/settings/index.tsx` | Add subscription status row |
| `supabase/config.toml` | Add `[functions.entitlements]` and `[functions.iap]` sections |

### Deployments Required (User Runs Manually)

```bash
# 1. Apply database migration
supabase db push

# 2. Deploy edge functions
supabase functions deploy entitlements
supabase functions deploy iap

# 3. Reload app
# (Expo Go hot reload or rebuild)
```
