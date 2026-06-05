# Coach Kettle agent brief

You are editing an Expo Router + Supabase fitness app.

## Prime directive

Ship small verified changes. Do not guess architecture. Read the relevant route/context/lib/function first, then run checks.

## Stack

- App: Expo SDK 55, React Native 0.83, React 19, TypeScript strict.
- Routing: `app/**` with Expo Router.
- State: React contexts in `contexts/**`.
- Client APIs: `lib/**`.
- Domain types: `types/**`.
- Backend: Supabase Edge Functions in `supabase/functions/**` and SQL migrations in `supabase/migrations/**`.
- Auth/network wrapper: `lib/auth.ts` + `fetchWithAuth` for Edge Function calls.

## Current high-value systems

- Workout logging: `app/(tabs)/index.tsx`, `hooks/useWorkoutSession.ts`, `lib/workoutStorage.ts`.
- Programming: `contexts/ProgramContext.tsx`, `lib/programming.ts`, `supabase/functions/programming`, migration `0035`.
- Nutrition tracker/plans: `contexts/NutritionContext.tsx`, `lib/nutrition.ts`, `app/nutrition/**`, migrations `0033`, functions `food-log`, `nutrition-targets`, `meal-plan`.
- Daily feedback: `supabase/functions/daily-feedback`, `contexts/CoachingContext.tsx`, `app/coach/**`.
- Form check: `app/form/index.tsx`, `lib/formAnalysis.ts`, `types/form.ts`, migration `0039`.
- RevenueCat: `lib/iap.ts`, `constants/revenuecat.ts`, `constants/subscription.ts`.

## Verification commands

```bash
npm run lint
npx tsc --noEmit
```

Notes:
- `tsconfig.json` excludes `supabase/functions/**`; those are Deno modules and should not be typechecked by app `tsc`.
- Use Supabase CLI/Deno checks separately for Edge Functions when changing them.

## Coding rules

- Keep routes thin. Put reusable logic in `lib/**`, shared state in `contexts/**`, and shapes in `types/**`.
- Use `fetchWithAuth` for Edge Functions unless directly using RLS-safe Supabase tables.
- Keep nutrition and training outputs specific: calories/macros in grams, explicit foods/portions, direct coaching language.
- Never add vague AI copy where a deterministic rule can do the job.
- Avoid broad refactors unless tests/checks force them.

## More context

- Feature map: `docs/ai/feature-map.md`
- Dev workflow: `docs/ai/dev-workflow.md`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **WorkoutTracker** (4451 symbols, 7581 relationships, 226 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/WorkoutTracker/context` | Codebase overview, check index freshness |
| `gitnexus://repo/WorkoutTracker/clusters` | All functional areas |
| `gitnexus://repo/WorkoutTracker/processes` | All execution flows |
| `gitnexus://repo/WorkoutTracker/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
