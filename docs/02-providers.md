# Provider Hierarchy

> The context providers that power the app, from outermost to innermost.

---

## Provider Stack

```
ThemeProvider          ─── Theme preferences (light/dark/system)
    │
    ▼
AuthProvider           ─── Supabase auth session
    │
    ▼
ProfileProvider        ─── User profile & onboarding state
    │
    ▼
PRCelebrationProvider  ─── PR celebration queue & overlay
    │
    ▼
AuthLockProvider       ─── Session TTL & biometric lock
    │
    ▼
GestureHandlerRootView ─── Gesture support for swipe actions
    │
    ▼
NavigationThemeProvider ─── React Navigation theming
    │
    ▼
Stack (Expo Router)    ─── Screen navigation
```

**Location:** `app/_layout.tsx`

---

## Each Provider Explained

### 1. ThemeProvider

**Location:** `components/ThemeProvider.tsx`

**Purpose:** Manages light/dark/system theme preference.

**Context Values:**
```typescript
interface ThemeContextValue {
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';  // Resolved value
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}
```

**Storage:** Persists to AsyncStorage under key `theme_preference`

**Usage:**
```typescript
import { useTheme } from '@/components/ThemeProvider';

function MyComponent() {
  const { theme, effectiveTheme, setTheme } = useTheme();

  return (
    <TouchableOpacity onPress={() => setTheme('dark')}>
      <Text>Current: {effectiveTheme}</Text>
    </TouchableOpacity>
  );
}
```

---

### 2. AuthProvider

**Location:** `components/AuthProvider.tsx`

**Purpose:** Manages Supabase authentication state.

**Context Values:**
```typescript
interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  clearAllCaches: () => Promise<void>;
}
```

**What it does:**
- Subscribes to `supabase.auth.onAuthStateChange`
- Provides session to child components
- Clears local data on sign out

**Usage:**
```typescript
import { useAuth } from '@/components/AuthProvider';

function MyComponent() {
  const { session, loading, signOut } = useAuth();

  if (loading) return <ActivityIndicator />;
  if (!session) return <Redirect href="/auth/sign-in" />;

  return <Button onPress={signOut} title="Sign Out" />;
}
```

---

### 3. ProfileProvider

**Location:** `contexts/ProfileContext.tsx`

**Purpose:** Manages user profile data and onboarding state.

**Context Values:**
```typescript
interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  isOnboardingComplete: boolean;
  currentOnboardingStep: number;
}
```

**Depends on:** AuthProvider (needs session.user.id)

**Usage:**
```typescript
import { useProfile } from '@/contexts/ProfileContext';

function MyComponent() {
  const { profile, isOnboardingComplete, updateProfile } = useProfile();

  if (!isOnboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return <Text>Welcome, your goal is {profile?.focus}</Text>;
}
```

---

### 4. PRCelebrationProvider

**Location:** `contexts/PRCelebrationContext.tsx`

**Purpose:** Manages PR celebration queue and displays animated overlay.

**Context Values:**
```typescript
interface PRCelebrationContextValue {
  showCelebration: (pr: PRBreakthrough) => void;
  currentCelebration: PRBreakthrough | null;
  dismissCelebration: () => void;
}
```

**What it does:**
- Queues PR breakthroughs
- Displays one celebration at a time
- Auto-dismisses after animation

**Usage:**
```typescript
import { usePRCelebration } from '@/contexts/PRCelebrationContext';

function WorkoutScreen() {
  const { showCelebration } = usePRCelebration();

  // When PR detected:
  showCelebration({
    exercise: 'Bench Press',
    newE1rm: 225,
    previousE1rm: 215,
    improvement: 10
  });
}
```

---

### 5. AuthLockProvider

**Location:** `components/AuthLockProvider.tsx`

**Purpose:** Manages 4-hour session TTL and biometric unlock.

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

**Depends on:** AuthProvider (needs session for lock logic)

**Usage:**
```typescript
import { useAuthLock } from '@/components/AuthLockProvider';

function TabLayout() {
  const { isLocked, termsAccepted } = useAuthLock();

  if (isLocked) return <LockScreen />;
  if (!termsAccepted) return <Redirect href="/terms-of-service" />;

  return <Tabs />;
}
```

---

## Tab Layout Redirect Logic

**Location:** `app/(tabs)/_layout.tsx`

The tab layout orchestrates the redirect flow:

```typescript
function TabLayout() {
  const { session, loading: authLoading } = useAuth();
  const { isLocked, termsAccepted } = useAuthLock();
  const { isOnboardingComplete, loading: profileLoading } = useProfile();

  // 1. Loading state
  if (authLoading || profileLoading) {
    return <LoadingScreen />;
  }

  // 2. No session → sign in
  if (!session) {
    return <Redirect href="/auth/sign-in" />;
  }

  // 3. Session expired → lock screen
  if (isLocked) {
    return <LockScreen />;
  }

  // 4. Terms not accepted → ToS
  if (!termsAccepted) {
    return <Redirect href="/terms-of-service" />;
  }

  // 5. Onboarding incomplete → onboarding
  if (!isOnboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  // 6. All good → show tabs
  return <Tabs />;
}
```

---

## Adding a New Provider

1. Create the context file:
```typescript
// contexts/MyNewContext.tsx
import { createContext, useContext, useState } from 'react';

interface MyNewContextValue {
  value: string;
  setValue: (v: string) => void;
}

const MyNewContext = createContext<MyNewContextValue | null>(null);

export function MyNewProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState('');

  return (
    <MyNewContext.Provider value={{ value, setValue }}>
      {children}
    </MyNewContext.Provider>
  );
}

export function useMyNew() {
  const ctx = useContext(MyNewContext);
  if (!ctx) throw new Error('useMyNew must be within MyNewProvider');
  return ctx;
}
```

2. Add to provider stack in `app/_layout.tsx`:
```typescript
<ThemeProvider>
  <AuthProvider>
    <ProfileProvider>
      <MyNewProvider>  {/* Add here */}
        <PRCelebrationProvider>
          ...
        </PRCelebrationProvider>
      </MyNewProvider>
    </ProfileProvider>
  </AuthProvider>
</ThemeProvider>
```

---

## Context Dependencies Diagram

```
ThemeProvider (standalone)
        │
        ▼
AuthProvider (needs: nothing)
        │
        ├────────────────────────┐
        ▼                        ▼
ProfileProvider           AuthLockProvider
(needs: session)          (needs: session)
        │
        ▼
PRCelebrationProvider
(needs: nothing, but used by screens that need profile)
```

---

## Related Docs
- [01-auth.md](./01-auth.md) - Authentication details
- [14-theming.md](./14-theming.md) - Theme system
- [12-pr-tracking.md](./12-pr-tracking.md) - PR celebration
