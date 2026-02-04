# Coach Kettle - Developer Docs

> Find your area → Read the doc → Implement

---

## Doc Index

| Area | Doc | Key Files |
|------|-----|-----------|
| **Architecture** | [00-architecture](./00-architecture.md) | `app/_layout.tsx` |
| **Auth & Sessions** | [01-auth](./01-auth.md) | `lib/auth.ts`, `lib/authLock.ts`, `components/AuthProvider.tsx` |
| **Providers** | [02-providers](./02-providers.md) | `components/*Provider.tsx`, `contexts/` |
| **Workout Flow** | [03-workout-flow](./03-workout-flow.md) | `app/(tabs)/index.tsx`, `hooks/useWorkoutSession.ts` |
| **Input Parsing** | [04-parsing](./04-parsing.md) | `lib/structuredGate.ts` |
| **Storage** | [05-storage](./05-storage.md) | `lib/workoutStorage.ts` |
| **API Layer** | [06-api](./06-api.md) | `lib/api.ts` |
| **Components** | [07-components](./07-components.md) | `components/ui/`, `components/workout/` |
| **Hooks** | [08-hooks](./08-hooks.md) | `hooks/` |
| **Modals** | [09-modals](./09-modals.md) | `components/modals/` |
| **Onboarding** | [10-onboarding](./10-onboarding.md) | `app/onboarding/`, `components/onboarding/` |
| **Settings** | [11-settings](./11-settings.md) | `app/settings/` |
| **PR Tracking** | [12-pr-tracking](./12-pr-tracking.md) | `lib/prTracking.ts`, `components/celebration/` |
| **Templates** | [13-templates](./13-templates.md) | `lib/profile.ts` (template functions) |
| **Theming** | [14-theming](./14-theming.md) | `constants/theme.ts`, `hooks/use-theme-color.ts` |
| **Edge Functions** | [15-edge-functions](./15-edge-functions.md) | `supabase/functions/` |

---

## File Structure

```
WorkoutTracker/
├── app/                    # Screens (Expo Router file-based routing)
│   ├── (tabs)/            # Main tabs: index.tsx (workout), history.tsx
│   ├── auth/              # sign-in, sign-up, forgot-password, callback
│   ├── onboarding/        # 10-step user setup flow
│   ├── settings/          # profile, pr-tracking, templates
│   └── _layout.tsx        # Root layout with provider hierarchy
├── components/
│   ├── ui/                # Header, ThemedText, ThemedView, etc.
│   ├── workout/           # WorkoutTable, WorkoutCard, WorkoutBottomBar
│   ├── modals/            # EditSetModal, CoachModal, MenuModal, etc.
│   ├── onboarding/        # Quiz components
│   └── *Provider.tsx      # Auth, Theme, AuthLock providers
├── hooks/                 # useWorkoutSession, useRowActions, useCoachLogic, etc.
├── contexts/              # ProfileContext, PRCelebrationContext
├── lib/                   # Business logic
│   ├── api.ts            # Edge Function client
│   ├── structuredGate.ts # Input parsing (regex → AI fallback)
│   ├── workoutStorage.ts # AsyncStorage + sync
│   ├── prTracking.ts     # PR detection
│   └── auth.ts           # JWT handling
├── types/workout.ts       # LogRow, WorkoutSession, BodyPart
├── constants/theme.ts     # Colors
└── supabase/functions/    # Backend Edge Functions
```

---

## Core Patterns

### Provider Hierarchy
```
ThemeProvider → AuthProvider → ProfileProvider → PRCelebrationProvider → AuthLockProvider
```

### Data Flow
```
User Input → structuredGate.ts (regex) → Fast parse OR AI fallback
                    ↓
              LogRow added to state
                    ↓
         AsyncStorage (immediate) + Supabase (async)
```

### Key Types
```typescript
type LogRow = { id, exercise, set, weightLbs, reps, notes, timestamp, status? }
type WorkoutSession = { id, dateISO, part, rows, createdAt, review? }
type BodyPart = "Push" | "Pull" | "Legs" | "Chest" | "Back" | ...
```

---

## Commands

```bash
npm install           # Install
npx expo start        # Dev (i=iOS, a=Android, w=web)
npm run lint          # Lint
npx expo start --clear # Clear cache
```

---

## Rules

| Rule | Why |
|------|-----|
| Use `@/` imports | Path aliases configured in tsconfig |
| Use `useThemeColor()` | Supports light/dark mode |
| Mutations via Edge Functions | Never direct DB access from client |
| `commitPendingAndGet()` before API calls | Inline editing requires commit first |
| No hardcoded colors | Theme consistency |

---

## Quick Answers

**Where's the main workout screen?** `app/(tabs)/index.tsx`

**Where's input parsing?** `lib/structuredGate.ts`

**Where are API calls made?** `lib/api.ts`

**Where's auth handled?** `components/AuthProvider.tsx` + `lib/auth.ts`

**Where are PRs detected?** `lib/prTracking.ts`

**Where are workouts saved?** `lib/workoutStorage.ts` (local) + `lib/api.ts` (remote)
