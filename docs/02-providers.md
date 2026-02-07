# Providers

## Hierarchy
```
app/_layout.tsx
└── ThemeProvider         → useTheme()
    └── AuthProvider      → useAuth()
        └── ProfileProvider   → useProfile()
            └── PRCelebrationProvider → usePRCelebration()
                └── AuthLockProvider  → useAuthLock()
                    └── Stack (screens)
```

## Each Provider

### ThemeProvider
```typescript
// components/ThemeProvider.tsx
const { theme, setTheme } = useTheme();  // 'light' | 'dark' | 'system'
```
Persists to AsyncStorage.

### AuthProvider
```typescript
// components/AuthProvider.tsx
const { session, user, signOut, loading } = useAuth();
```
Listens to `supabase.auth.onAuthStateChange()`.

### ProfileProvider
```typescript
// contexts/ProfileContext.tsx
const {
  profile,           // UserProfile | null
  isOnboardingComplete,
  updateProfile,
  refreshProfile
} = useProfile();
```

### PRCelebrationProvider
```typescript
// contexts/PRCelebrationContext.tsx
const { showCelebration } = usePRCelebration();
showCelebration({ exercise: 'Bench', e1rm: 225 });
```

### AuthLockProvider
```typescript
// components/AuthLockProvider.tsx
const {
  isLocked,
  unlock,
  needsTermsAcceptance
} = useAuthLock();
```

## Tab Layout Redirect Logic
```typescript
// app/(tabs)/_layout.tsx
if (loading) return <Spinner />;
if (!session) return <Redirect href="/auth/sign-in" />;
if (isLocked) return <LockScreen />;
if (needsTerms) return <Redirect href="/terms-of-service" />;
if (!isOnboardingComplete) return <Redirect href="/onboarding" />;
return <Tabs />;
```
