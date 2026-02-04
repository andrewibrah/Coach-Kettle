# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coach Kettle is an Expo/React Native workout tracking app with Supabase backend. Users log exercises via natural language input (e.g., "Bench 185 x 8") which is parsed locally or via AI. The app supports iOS, Android, and web.

## Documentation

**Before coding, read the relevant docs.** The `docs/` folder contains detailed documentation for every part of the app. Use it.

### Quick Reference

| Task | Read First |
|------|------------|
| Auth, login, sessions | `docs/01-auth.md` |
| Provider/context changes | `docs/02-providers.md` |
| Workout logging flow | `docs/03-workout-flow.md` |
| Input parsing, new patterns | `docs/04-parsing.md` |
| Storage, AsyncStorage, sync | `docs/05-storage.md` |
| API calls, endpoints | `docs/06-api.md` |
| UI components | `docs/07-components.md` |
| Custom hooks | `docs/08-hooks.md` |
| Modal dialogs | `docs/09-modals.md` |
| Onboarding flow | `docs/10-onboarding.md` |
| Settings screens | `docs/11-settings.md` |
| PR tracking, celebrations | `docs/12-pr-tracking.md` |
| Workout templates | `docs/13-templates.md` |
| Theming, colors | `docs/14-theming.md` |
| Edge Functions (backend) | `docs/15-edge-functions.md` |
| Big picture, architecture | `docs/00-architecture.md` |

### Workflow for Any Task

1. **Identify the area** - What part of the app does this touch?
2. **Read the doc** - Open the relevant doc from the table above
3. **Find the key files** - Each doc lists the exact files involved
4. **Check the patterns** - Docs show code patterns and examples to follow
5. **Implement** - Make changes following the established patterns
6. **Test** - Run `npx expo start` and verify on device/simulator

### Example Workflow

> "Add a new input pattern for pause reps like 'Bench 185 x 5 w/ 3sec pause'"

1. Read `docs/04-parsing.md`
2. Find `lib/structuredGate.ts` is the key file
3. See the regex pattern structure in the doc
4. Add new pattern following existing conventions
5. Test with the input bar

## App Personality

Coach Kettle is **fast, minimal, and gym-focused**. Design decisions should reflect:
- **Speed first** - Local parsing before AI, instant feedback
- **Gym-friendly UX** - Big touch targets, one-hand operation, quick input
- **No fluff** - Minimal UI, no unnecessary confirmations
- **Smart defaults** - Remember last exercise, auto-increment sets
- **Celebration moments** - PRs deserve confetti

## Commands

```bash
npm install          # Install dependencies
npx expo start       # Start dev server (press i for iOS, a for Android, w for web)
npm run lint         # Run ESLint via expo lint
```

## Architecture

### Provider Hierarchy (app/_layout.tsx)
```
ThemeProvider → AuthProvider → AuthLockProvider → GestureHandlerRootView → NavigationThemeProvider
```

- **ThemeProvider**: System/light/dark theme preference with AsyncStorage persistence
- **AuthProvider**: Supabase auth state, session management, cache clearing
- **AuthLockProvider**: 4-hour TTL session lock with biometric unlock option

### Core Data Flow

1. **Input Parsing** (`lib/structuredGate.ts`): Local regex-based parser for workout entries. Falls back to AI for ambiguous input.
   - Fast path: "Bench 185 8" → parsed locally, no API call
   - AI path: Conversational questions or complex entries → `/functions/v1/chat` or `/functions/v1/coach`

2. **Workout Session** (`hooks/useWorkoutSession.ts`): Manages active workout state, auto-resets on date change

3. **Storage** (`lib/workoutStorage.ts`): Local-first with AsyncStorage, syncs to Supabase Edge Functions

### API Layer (`lib/api.ts`)

All API calls go through Supabase Edge Functions at `${supabaseUrl}/functions/v1/`:
- `chat` - AI workout parsing
- `coach` - AI coaching questions (streaming)
- `parse` - Workout input parsing
- `history` - CRUD for saved workouts
- `log-set` - Individual set logging
- `terms-acceptance` - Legal consent tracking

Auth headers include JWT from `supabase.auth.getSession()` with automatic refresh on 401.

### File Structure

- `app/` - Expo Router screens (file-based routing)
- `components/` - UI components and providers
- `hooks/` - Custom React hooks
- `lib/` - Business logic, API client, utilities
- `types/` - TypeScript type definitions

### Key Types (`types/workout.ts`, `lib/workoutStorage.ts`)

- `LogRow`: Active workout row with syncing status
- `WorkoutSession`: Saved workout with rows and optional AI review
- `BodyPart`: Workout categorization (Push/Pull/Legs/etc.)

## Security Requirements

### Supabase API Security
- All data mutations must go through authenticated Edge Functions (never direct DB access from client)
- JWT tokens auto-refresh 5 minutes before expiry (`lib/api.ts:44-62`)
- Session tokens stored via AsyncStorage with `sb-` prefix

### Input Validation
- All user input in `structuredGate.ts` is sanitized through regex parsing before use
- API responses are validated before state updates (see `buildRowsFromApi` in `app/(tabs)/index.tsx`)
- Never interpolate raw user input into queries or API payloads without validation

### Rate Limiting
- Implement rate limiting at the Edge Function level (Supabase side)
- Client-side: Disable buttons during loading states to prevent duplicate submissions
- The `loading` state gates all API submissions in the UI

### Authentication
- OAuth supported (Apple, Google) via `expo-auth-session`
- Biometric unlock via `expo-local-authentication` with 4-hour TTL
- Terms acceptance tracked both locally and server-side

## Code Patterns

### Path Aliases
Use `@/` prefix for imports (configured in `tsconfig.json`):
```typescript
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
```

### Theming
Use `useThemeColor` hook for theme-aware colors:
```typescript
const backgroundColor = useThemeColor({}, 'background');
```

### State Updates with Pending Edits
The workout table has an inline editing system. Use `withPendingRows` or `commitPendingAndGet` before operations that need current state:
```typescript
const currentRows = commitPendingAndGet();
// Now safe to use currentRows for API calls
```

### Error Handling
- API errors: Show via Alert or set error state, never throw uncaught
- Auth failures: Trigger session refresh, then retry once
- Network failures: Local-first storage ensures data isn't lost

## Common Gotchas

### Don't Skip These
- **Always use `@/` imports** - Not relative paths like `../../lib/api`
- **Check auth state** - Most screens need `useAuth()` session check
- **Theme-aware colors** - Use `useThemeColor()`, never hardcode colors
- **Pending edits** - Call `commitPendingAndGet()` before API calls with row data

### Testing Checklist
- [ ] Works in light mode
- [ ] Works in dark mode
- [ ] Works on iOS
- [ ] Works on Android
- [ ] Works on web (if applicable)
- [ ] Handles loading states
- [ ] Handles error states
- [ ] No TypeScript errors (`npm run lint`)

## Quick Commands

```bash
npm install                    # Install deps
npx expo start                 # Dev server (i=iOS, a=Android, w=web)
npm run lint                   # Lint check
npx expo start --clear         # Clear cache and start
supabase functions serve       # Local Edge Functions
supabase functions deploy      # Deploy Edge Functions
```

## File Naming Conventions

- **Screens**: `app/folder/screen-name.tsx` (kebab-case)
- **Components**: `components/ComponentName.tsx` (PascalCase)
- **Hooks**: `hooks/useHookName.ts` (camelCase with `use` prefix)
- **Utils**: `lib/utilName.ts` (camelCase)
- **Types**: `types/domain.ts` (camelCase)

## When in Doubt

1. Check the docs first (`docs/README.md` has the full index)
2. Look at similar existing code in the codebase
3. Follow the patterns already established
4. Keep it simple - this is a gym app, not a spaceship
