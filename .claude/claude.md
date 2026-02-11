# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Coach Kettle** - Expo/React Native workout tracker with Supabase backend. Users log sets via natural language ("Bench 185 x 8") parsed locally (regex) or via AI fallback.

## Commands

```bash
npm install               # Install deps
npx expo start            # Dev (i=iOS, a=Android, w=web)
npx expo start --tunnel   # Dev with tunnel (for physical devices)
npx expo start --clear    # Dev with cache clear
npm run lint              # Lint

# Supabase (user runs manually)
supabase db push                    # Push migrations
supabase functions deploy           # Deploy all Edge Functions
supabase functions deploy <name>    # Deploy single function
supabase functions serve <name> --env-file .env.local  # Local dev
```

## Architecture

### Stack
- **Frontend**: Expo 54 + React Native + TypeScript
- **Backend**: Supabase (Auth, Postgres, Edge Functions, Realtime)
- **Storage**: AsyncStorage (local-first) + Supabase (sync)

### Provider Hierarchy
```
ThemeProvider → AuthProvider → ProfileProvider → PRCelebrationProvider → AuthLockProvider
```

### Data Flow
```
User Input → structuredGate.ts → regex match? → LogRow[]
                               → no match? → /chat API → LogRow[]
                                      ↓
                              AsyncStorage (immediate) + Supabase (background)
```

### Key Files

| Area | Files |
|------|-------|
| Main screen | `app/(tabs)/index.tsx` |
| Input parsing | `lib/structuredGate.ts` |
| API client | `lib/api.ts` |
| Auth | `components/AuthProvider.tsx`, `lib/auth.ts`, `lib/authLock.ts` |
| Workout state | `hooks/useWorkoutSession.ts`, `hooks/useRowActions.ts` |
| Local storage | `lib/workoutStorage.ts` |
| PR detection | `lib/prTracking.ts` |
| Edge Functions | `supabase/functions/` |

### Edge Functions

| Endpoint | Purpose |
|----------|---------|
| `/chat` | Parse workout + AI |
| `/coach` | Streaming AI Q&A |
| `/history` | Workout CRUD |
| `/profile` | User profile |
| `/pr-tracking` | PR lifts |
| `/workout-templates` | Templates |

## MCP Tools (if available)

| Tool | When |
|------|------|
| `guide(task)` | **Start here** - returns doc + file skeletons |
| `skeleton(path)` | Understand a file's exports/imports/hooks |
| `map(path)` | See directory structure |
| `area(name)` | Deep dive: auth, workout, parsing, etc |

## Without MCP

1. Read `docs/README.md` - navigation + patterns
2. Find relevant doc from index
3. Follow the patterns

## Rules

- `@/` imports only (path aliases in tsconfig)
- `useThemeColor()` for colors (supports light/dark)
- Mutations via Edge Functions only (never direct DB access)
- `commitPendingAndGet()` before API calls (inline editing pattern)
- No hardcoded colors

## Key Types

```typescript
type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
}

type WorkoutSession = { id, dateISO, part, rows, createdAt, review? }
type BodyPart = "Push" | "Pull" | "Legs" | "Chest" | "Back" | ...
```

## Parsing Patterns

| Input | Result |
|-------|--------|
| `Bench 185 x 8` | Single set |
| `Bench 185 3x8` | Multi-set |
| `185 x 8` | Shorthand (uses last exercise) |
| `185, 165, 145 x 8` | Drop set |
| `Bench 185 + Rows 135 x 8` | Superset |
| `Run 20 min` | Cardio |
| `Bench 60kg x 8` | Auto kg→lbs |

## Session Lock

4-hour TTL in `lib/authLock.ts`. After idle timeout → LockScreen → biometric unlock.

## Workflow Notes

For implementation tasks:
- Use subagents for parallel work when appropriate
- Prepare all code changes, migrations, and function code
- User will run `supabase db push` and `supabase functions deploy` manually
- User will reload the app manually

## Vibe

Fast. Minimal. Gym-friendly. PRs get confetti.
