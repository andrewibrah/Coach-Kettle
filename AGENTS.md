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
