# Architecture

## Stack
- **Frontend**: Expo (React Native) + TypeScript
- **Backend**: Supabase (Auth, Postgres, Edge Functions, Realtime)
- **Storage**: AsyncStorage (local-first) + Supabase (sync)

## Provider Hierarchy
```
ThemeProvider → AuthProvider → ProfileProvider → PRCelebrationProvider → AuthLockProvider
```

## Data Flow

### Input → Rows
```
"Bench 185 x 8" → structuredGate.ts → regex match? → LogRow[]
                                    → no match? → /chat API → LogRow[]
```

### Save Workout
```
End workout → buildWorkoutToSave() → AsyncStorage (immediate)
                                   → /history POST (background)
```

### PR Detection
```
Set logged → checkForPR() → E1RM calc → new PR? → Supabase Realtime → confetti
```

## Key Files

| Layer | Files |
|-------|-------|
| Screens | `app/(tabs)/index.tsx`, `app/auth/sign-in.tsx` |
| Components | `components/workout/WorkoutTable.tsx`, `components/modals/*` |
| Hooks | `hooks/useWorkoutSession.ts`, `hooks/useRowActions.ts` |
| Lib | `lib/api.ts`, `lib/structuredGate.ts`, `lib/workoutStorage.ts` |

## Design Decisions

| Decision | Why |
|----------|-----|
| Local-first storage | No data loss on network failure |
| Edge Functions only | Security - no direct DB access |
| Regex before AI | Speed - 90% parsed locally |
| 4-hour session TTL | Security + convenience balance |
