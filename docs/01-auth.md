# Authentication

## Files
| File | Purpose |
|------|---------|
| `lib/supabase.ts` | Supabase client init |
| `lib/auth.ts` | JWT helpers, `getAuthHeaders()`, `fetchWithAuth()` |
| `lib/authLock.ts` | 4-hour TTL, biometric toggle |
| `lib/biometrics.ts` | Face ID / Touch ID |
| `components/AuthProvider.tsx` | Auth context, session state |
| `components/AuthLockProvider.tsx` | Lock screen logic |

## Auth Flow
```
App launch → AuthProvider checks session → valid? → check TTL lock
                                        → expired? → /auth/sign-in

Sign in → Supabase auth → session stored → setLastAuthenticatedAt()
```

## Session Lock (4-hour TTL)
```typescript
// lib/authLock.ts
AUTH_TTL_MS = 4 * 60 * 60 * 1000  // 4 hours

isSessionExpired(lastAuth) → Date.now() - lastAuth > AUTH_TTL_MS
```

After 4 hours idle → LockScreen shown → biometric unlock → `setLastAuthenticatedAt()`

## Key Functions

```typescript
// lib/auth.ts
getAuthHeaders()      // Returns { Authorization: Bearer <jwt>, apikey }
fetchWithAuth(url, opts)  // Auto-retry on 401

// lib/authLock.ts
isSessionExpired()    // Check if 4hr TTL exceeded
setLastAuthenticatedAt()  // Reset TTL timer
getBiometricEnabled() // User preference

// lib/biometrics.ts
authenticateWithBiometrics(reason)  // Prompt Face ID / Touch ID
```

## useAuth Hook
```typescript
const { session, user, signOut, loading } = useAuth();
```

## Adding Auth to a Screen
```typescript
import { useAuth } from '@/components/AuthProvider';

function MyScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/auth/sign-in" />;
  // ... screen content
}
```
