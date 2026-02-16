# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Coach Kettle** - Expo/React Native workout tracker with Supabase backend. Users log sets via natural language ("Bench 185 x 8") parsed locally (regex) or via AI fallback.

## warnings 
As is well-established, AI coding agents optimize for fluent output, not system truth. The following points define the highest-risk failure modes that must be actively constrained when delegating code generation to agents.”
1. AI will confidently fabricate logic, APIs, and edge-case behavior—never trust output without verification.
2. Generated code often passes happy paths while silently failing under real load, concurrency, or malformed input.
3. Security assumptions made by AI are naïve by default—assume missing auth, validation, and threat modeling.
4. AI optimizes for plausibility, not correctness—“looks right” is a red flag, not a signal.
5. Subtle bugs hide in glue code, state transitions, and error handling—exactly where AI hand-waves.
6. Dependency usage may be outdated, deprecated, or unsafe even if syntactically valid.
7. AI will mirror your prompt’s blind spots—unclear constraints guarantee flawed implementations.
8. Performance characteristics are rarely considered unless explicitly forced—expect inefficient defaults.
9. Generated abstractions tend toward over-complexity or leaky simplicity—both increase long-term cost.
10. The more you defer thinking to the agent, the faster you lose system-level understanding and control.

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
