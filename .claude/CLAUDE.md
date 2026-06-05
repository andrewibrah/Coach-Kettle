# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Coach Kettle** — Expo SDK 55 / React Native 0.83.6 workout tracker (iOS-first) with a Supabase backend. Users log sets via natural language ("Bench 185 x 8") parsed locally (regex) or via AI fallback.

**Phase 1 expansion (v1.0.1+):** the app now also covers nutrition logging + AI weekly meal plans, a daily honest-feedback coach with a 4-level harshness state machine, a multi-week personalized programming engine with periodization and next-set suggestions, body-metrics + photos + resting-HR progress tracking, an exercise library, and a notifications system (rest-timer, workout reminders, daily report, etc.). See `.claude/overview/17-nutrition.md`, `18-coaching.md`, `19-programming.md`, `20-progress.md`, `21-notifications.md`.

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
ThemeProvider → AuthProvider → ProfileProvider → EntitlementProvider →
OnboardingProvider → PRCelebrationProvider → AuthLockProvider →
NotificationsProvider → NutritionProvider → CoachingProvider → ProgramProvider →
RestTimerProvider → GestureHandlerRootView → NavigationThemeProvider → Expo Router Stack
```

Order matters — auth before profile, entitlement before onboarding, features last.
Notifications come right after the auth-lock layer so push token bootstrap happens once the user is reachable; nutrition / coaching / program contexts come next so screens can mount them. RestTimerProvider is innermost so the chip + the workout-screen trigger share one timer instance.
All providers live in `contexts/` (not `components/`).

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
| `tutorial_shown_v1` | Whether tutorial carousel has been dismissed |

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
| Auth | `contexts/AuthProvider.tsx`, `lib/auth.ts`, `lib/authLock.ts` |
| All providers | `contexts/` (AuthProvider, AuthLockProvider, ThemeProvider, ProfileContext, EntitlementContext, OnboardingContext, PRCelebrationContext, NotificationsProvider, NutritionContext, CoachingContext, ProgramContext, RestTimerContext) |
| Workout state | `hooks/useWorkoutSession.ts`, `hooks/useRowActions.ts` |
| Local storage | `lib/workoutStorage.ts` |
| Draft persistence | `lib/workoutDraft.ts` |
| PR detection | `lib/prTracking.ts` |
| Media upload | `lib/mediaUpload.ts` |
| Tutorial | `components/tutorial/TutorialModal.tsx`, `lib/tutorialState.ts` |
| Shared helpers | `lib/workoutRules.ts` — date utils, `makeId()`, set-number helpers |
| IAP client | `lib/iap.ts` |
| RevenueCat config | `constants/revenuecat.ts` |
| Edge Functions | `supabase/functions/` |
| DB migrations | `supabase/migrations/` |
| Nutrition | `lib/nutrition.ts`, `contexts/NutritionContext.tsx`, `app/nutrition/*` |
| Coaching | `lib/coaching.ts`, `contexts/CoachingContext.tsx`, `app/coach/*` |
| Programming | `lib/programming.ts`, `contexts/ProgramContext.tsx`, `app/program/*` |
| Progress | `lib/bodyMetrics.ts`, `app/progress/*` |
| Exercise library | `lib/exerciseLibrary.ts`, `app/exercise-library/*` |
| Notifications | `lib/notifications.ts`, `contexts/NotificationsProvider.tsx`, `hooks/useRestTimer.ts`, `app/settings/notifications.tsx` |
| Rest timer | `lib/restTimer.ts`, `contexts/RestTimerContext.tsx`, `hooks/useRestTimer.ts`, `components/workout/RestTimerBar.tsx` |
| Next-set suggestion | `components/workout/NextSetSuggestion.tsx`, `lib/programming.ts:fetchNextSetSuggestion`, RPC `suggest_next_set` |

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
| `/food-log` | Food log CRUD + daily totals + search |
| `/nutrition-targets` | Get / derive (BMR→TDEE) / override |
| `/meal-plan` | Weekly meal plan fetch / generate / recalibrate |
| `/exercise-library` | Canonical exercise catalog (read-only) |
| `/body-metrics` | Body metrics + body photos (private bucket) |
| `/resting-hr` | Resting HR log + RPC-backed summary |
| `/programming` | Multi-week program generation + week query + advance |
| `/next-set` | Per-exercise next-set suggestion (calls `suggest_next_set` RPC) |
| `/daily-feedback` | Daily honest feedback + harshness state machine |
| `/default-templates` | Goal-based default workout-template seeder |
| `/notifications` | Push token registry + per-user prefs + send helpers |

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

## Phase 1 expansion deploy checklist (1.0.1+)

1. `npm install` — picks up the new `expo-notifications` dep.
2. `npx expo prebuild --clean` (or rebuild the dev client via EAS) — required for `expo-notifications` native module.
3. `supabase db push` — applies migrations `0031` → `0040`.
4. `supabase functions deploy food-log nutrition-targets meal-plan exercise-library body-metrics resting-hr programming next-set daily-feedback default-templates notifications`.
5. (Optional) Set `OPENAI_API_KEY` env on the `meal-plan` function for AI-generated weekly plans. Falls back to a deterministic skeleton plan if absent.
6. Reload the app — new tabs auto-populate via the providers wired into `app/_layout.tsx`.

## GitNexus — Code Intelligence (MANDATORY)

This project is indexed by GitNexus as **WorkoutTracker** (4513 symbols, 7617 relationships, 224 execution flows). The MCP server is registered and live — use it for **every** code task.

### Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, call `impact({target: "symbolName", direction: "upstream"})` and report the blast radius to the user.
- **MUST run `detect_changes()` before committing** to verify changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping.
- When you need full context on a symbol (callers, callees, process participation), use `context({name: "symbolName"})`.

### Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit without running `detect_changes()`.

### Tools Reference

| Tool | Use for |
|------|---------|
| `list_repos` | Confirm WorkoutTracker is indexed |
| `query` | Find execution flows by concept |
| `context` | 360° view of a symbol (callers, callees, processes) |
| `impact` | Blast radius before editing |
| `detect_changes` | Pre-commit scope check |
| `rename` | Safe multi-file rename |
| `cypher` | Raw graph queries |

### Skills

Skill files in `.claude/skills/gitnexus/` cover: exploring, impact-analysis, debugging, refactoring, CLI, and guide.

| Task | Skill |
|------|-------|
| Understand architecture / "How does X work?" | `gitnexus-exploring` |
| Blast radius / "What breaks if I change X?" | `gitnexus-impact-analysis` |
| Trace bugs / "Why is X failing?" | `gitnexus-debugging` |
| Rename / extract / refactor | `gitnexus-refactoring` |

> If any tool warns the index is stale, run `npx gitnexus analyze` first.

## Vibe

Fast. Minimal. Gym-friendly. PRs get confetti.
