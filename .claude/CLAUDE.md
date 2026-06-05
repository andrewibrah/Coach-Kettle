# CLAUDE.md

## Project

**Coach Kettle** — Expo SDK 55 / React Native 0.83.6 workout tracker (iOS-first), Supabase backend. Users log sets via natural language ("Bench 185 x 8") parsed locally (regex) or AI fallback. Phase 1 (v1.0.1+) adds: nutrition + meal plans, daily coach with harshness state machine, multi-week programming engine, body metrics + progress, exercise library, notifications.

## Warnings

AI coding agents optimize for fluent output, not system truth:
1. AI will confidently fabricate logic, APIs, and edge-case behavior — verify all output.
2. Generated code often silently fails under real load, concurrency, or malformed input.
3. Security assumptions are naïve by default — assume missing auth, validation, and threat modeling.
4. AI optimizes for plausibility, not correctness — "looks right" is a red flag.
5. Subtle bugs hide in glue code, state transitions, and error handling.

## Commands

```bash
npx expo start                                          # Dev server
npx expo run:ios                                        # iOS simulator
npx expo lint                                           # Lint
supabase db push                                        # Apply migrations (user runs manually)
supabase functions deploy <name>                        # Deploy function (user runs manually)
supabase functions serve <name> --env-file .env.local   # Local function testing
```

## Architecture

### Provider Hierarchy (`app/_layout.tsx`)

```
ThemeProvider → AuthProvider → ProfileProvider → EntitlementProvider →
OnboardingProvider → PRCelebrationProvider → AuthLockProvider →
NotificationsProvider → NutritionProvider → CoachingProvider → ProgramProvider →
RestTimerProvider → GestureHandlerRootView → NavigationThemeProvider → Expo Router Stack
```

Order matters: auth before profile, entitlement before onboarding, features last. RestTimerProvider is innermost so chip + workout-screen trigger share one instance. All providers live in `contexts/`.

### Core Data Flow

```
User Input → structuredGate.ts → regex match? → LogRow[]
                               → no match?   → /chat API → LogRow[]
                                     ↓
                          AsyncStorage (immediate) + Supabase (background)
```

All writes hit AsyncStorage immediately; Supabase sync is background/best-effort. Sign-out calls `clearAllCaches()` in `AuthProvider`.

### Why These Decisions

- **Local-first storage** — data survives network failures; gym environments have weak signal
- **Edge Functions for all mutations** — no direct DB access from client; enforces auth boundary
- **4-hour session TTL** — biometric convenience + security; change via `AUTH_TTL_MS` in `lib/authLock.ts`
- **Structured gate pattern** — regex first (fast path), AI fallback only for complex queries

## Domain Rules (not obvious from code)

### Coaching / Harshness State Machine

Levels: `0=supportive` → `1=firm` → `2=direct` → `3=accountability`.

- **Bad day** = `nutrition_color === 'red'` OR (scheduled training day AND no workout logged)
- **Good day** = `nutrition_color === 'green'` AND (workout completed OR not a training day)
- Bad days increment level; good streaks decrement by 1/day (floor 0)
- Narrative must cite specific gaps — "Great job!" is forbidden; every line must cite a specific hit or miss

### Programming Engine

Linear periodization (default): intensity +4%/week, deload every 4th week at 70% intensity / 60% volume. Target weights seeded at 70% e1RM from PRs × intensity_pct. Block/undulating are placeholder stubs.

`suggest_next_set` RPC heuristics: 12+ reps + clean drop-off → +5/10 lb, drop rep target ~3; 10+ reps clean → +2.5/5 lb; any set ≤ 4 reps → back off 5/10 lb; otherwise hold.

### PR Detection

Logged sets → `checkForPR()` → E1RM (Epley) → compare PR → insert `pr_history` → Supabase Realtime → `PRCelebrationProvider` → confetti.

## Edge Function Pattern

All functions: Deno runtime, CORS preflight on `OPTIONS`, JWT auth.

**CRITICAL:** User-scoped calls use `SUPABASE_ANON_KEY` + bearer token. Service-role is only for true admin operations. Never use service-role where user auth context is expected — it silently bypasses RLS.

```typescript
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  { global: { headers: { Authorization: authHeader } } }
);
```

ENV vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`

Adding a new function: `mkdir supabase/functions/<name> && touch supabase/functions/<name>/index.ts`, follow the pattern above, add export to `lib/api.ts`, user deploys.

## Rules

- `@/` path aliases only (configured in `tsconfig.json`)
- `useThemeColor()` for all colors — no hardcoded hex values
- Mutations via Edge Functions only — never direct Supabase DB access from client
- Call `commitPendingAndGet()` before any mutation that reads rows (inline editing guard)
- When adding a new AsyncStorage key, add it to `clearAllCaches()` in `AuthProvider`

## GitNexus — Code Intelligence (MANDATORY)

Repo indexed as **WorkoutTracker**. Use MCP tools for every code task.

**Always do:**
- Run `impact({target: "symbolName", direction: "upstream"})` before editing any symbol — report blast radius
- Run `detect_changes()` before committing
- Warn user on HIGH or CRITICAL risk before proceeding
- Use `query({query: "concept"})` to explore unfamiliar code — not grep
- Use `context({name: "symbolName"})` for callers, callees, and process participation

**Never do:**
- Edit a symbol without running impact first
- Ignore HIGH/CRITICAL warnings
- Rename with find-and-replace — use `rename` (understands the call graph)
- Commit without `detect_changes()`

| Tool | Use for |
|------|---------|
| `query` | Find execution flows by concept |
| `context` | 360° view of a symbol |
| `impact` | Blast radius before editing |
| `detect_changes` | Pre-commit scope check |
| `rename` | Safe multi-file rename |

> Index stale? Run `npx gitnexus analyze` first.

## Workflow

- Prepare all code changes, migrations, and edge function code
- User runs `supabase db push` and `supabase functions deploy` manually
- User reloads app manually after deploys
- Use subagents for parallel work when appropriate

## Vibe

Fast. Minimal. Gym-friendly. PRs get confetti.
