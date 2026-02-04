# Coach Kettle - Developer Documentation

> The anatomy and physiology of the WorkoutTracker app.
> Find exactly what you need, understand how it works, then go implement.

## Quick Navigation

| I need to work on... | Read this |
|---------------------|-----------|
| App architecture & data flow | [00-architecture.md](./00-architecture.md) |
| Auth, sessions, or login | [01-auth.md](./01-auth.md) |
| Provider hierarchy or context | [02-providers.md](./02-providers.md) |
| Main workout logging flow | [03-workout-flow.md](./03-workout-flow.md) |
| Input parsing (NLP/regex) | [04-parsing.md](./04-parsing.md) |
| Data storage (local/cloud) | [05-storage.md](./05-storage.md) |
| API calls & Edge Functions | [06-api.md](./06-api.md) |
| UI components | [07-components.md](./07-components.md) |
| Custom hooks | [08-hooks.md](./08-hooks.md) |
| Modal dialogs | [09-modals.md](./09-modals.md) |
| User onboarding | [10-onboarding.md](./10-onboarding.md) |
| Settings screens | [11-settings.md](./11-settings.md) |
| PR tracking & celebrations | [12-pr-tracking.md](./12-pr-tracking.md) |
| Workout templates | [13-templates.md](./13-templates.md) |
| Theming (light/dark) | [14-theming.md](./14-theming.md) |
| Supabase Edge Functions | [15-edge-functions.md](./15-edge-functions.md) |

---

## Project Overview

**Coach Kettle** is an Expo/React Native workout tracking app with Supabase backend. Users log exercises via natural language input (e.g., "Bench 185 x 8") which is parsed locally via regex or via AI for complex input.

**Platforms:** iOS, Android, Web

**Tech Stack:**
- Frontend: Expo (React Native) with TypeScript
- Routing: Expo Router (file-based)
- Backend: Supabase (Auth, Database, Edge Functions, Realtime)
- Storage: AsyncStorage (local-first) + Supabase (sync)

---

## File Structure At-a-Glance

```
WorkoutTracker/
├── app/                    # Screens (Expo Router)
│   ├── (tabs)/            # Main tab screens
│   ├── auth/              # Auth screens
│   ├── onboarding/        # Onboarding flow
│   ├── settings/          # Settings screens
│   └── history/[id].tsx   # Dynamic routes
├── components/            # UI Components
│   ├── ui/               # Generic UI
│   ├── workout/          # Workout-specific
│   ├── modals/           # Modal dialogs
│   └── onboarding/       # Onboarding UI
├── hooks/                 # Custom React hooks
├── contexts/              # Context providers
├── lib/                   # Business logic & utilities
├── types/                 # TypeScript definitions
├── constants/             # Theme & config
└── supabase/functions/    # Edge Functions
```

---

## Common Commands

```bash
npm install          # Install dependencies
npx expo start       # Start dev server
npm run lint         # Run ESLint
```

---

## Key Patterns to Know

1. **Local-First Storage** - Data saves to AsyncStorage immediately, syncs to Supabase async
2. **Structured Gate** - Fast regex parsing before AI fallback (`lib/structuredGate.ts`)
3. **Provider Hierarchy** - Theme → Auth → Profile → PRCelebration → AuthLock
4. **Edge Functions Only** - All mutations go through authenticated Supabase Edge Functions
5. **Pending Edit Pattern** - Commit inline edits before state mutations

---

## Import Convention

Always use `@/` prefix for imports:

```typescript
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { LogRow } from '@/types/workout';
```
