# Authentication Architecture

This document explains the authentication system in WorkoutTracker, including the different sign-in methods, JWT handling, and common troubleshooting steps.

## Overview

WorkoutTracker uses Supabase Auth for authentication with the following sign-in methods:
- **Email/Password** - Traditional username/password authentication
- **Google OAuth** - OAuth 2.0 flow via Google
- **Apple Sign-In** - OAuth 2.0 flow via Apple

## Authentication Flow

### 1. Sign-In Process

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Sign-In    │────▶│  Supabase    │────▶│  Session    │
│  Screen     │     │  Auth        │     │  Stored     │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Terms of    │
                    │  Service     │
                    │  Check       │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Home        │
                    │  Screen      │
                    └──────────────┘
```

### 2. OAuth Flow (Google/Apple)

1. User taps "Sign in with Google/Apple"
2. `WebBrowser.openAuthSessionAsync()` opens the OAuth provider
3. User authenticates with the provider
4. Provider redirects back to app with tokens in URL hash (`#access_token=...`)
5. App parses the hash, calls `supabase.auth.setSession()`
6. Session is persisted to AsyncStorage
7. App polls for session confirmation (up to 10 attempts, 300ms apart)
8. Once confirmed, Terms of Service check is performed
9. User is redirected to Home or Terms of Service screen

### 3. Session Storage

Sessions are stored in AsyncStorage with the key pattern `sb-{project-ref}-auth-token`.

## JWT Token Types

Supabase Auth can issue tokens with different signing algorithms:

| Algorithm | Description | Verification Method |
|-----------|-------------|---------------------|
| **HS256** | HMAC with SHA-256 | Uses `SUPABASE_JWT_SECRET` |
| **ES256** | ECDSA with P-256 | Uses JWKS endpoint |

### Edge Function JWT Verification

Edge Functions verify JWTs using a dual-verification approach:

1. **Try JWKS first** - Fetches public keys from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
2. **Fall back to secret** - Uses `SUPABASE_JWT_SECRET` if JWKS fails

This ensures compatibility with both signing algorithms.

## Key Files

| File | Purpose |
|------|---------|
| `app/auth/sign-in.tsx` | Sign-in UI and OAuth handling |
| `components/AuthProvider.tsx` | Global auth context and session management |
| `components/AuthLockProvider.tsx` | TTL-based session lock and biometrics |
| `lib/supabase.ts` | Supabase client configuration |
| `lib/api.ts` | API client with auth header injection |
| `lib/authLock.ts` | Session TTL and terms acceptance utilities |

## Edge Function Authentication

All Edge Functions require authentication. The flow is:

1. Client gets session via `supabase.auth.getSession()`
2. Client sends `Authorization: Bearer {access_token}` header
3. Edge Function verifies JWT and extracts user ID
4. Edge Function creates scoped Supabase client for database operations

### Edge Functions with Auth

- `terms-acceptance` - Check/record Terms of Service acceptance
- `history` - CRUD for workout history
- `chat-history` - CRUD for chat messages (e.g. AI chats)
- `chats` - List and manage chat threads
- `coach` - AI coaching questions
- `parse` - Natural language set parsing

## Troubleshooting

### "Invalid JWT" Errors (401)
...
## Deploying Edge Functions

When updating Edge Function authentication, redeploy with:

```bash
npx supabase login
npx supabase functions deploy terms-acceptance --no-verify-jwt
npx supabase functions deploy history --no-verify-jwt
npx supabase functions deploy chat-history --no-verify-jwt
npx supabase functions deploy chats --no-verify-jwt
```

The `--no-verify-jwt` flag is required because we handle JWT verification in the function code itself.

## Environment Variables

### Edge Functions

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_JWT_SECRET` | Recommended | JWT secret for HS256 fallback |

### Client

Set in `lib/supabase.ts`:
- `supabaseUrl` - Supabase project URL
- `supabaseAnonKey` - Supabase anonymous key

## Session TTL and Lock

The app implements a TTL-based session lock:

- Sessions are valid for 4 hours after last authentication
- After TTL expires, biometric re-authentication is required (if enabled)
- TTL is stored in AsyncStorage as `auth_last_authenticated_at`

See `lib/authLock.ts` and `components/AuthLockProvider.tsx` for implementation.
