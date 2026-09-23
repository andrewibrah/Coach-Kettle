# Package D implementation checkpoint

Status: local implementation and focused checks complete; R4 remains **FIXED-UNVERIFIED** pending actual Edge → PostgREST sequential/concurrent same-day write and readback. No deployment, live database, simulator, or device claim.

## Changes
- Added `lib/bodyMetricValidation.ts`: schema bounds, strict finite decimal parsing, blank omission, all-errors validation, calendar-date validation, sparse payloads and explicit-empty notes semantics.
- Integrated into actual `app/(tabs)/progress/body.tsx`: invalid/all-blank requests blocked, inline errors/accessibility/range hints, circumference guidance, failure retention, synchronous duplicate guard and owner/unmount completion protection.
- Tightened `supabase/functions/body-metrics/index.ts`: matching decimal/date rules and collect-all errors. Existing authenticated owner scoping, single sparse upsert, and whole-row delete retained; no read/merge/write.
- Added client/real React route tests in `lib/__tests__/bodyMetricValidation.test.ts`; extended existing real Edge VM `handler.test.ts` with bounds/schema parity, strict parsing/date, sparse/notes, auth/ownership, failure and delete coverage.
- Added documentation-only `20260921000100_body_metrics_merge_comment.sql`; filename checked unique and later than every current migration before creation. Historical migration untouched. No supplied exact comment string was discoverable in repository plans; comment explicitly documents per-user/date merge, omitted/null/blank unchanged and separate whole-row delete. **Correction (2026-09-23, see [task-d-final-progress.md](task-d-final-progress.md)):** plan §D step 6 does give the exact string; the migration now uses it verbatim.

## Verification
Observed RED: client validator missing, actual route submitted numeric-prefix junk and retained old-owner form; server accepted hexadecimal and rollover dates. These regressions now pass.

Final commands, all exit 0:
- `node --test lib/__tests__/bodyMetricValidation.test.ts supabase/functions/body-metrics/handler.test.ts` — 12 tests passed.
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/eslint 'app/(tabs)/progress/body.tsx' lib/bodyMetricValidation.ts lib/__tests__/bodyMetricValidation.test.ts supabase/functions/body-metrics/handler.test.ts`
- `/Users/me/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno check --no-lock --cached-only supabase/functions/body-metrics/index.ts`
- `git diff --check -- 'app/(tabs)/progress/body.tsx' supabase/functions/body-metrics/index.ts`

Node emits existing module-type and React test renderer deprecation warnings; expected database-failure injection logs an error while its 500 test passes. Initial app ESLint applied to Deno index reported unsupported URL import resolution; Edge index separately passes cached Deno check. No install/config change made.

Graph impact attempted before edits for route/date/numeric symbols: UNKNOWN because database storage version 43 versus runtime 42. No graph-pass claim. Source fallback corroborated sole client upsert caller, schema ranges and service-role explicit owner filtering. Graph callers/processes remain unresolved.
