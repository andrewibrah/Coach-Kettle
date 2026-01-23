# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EasyWorkouts is an Expo/React Native workout tracking app with Supabase backend. Users log exercises via natural language input (e.g., "Bench 185 x 8") which is parsed locally or via AI. The app supports iOS, Android, and web.

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
