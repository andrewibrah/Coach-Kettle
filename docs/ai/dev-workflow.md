# Coach Kettle dev workflow

## Before editing

1. Locate the surface:
   - Route: `app/**`
   - Context: `contexts/**`
   - Client API: `lib/**`
   - Type shape: `types/**`
   - Edge Function: `supabase/functions/**`
   - Schema: `supabase/migrations/**`
2. Read the route + context + lib file together before changing behavior.
3. Check `docs/ai/feature-map.md` to avoid duplicating an existing system.

## Standard app checks

```bash
npm run lint
npx tsc --noEmit
```

Expected:
- `npm run lint` should have 0 errors. Warnings should be reduced when touching nearby code.
- `npx tsc --noEmit` should pass.

## Edge Function changes

App TypeScript excludes `supabase/functions/**` because those files import Deno URLs. If changing an Edge Function:

```bash
supabase functions serve <name>
supabase functions deploy <name>
```

Use function-local reasoning. Do not try to make Deno URL imports pass app `tsc`.

## Supabase patterns

- Prefer Edge Functions for service-role writes and AI calls.
- Direct client `supabase.from(...)` is okay only for RLS-safe user-owned tables.
- Migrations should be idempotent where possible: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ON CONFLICT` for seeds.
- Keep RLS policies explicit and user-scoped.

## Product standards

- Coach voice: direct, specific, useful. No filler praise.
- Nutrition advice: actual foods and gram/portion targets, not vague “eat healthier.”
- Training advice: sets/reps/load/progression, not generic motivation.
- Color grades: green/yellow/red should map to concrete score thresholds.
- AI outputs must have deterministic fallback behavior when API keys fail.

## Common pitfalls

- Do not include `supabase/functions/**` in app `tsc`.
- Do not add icons without updating `components/ui/icon-symbol.tsx` fallback mapping.
- Do not use `react-native-iap`; RevenueCat is the active IAP path.
- Do not put long business logic in route files.
- Do not add a new nutrition/programming table without updating matching `types/**` and `lib/**`.
