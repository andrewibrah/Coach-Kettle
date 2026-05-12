# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Coach Kettle** — Expo/React Native workout tracker (iOS-first) with a Supabase backend. Users log sets via natural language ("Bench 185 x 8") parsed locally (regex) or via AI fallback.

## Warnings

AI coding agents optimize for fluent output, not system truth:
1. AI will confidently fabricate logic, APIs, and edge-case behavior—verify all output.
2. Generated code often silently fails under real load, concurrency, or malformed input.
3. Security assumptions are naïve by default—assume missing auth, validation, and threat modeling.
4. AI optimizes for plausibility, not correctness—"looks right" is a red flag.
5. Subtle bugs hide in glue code, state transitions, and error handling.

## Commands

```bash
# Start dev server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Lint
npx expo lint

# Deploy a single Edge Function (user runs manually)
supabase functions deploy <function-name>

# Deploy all Edge Functions
supabase functions deploy

# Apply DB migrations (user runs manually)
supabase db push

# Serve a function locally for testing
supabase functions serve <function-name> --env-file .env.local
```

## Architecture

### Provider Hierarchy (`app/_layout.tsx`)

```
ThemeProvider → AuthProvider → ProfileProvider →
PRCelebrationProvider → AuthLockProvider → GestureHandlerRootView →
NavigationThemeProvider → Expo Router Stack
```

Order matters — auth before profile, profile before features.

### Core Data Flow

```
User Input → structuredGate.ts → regex match? → LogRow[]
                               → no match? → /chat API → LogRow[]
                                      ↓
                              AsyncStorage (immediate) + Supabase (background)
```

**Structured Gate decisions** (`lib/structuredGate.ts`):
- `fast` — regex matched, rows returned directly
- `ai` — send to `/chat` Edge Function
- `end_workout` — trigger end-workout flow
- `fill_skeleton` — fill a template placeholder row

### Storage (Local-First)

All writes go to AsyncStorage immediately; Supabase sync is background/best-effort. On sign-out, `clearAllCaches()` in `AuthProvider` wipes all keys.

**Key AsyncStorage keys:**
| Key | Purpose |
|-----|---------|
| `workout_history_v1` | Saved workouts |
| `chat_history_v1` | Chat messages |
| `workout_draft_v1` | In-progress draft (same-day restore on relaunch) |
| `onboarding_draft_v1` | Onboarding answer backup |
| `last_authenticated_at` | Auth TTL timestamp |
| `biometric_enabled` | Biometric preference |
| `terms_accepted` | ToS flag |

### Pending Edit Pattern

Inline cell editing is "pending" until committed. Call `commitPendingAndGet()` before any mutation that reads rows to prevent race conditions.

### PR Detection

Logged sets → `checkForPR()` → E1RM (Epley) → compare to PR → insert to `pr_history` → Supabase Realtime → `PRCelebrationProvider` → confetti overlay.

### Session Lock

4-hour TTL in `lib/authLock.ts`. After idle timeout → `LockScreen` → biometric unlock (Face ID / Touch ID). Change TTL: edit `AUTH_TTL_MS` in `lib/authLock.ts`.

### Subscription / IAP

Uses **RevenueCat SDK** (`react-native-purchases`). Config in `constants/revenuecat.ts`:
- Entitlement: `"Coach Kettle Pro"`
- iOS API key: `REVENUECAT.API_KEY`
- Plans: `yearly`, `monthly`

Entitlement checks go through the `/entitlements` Edge Function or the `entitlements` Edge Function; never check subscription state directly from RevenueCat on the server.

### Media Upload

Handled by `lib/mediaUpload.ts` → Supabase Storage (private bucket, user-scoped paths `{userId}/{workoutId}/{uuid}.{ext}`). All access via 1-hour signed URLs. Max 10 files per workout, 50 MB each. Types: JPEG, PNG, HEIC, WebP, MP4, MOV.

## Key Files

| Area | Files |
|------|-------|
| Main screen | `app/(tabs)/index.tsx` |
| Root layout / providers | `app/_layout.tsx` |
| Input parsing | `lib/structuredGate.ts` |
| API client | `lib/api.ts` |
| Auth | `components/AuthProvider.tsx`, `lib/auth.ts`, `lib/authLock.ts` |
| Workout state | `hooks/useWorkoutSession.ts`, `hooks/useRowActions.ts` |
| Local storage | `lib/workoutStorage.ts` |
| Draft persistence | `lib/workoutDraft.ts` |
| PR detection | `lib/prTracking.ts` |
| Media upload | `lib/mediaUpload.ts` |
| RevenueCat config | `constants/revenuecat.ts` |
| Edge Functions | `supabase/functions/` |
| DB migrations | `supabase/migrations/` |

## Edge Functions

| Endpoint | Purpose |
|----------|---------|
| `/chat` | Parse workout + AI fallback |
| `/coach` | Streaming AI Q&A |
| `/parse` | Fast workout parsing |
| `/history` | Workout CRUD (POST also inserts `workout_log` rows → triggers PR detection) |
| `/log-set` | Log individual set |
| `/profile` | User profile CRUD |
| `/pr-tracking` | PR tracked lifts |
| `/workout-templates` | Templates CRUD |
| `/terms-acceptance` | ToS status |
| `/chat-history` | Chat messages |
| `/chats` | Chat sessions |
| `/entitlements` | Subscription entitlement checks |
| `/iap` | In-app purchase processing |
| `/observability` | Analytics events |
| `/health` | Health check |

All functions: Deno runtime, CORS preflight on `OPTIONS`, authenticated via JWT in `Authorization` header, scoped to `user_id`.

**Adding a new function:**
1. `mkdir supabase/functions/my-function && touch supabase/functions/my-function/index.ts`
2. Follow the standard template in `.claude/overview/15-edge-functions.md`
3. Add a corresponding `lib/api.ts` export
4. User deploys: `supabase functions deploy my-function`

## Key Types

```typescript
// types/workout.ts
type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
  // Cardio fields
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
}

// lib/workoutStorage.ts
interface WorkoutSession {
  id: string;
  dateISO: string;       // "2024-01-15"
  title: string;
  part: BodyPart;
  rows: WorkoutRow[];
  createdAt: number;
  review?: SessionReview;     // AI rating 1-10 + strengths/weakness
  reflection?: string;        // User notes (max 2000 chars)
  media?: WorkoutMediaRecord[];
}

type BodyPart = "Push" | "Pull" | "Legs" | "Chest" | "Back" | ...
```

## Parsing Patterns

| Input | Result |
|-------|--------|
| `Bench 185 x 8` | Single set |
| `Bench 185 3x8` | Multi-set (3 rows) |
| `185 x 8` | Shorthand — uses last exercise |
| `185, 165, 145 x 8` | Drop set (3 rows) |
| `Bench 185 + Rows 135 x 8` | Superset (2 rows) |
| `Run 30 min 3 miles` | Cardio with duration + distance |
| `Bench 60kg x 8` | Auto kg→lbs conversion |
| `Warmup bench 95 x 10` | Warmup note |

Cardio metric parsing is order-independent.

## Rules

- `@/` path aliases only (configured in `tsconfig.json`)
- `useThemeColor()` for all colors — no hardcoded hex values
- Mutations via Edge Functions only — never direct Supabase DB access from client
- Call `commitPendingAndGet()` before any mutation that reads rows (inline editing guard)
- When adding a new AsyncStorage key, also add it to `clearAllCaches()` in `AuthProvider`

## Docs

Deep-dive docs live in `.claude/overview/` (also mirrored in `docs/`):
- `00-architecture.md` — System diagram + data flows
- `01-auth.md` — Auth flow, TTL, biometrics
- `02-providers.md` — Provider hierarchy details
- `03-workout-flow.md` — Workout lifecycle
- `04-parsing.md` — structuredGate internals
- `05-storage.md` — Storage keys + sync strategy
- `06-api.md` — API layer patterns
- `15-edge-functions.md` — Edge Function template + patterns
- `16-media-reflection.md` — Media upload + reflection system

## Workflow Notes

- Prepare all code changes, migrations, and Edge Function code
- User runs `supabase db push` and `supabase functions deploy` manually
- User reloads the app manually after deploys
- Use subagents for parallel work when appropriate

## Vibe

Fast. Minimal. Gym-friendly. PRs get confetti.
