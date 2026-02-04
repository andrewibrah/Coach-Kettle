# Architecture Overview

> High-level system architecture and data flow patterns.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         EXPO APP                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    PROVIDER HIERARCHY                        ││
│  │  ThemeProvider → AuthProvider → ProfileProvider →            ││
│  │  PRCelebrationProvider → AuthLockProvider                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌───────────────┬───────────┴───────────┬───────────────┐      │
│  │   SCREENS     │      COMPONENTS       │    HOOKS      │      │
│  │  (app/)       │    (components/)      │   (hooks/)    │      │
│  └───────┬───────┴───────────┬───────────┴───────┬───────┘      │
│          │                   │                   │               │
│  ┌───────┴───────────────────┴───────────────────┴───────┐      │
│  │                    LIB (Business Logic)                │      │
│  │  api.ts │ structuredGate.ts │ workoutStorage.ts │ ... │      │
│  └───────────────────────────┬───────────────────────────┘      │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │    Auth    │  │  Database  │  │   Edge     │  │  Realtime  │  │
│  │  (OAuth)   │  │ (Postgres) │  │ Functions  │  │ (PR events)│  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Core Data Flow

### 1. User Input → Parsed Rows

```
User types: "Bench 185 x 8"
       │
       ▼
┌─────────────────────────┐
│   structuredGate.ts     │
│   (Local regex parser)  │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
 FAST PATH       AI PATH
 (regex match)   (complex input)
    │               │
    ▼               ▼
 LogRow[]        /chat or /parse
    │            Edge Function
    │               │
    └───────┬───────┘
            │
            ▼
    rows state updated
    (HomeScreen)
```

### 2. Workout Save Flow

```
User ends workout
       │
       ▼
┌─────────────────────────┐
│ buildWorkoutToSave()    │
│ (useWorkoutSession.ts)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ workoutStorage.ts       │
│ saveWorkout(session)    │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
 AsyncStorage    /history POST
 (immediate)     (background sync)
```

### 3. PR Detection Flow

```
Set logged with weight/reps
       │
       ▼
┌─────────────────────────┐
│ checkForPR()            │
│ (lib/prTracking.ts)     │
└───────────┬─────────────┘
            │
            ▼
   Calculate E1RM (Epley)
   Compare to current PR
            │
            ▼ (if new PR)
   Insert to pr_history table
            │
            ▼
┌─────────────────────────┐
│ Supabase Realtime       │
│ Channel listener        │
└───────────┬─────────────┘
            │
            ▼
   PRCelebration overlay
   (confetti animation)
```

---

## Key Files by Layer

### Screens (app/)
| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout, provider hierarchy |
| `app/(tabs)/index.tsx` | Main workout screen |
| `app/(tabs)/history.tsx` | Workout history list |
| `app/auth/sign-in.tsx` | Login screen |
| `app/settings/profile.tsx` | Edit profile |

### Components (components/)
| File | Purpose |
|------|---------|
| `AuthProvider.tsx` | Auth context & session |
| `ThemeProvider.tsx` | Theme context |
| `workout/WorkoutTable.tsx` | Workout row display |
| `modals/EditSetModal.tsx` | Edit set dialog |

### Hooks (hooks/)
| File | Purpose |
|------|---------|
| `useWorkoutSession.ts` | Session state management |
| `useRowActions.ts` | Row CRUD operations |
| `useCoachLogic.ts` | AI coach modal logic |

### Lib (lib/)
| File | Purpose |
|------|---------|
| `api.ts` | Supabase Edge Function client |
| `structuredGate.ts` | Input parsing logic |
| `workoutStorage.ts` | Local + cloud storage |
| `prTracking.ts` | PR detection logic |

---

## Architectural Decisions

### 1. Local-First Storage
**Why:** Ensures data isn't lost on network failures. Immediate UX feedback.
**How:** AsyncStorage for all workout data, background sync to Supabase.

### 2. Edge Functions for Mutations
**Why:** Security - no direct database access from client.
**How:** All writes go through authenticated Edge Functions.

### 3. Structured Gate Pattern
**Why:** Speed - most inputs can be parsed without AI round-trip.
**How:** Regex patterns first, AI fallback for complex queries.

### 4. Provider Hierarchy
**Why:** Clean dependency chain - auth before profile, profile before features.
**How:** Nested providers in `app/_layout.tsx`.

### 5. 4-Hour Session TTL
**Why:** Security with convenience - biometric unlock within TTL window.
**How:** `AuthLockProvider` tracks last auth timestamp.

---

## Module Dependencies

```
app/_layout.tsx
    └── ThemeProvider
        └── AuthProvider
            └── ProfileProvider
                └── PRCelebrationProvider
                    └── AuthLockProvider
                        └── Expo Router Stack

app/(tabs)/index.tsx
    ├── useWorkoutSession (hooks/)
    ├── useRowActions (hooks/)
    ├── useCoachLogic (hooks/)
    ├── structuredGate (lib/)
    ├── api (lib/)
    └── WorkoutTable, Modals (components/)
```

---

## Related Docs
- [02-providers.md](./02-providers.md) - Provider hierarchy details
- [03-workout-flow.md](./03-workout-flow.md) - Main workout flow
- [06-api.md](./06-api.md) - API layer details
