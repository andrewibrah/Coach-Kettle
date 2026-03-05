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
│  │  mediaUpload.ts │ workoutDraft.ts                      │      │
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
│  ┌────────────┐                                                   │
│  │  Storage   │                                                   │
│  │ (Media)    │                                                   │
│  └────────────┘                                                   │
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

### 4. Media Upload Flow

```
User picks photo/video
       │
       ▼
┌─────────────────────────┐
│ pickMedia()             │
│ (expo-image-picker)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ uploadMediaToStorage()  │
│ (lib/mediaUpload.ts)    │
│ → Supabase Storage      │
│   (private bucket)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ recordMediaInDb()       │
│ → workout_media table   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ getMediaSignedUrls()    │
│ (1hr TTL signed URLs)   │
└─────────────────────────┘
```

### 5. Session Review Flow

```
User ends workout
       │
       ▼
┌─────────────────────────┐
│ generateSessionReview() │
│ (AI rating 1-10)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ SessionReviewModal      │
│ ├─ AI review display    │
│ ├─ MediaPickerBubble    │
│ │   (photo/video)       │
│ └─ ReflectionInput      │
│     (user notes)        │
└───────────┬─────────────┘
            │
            ▼
   Save to Supabase:
   ├─ review_json (AI rating)
   ├─ reflection (user text)
   └─ media → Storage bucket
```

---

## Key Files by Layer

### Screens (app/)
| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout, provider hierarchy |
| `app/(tabs)/index.tsx` | Main workout screen |
| `app/(tabs)/history.tsx` | Workout history list |
| `app/history/[id].tsx` | History detail with review/media/reflection |
| `app/auth/sign-in.tsx` | Login screen |
| `app/settings/profile.tsx` | Edit profile |

### Components (components/)
| File | Purpose |
|------|---------|
| `AuthProvider.tsx` | Auth context & session |
| `ThemeProvider.tsx` | Theme context |
| `workout/WorkoutTable.tsx` | Workout row display |
| `modals/EditSetModal.tsx` | Edit set dialog |
| `modals/SessionReviewModal.tsx` | Post-workout review with rating/reflection |
| `media/MediaPickerBubble.tsx` | Media picker UI for photos/videos |
| `media/ReflectionInput.tsx` | User reflection text input |

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
| `mediaUpload.ts` | Media upload pipeline (pick, upload, record, sign) |
| `workoutDraft.ts` | Draft persistence for in-progress sessions |

### Plugins (plugins/)
| File | Purpose |
|------|---------|
| `plugins/withImagePicker.js` | iOS/Android media permissions config plugin |

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

### 6. Media via Supabase Storage
**Why:** Private media storage with access control. Users can attach photos/videos to workout sessions for form checks and progress tracking.
**How:** Private Supabase Storage bucket with user-scoped paths (`{user_id}/{workout_id}/{filename}`). Media is never publicly accessible -- all access goes through signed URLs with a 1-hour TTL. The `workout_media` table records metadata (file path, type, size) linked to the workout session. Upload and URL signing are handled by `lib/mediaUpload.ts`.

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

components/modals/SessionReviewModal.tsx
    ├── mediaUpload (lib/)
    ├── MediaPickerBubble (components/media/)
    └── ReflectionInput (components/media/)

app/history/[id].tsx
    ├── mediaUpload (lib/)
    ├── api (lib/)
    └── workoutStorage (lib/)
```

---

## Related Docs
- [02-providers.md](./02-providers.md) - Provider hierarchy details
- [03-workout-flow.md](./03-workout-flow.md) - Main workout flow
- [06-api.md](./06-api.md) - API layer details
- [16-media-reflection.md](./16-media-reflection.md) - Media upload & reflection system
