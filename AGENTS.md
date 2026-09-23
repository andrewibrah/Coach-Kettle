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

This project is indexed by GitNexus as **WorkoutTracker** (5713 symbols, 8717 relationships, 125 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/WorkoutTracker/context` | Codebase overview, check index freshness |
| `gitnexus://repo/WorkoutTracker/clusters` | All functional areas |
| `gitnexus://repo/WorkoutTracker/processes` | All execution flows |
| `gitnexus://repo/WorkoutTracker/process/{name}` | Step-by-step execution trace |

<!-- gitnexus:end -->
