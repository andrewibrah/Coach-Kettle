# Authentication System

> How users sign in, stay authenticated, and get locked out.

---

## Overview

The app uses **Supabase Auth** with multiple authentication methods:
- Email/password
- OAuth (Apple, Google)
- Biometric unlock (Face ID, Touch ID)

A **4-hour session TTL** provides security with convenience - users can unlock with biometrics within the window without re-entering credentials.

---

## Key Files

| File | Purpose |
|------|---------|
| `components/AuthProvider.tsx` | Auth context, session management |
| `components/AuthLockProvider.tsx` | Session TTL, biometric lock |
| `components/LockScreen.tsx` | Biometric unlock UI |
| `lib/auth.ts` | JWT utilities, auto-refresh |
| `lib/authLock.ts` | TTL timestamp management |
| `lib/biometrics.ts` | Biometric authentication |
| `lib/supabase.ts` | Supabase client init |
| `app/auth/*.tsx` | Auth screens |

---

## Auth Flow Diagram

```
App Launch
    │
    ▼
┌─────────────────────────┐
│ AuthProvider            │
│ Check Supabase session  │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
 No Session      Has Session
    │               │
    ▼               ▼
 /auth/sign-in   ┌─────────────────┐
                 │ AuthLockProvider│
                 │ Check TTL       │
                 └────────┬────────┘
                          │
                  ┌───────┴───────┐
                  │               │
                  ▼               ▼
               Expired         Valid
                  │               │
                  ▼               ▼
              LockScreen      Main App
              (Biometric)
```

---

## AuthProvider

**Location:** `components/AuthProvider.tsx`

**Context Values:**
```typescript
interface AuthContextValue {
  session: Session | null;      // Supabase session
  loading: boolean;             // Initial load state
  signOut: () => Promise<void>; // Sign out + clear caches
  clearAllCaches: () => Promise<void>;
}
```

**What it does:**
1. Subscribes to Supabase auth state changes
2. Provides current session to entire app
3. Handles sign out with cache clearing
4. Clears AsyncStorage data on logout

**Usage:**
```typescript
import { useAuth } from '@/components/AuthProvider';

function MyComponent() {
  const { session, signOut, loading } = useAuth();

  if (loading) return <Loading />;
  if (!session) return <Redirect to="/auth/sign-in" />;

  return <Text>Welcome, {session.user.email}</Text>;
}
```

---

## AuthLockProvider

**Location:** `components/AuthLockProvider.tsx`

**Context Values:**
```typescript
interface AuthLockContextValue {
  isLocked: boolean;
  biometricEnabled: boolean;
  termsAccepted: boolean;
  unlockWithBiometrics: () => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setTermsAccepted: (accepted: boolean) => Promise<void>;
}
```

**4-Hour TTL Logic:**
```typescript
// lib/authLock.ts
const AUTH_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function isSessionExpired(lastAuthAt: number): boolean {
  return Date.now() - lastAuthAt > AUTH_TTL_MS;
}
```

**What it does:**
1. Tracks last authentication timestamp
2. Locks app after 4-hour TTL expires
3. Allows biometric unlock within TTL window
4. Manages terms acceptance state

---

## LockScreen

**Location:** `components/LockScreen.tsx`

Displays when `isLocked === true`. Shows:
- Biometric unlock button (if enabled)
- "Sign In Again" fallback option

**Biometric Flow:**
```typescript
import { authenticateWithBiometrics } from '@/lib/biometrics';

const unlock = async () => {
  const result = await authenticateWithBiometrics(
    "Unlock Coach Kettle",
    { cancelLabel: "Cancel" }
  );

  if (result.success) {
    setLastAuthenticatedAt(Date.now());
    setIsLocked(false);
  }
};
```

---

## JWT Auto-Refresh

**Location:** `lib/auth.ts`

Proactively refreshes tokens 5 minutes before expiry:

```typescript
export async function getAuthHeaders(): Promise<Headers> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const expiresAt = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;

    // Refresh if expiring soon
    if (expiresAt - now < fiveMinutes) {
      await supabase.auth.refreshSession();
    }
  }

  // Return headers with current JWT
  return new Headers({
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey': supabaseAnonKey
  });
}
```

---

## Auth Screens

### Sign In (`app/auth/sign-in.tsx`)
- Email/password form
- OAuth buttons (Apple, Google)
- Link to forgot password
- Link to sign up

### Sign Up (`app/auth/sign-up.tsx`)
- Email/password registration
- Validates email format
- Redirects to sign in on success

### Forgot Password (`app/auth/forgot-password.tsx`)
- Email input
- Sends password reset email via Supabase

### Callback (`app/auth/callback.tsx`)
- Handles OAuth redirects
- Parses URL hash for tokens
- Sets session and redirects to app

---

## Implementing Auth Changes

### Adding a new OAuth provider

1. Configure in Supabase dashboard
2. Add button in `app/auth/sign-in.tsx`:
```typescript
const signInWithNewProvider = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'new-provider',
    options: {
      redirectTo: `${Linking.createURL('auth/callback')}`
    }
  });
};
```

### Changing TTL duration

Edit `lib/authLock.ts`:
```typescript
// Change from 4 hours to 8 hours
const AUTH_TTL_MS = 8 * 60 * 60 * 1000;
```

### Adding custom auth validation

Edit `AuthLockProvider.tsx` to add checks in the unlock flow.

---

## Security Considerations

1. **Never store raw passwords** - Supabase handles hashing
2. **JWT auto-refresh** - Prevents expired token errors
3. **Biometric fallback** - Always offer "Sign In Again" option
4. **Clear caches on logout** - Remove all AsyncStorage data
5. **Terms acceptance** - Check both local and server state

---

## Related Docs
- [02-providers.md](./02-providers.md) - Provider hierarchy
- [06-api.md](./06-api.md) - Authenticated API calls
