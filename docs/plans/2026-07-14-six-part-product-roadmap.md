# Coach Kettle — Six-Part Product Roadmap

Date: 2026-07-14
Status: implementation plan — no product code changed by this document.

## Objective

Turn Coach Kettle into a reliable daily gym copilot while adding a fast, privacy-safe nutrition capture flow. The delivery order is deliberate: restore web QA and measurement first; then improve the daily loop; then add automation and trust-sensitive features.

## Product decisions locked before implementation

1. **Nutrition capture is mutually exclusive:** a submission contains either text or one photo, never both.
2. **No silent food logging:** AI returns an editable review first. `Add log` is the only action that writes a user food log.
3. **Photo result UI:** one row per detected food, with `food type`, editable estimated weight in grams, editable calories/macros, and a bottom `Add log` button. The photo itself is not retained after inference in v1.
4. **Text result UI:** text gets the same editable review sheet without a photo preview. This prevents inaccurate, invisible nutrition writes.
5. **Public catalog is not an audit log:** do not store source text, image bytes/URLs, user ID, device IDs, timestamps tied to a user, location, or meal notes in global food records. Store only normalized food facts after validation.
6. **Catalog writes are service-only:** authenticated users may read global foods; no client/user role may create `is_global=true` rows. The Edge Function decides whether a normalized, high-confidence candidate is safe to upsert.
7. **No medical claims:** estimates are clearly labeled. Low confidence, mixed dishes, restaurant meals, and uncertain portions require user edits before logging.

## Evidence and impact baseline

- `app/(tabs)/nutrition/log.tsx` owns the existing search, selected-food, quick-log, and meal-slot UI.
- `lib/nutrition.ts` is the authenticated client boundary for `/food-log`.
- `contexts/NutritionContext.tsx` calls `logFood()` and refreshes totals after mutation.
- `supabase/functions/food-log/index.ts` currently validates and writes user food logs plus private custom foods.
- `supabase/migrations/0033_nutrition_system.sql` already separates global `foods` (`user_id IS NULL`) from user-scoped rows and has a global uniqueness index.
- `lib/mediaUpload.ts` only supports workout media; reuse its picker conventions, not its workout-media bucket or identifiers.
- GitNexus was reindexed at `c2debfb`. `NutritionProvider` has one direct upstream caller (`RootLayout`) and participates in the root provider process: **low symbol count, high availability importance**. `lib/nutrition.ts:logFood` has one direct caller: **low risk**, but its mutation semantics must remain backward compatible.

## Release 0 — Truth, privacy, and test harness

### T01 — Web-safe Supabase initialization
- Files: `lib/supabase.ts`; add a focused test or platform-safe helper test.
- Replace unconditional React Native `AsyncStorage` and `AppState` initialization with platform/server-safe adapters. Browser/static-server execution must not touch `window` through the native storage module.
- Preserve native durable session storage and foreground auto-refresh.
- Acceptance: Expo web server renders the initial route without `window is not defined`; native configuration behavior stays unchanged.

### T02 — Typed privacy-safe event boundary
- Files: add `types/analytics.ts`, `lib/analytics.ts`; update `supabase/functions/observability/index.ts` only if the current endpoint contract cannot accept the typed envelope.
- Define a closed event union and property allowlists. Reject free text, food names, media paths, notes, body metrics, raw AI output, and IDs that are not approved aggregate identifiers.
- Queue noncritical events and make tracking failures non-blocking.
- Acceptance: compile-time invalid event properties fail; event serialization tests prove text/media values are stripped.

### T03 — Baseline product instrumentation
- Files: `app/(tabs)/index.tsx`, workout-session hook/controller, `app/(tabs)/nutrition/log.tsx`, and the paywall entry point after GitNexus impact checks.
- Capture the minimum events: onboarding completion, today CTA, workout start/completion, set parser outcome/correction, nutrition logged source, recommendation accepted/overridden, paywall viewed/purchased/restored.
- Acceptance: event payloads contain categories/counts/booleans only; no interaction is blocked if telemetry fails.

### T04 — Establish executable checks
- Files: `package.json`, test config, and new focused tests beside pure logic.
- Add one test command without replacing lint or TypeScript verification. Start with parser and nutrition-input validation tests.
- Acceptance: `npm run test`, `npm run lint`, and `npx tsc --noEmit` all run cleanly.

## Release 1 — Today Home, not a feature warehouse

### T05 — Extract Home composition seams before redesign
- Files: `app/(tabs)/index.tsx`; add a session controller/hook and presentational components under `components/home/` or `components/workout/`.
- Move orchestration only; preserve existing set-logging behavior and navigation. Do not refactor unrelated workout logic.
- Acceptance: existing workout parser and persistence behavior are covered by regression tests and unchanged in a native smoke test.

### T06 — Resolve a deterministic “today session”
- Files: add `lib/todayPlan.ts`; consume existing program, last-session, nutrition, and recovery data.
- Return exactly one state: `resume`, `planned`, `programless`, or `rest`. Include the source and an explicit fallback.
- Acceptance: pure tests cover planned day, active draft, no program, rest day, and missing historical data.

### T07 — Build the Today command center
- Files: `components/home/HomeDashboard.tsx`, extracted presentation components, navigation entry points.
- Above the fold: actual plan title/duration/exercise count; one `Start` or `Resume` CTA; source-cited last-performance target; three compact Training/Nutrition/Recovery states; one next action.
- Acceptance: no generic start path when a planned/resumable session is available; screen remains accessible, dark-mode safe, and touch-friendly.

### T08 — Measure the redesign
- Compare two-week cohorts only after baseline events exist: first-workout start, completion, time-to-first-set, weekly 2+ completed workouts, and nutrition follow-through.
- Acceptance: SQL views/dashboard definitions are versioned and reproduce the metrics from event logs without reading raw health content.

## Release 2 — Deterministic-first Session Copilot

### T09 — Create deterministic recommendation domain
- Files: add `types/sessionCopilot.ts`, `lib/sessionCopilot.ts`.
- Inputs: program day, last three sessions per exercise, current set rows, PR/next-set logic, equipment, and nutrition constraint.
- Output: next exercise, target range, rationale citing actual history, permitted adjustment, and confidence. AI may explain ambiguity, never invent core loads.
- Acceptance: table-driven tests cover progression, regression/backoff, missing history, and conflicting constraints.

### T10 — Present current-exercise guidance
- Files: workout presentation components.
- Add current exercise, last result, next set target, rest state, and one-tap `same as last` / adjustment actions. Require visible confirmation when parsing ambiguous shorthand.
- Acceptance: suggestions are dismissible, never block logging, and overrides are tracked without recording free text.

### T11 — Add a 20-second closeout
- Files: session review component and analytics wrapper.
- Present volume/PR/trend plus one evidence-based next action: nutrition follow-through, schedule next session, or technique journal.
- Acceptance: no generic congratulatory copy; every recommendation links to a factual session/nutrition condition.

## Release 3 — Nutrition capture: text OR photo

### T12 — Database and storage privacy boundary
- Files: new migration after `0046_*`.
- Add a private `nutrition-inputs` bucket only if an uploaded image is required for Edge Function inference. Restrict object paths to `{auth.uid()}/{request_id}/...`, JPEG/PNG/WebP, one image, and a conservative size limit. Add a scheduled/explicit delete path; v1 deletes photo objects immediately after inference succeeds or fails.
- Add `food_catalog_candidates` for normalized, non-PII food facts: canonical name, optional brand only when it is a product fact, grams, calories/macros, tags, model/provider version, confidence bucket, validation status, canonical hash, and aggregate counters. No source payload column.
- Never write global food rows directly from untrusted text/photo output. Candidates may be promoted/upserted to `foods` only by the service role after strict validation and duplicate matching.
- Acceptance: RLS denies cross-user storage access and all authenticated inserts/updates to global foods; database constraints reject invalid macro values and invalid status transitions.

### T13 — Typed capture contract and client utility
- Files: extend `types/nutrition.ts`; extend `lib/nutrition.ts`; add `lib/nutritionCapture.ts`.
- Define discriminated requests: `{kind:'text', text}` OR `{kind:'image', upload_token/storage_path}`. Enforce exactly one variant at runtime and compile time.
- Define response items with name, grams, calories, macros, confidence, catalog match status, and reason. Clamp all numeric values.
- Add an image picker limited to one image; do not reuse workout IDs/bucket paths.
- Acceptance: tests reject empty, mixed text+image, multiple-image, oversize, unsupported MIME, and unsafe string payloads before AI/network use.

### T14 — Add the authenticated `nutrition-capture` Edge Function
- Files: `supabase/functions/nutrition-capture/index.ts`; shared validation helper if justified.
- Verify JWT; rate limit per user; validate content type/size and storage ownership; resolve an exact global catalog match before invoking AI.
- Text path: send transient text to the AI only if no deterministic catalog resolution is sufficient. Image path: send a signed/private transient image reference or byte payload only to the configured vision model. Require strict JSON output.
- Normalize every proposed item; reject prompt-injected output, excessive item counts, unsafe names, impossible macro values, or confidence below the review threshold. Never log food or write global catalog records during analysis.
- Return editable proposed items only. Delete temporary image object in `finally`.
- Acceptance: Deno tests/local function checks cover unauthorized request, union violation, catalog hit, AI parse failure, low confidence, and cleanup after error.

### T15 — Build the capture entry UI and review sheet
- Files: `app/(tabs)/nutrition/log.tsx` plus focused components under `components/nutrition/`.
- Add a clearly labeled `Describe food` / `Photo` choice. Selecting one clears/disables the other. Text uses a nutrition capture composer; photo opens one-image selection.
- Result sheet:
  - photo preview only for image mode;
  - one editable row per food: food type, grams, calories, protein/carbs/fat;
  - add/remove row affordance;
  - meal-slot picker;
  - estimated/confidence disclosure;
  - bottom `Add log` action.
- For a picture, the exact requested visual pattern is retained: `Food type | estimated weight (editable) | estimated calories` on every line, then `Add log` at the bottom.
- Acceptance: text and image cannot be submitted together; cancel creates no log; every changed estimate is what gets logged.

### T16 — Confirm-and-log with catalog recall
- Files: `lib/nutrition.ts`, `contexts/NutritionContext.tsx`, `nutrition-capture` function, optionally `food-log` only after a GitNexus impact analysis.
- On `Add log`, submit the confirmed items as a batch with the selected meal slot. Atomically write user logs; map exact catalog matches to `food_id`.
- After user confirmation, send normalized facts to the candidate pipeline. Promote only verified/high-confidence generic foods; keep all other candidates non-public. Aggregate candidate confirmations can later improve recall without identifying users.
- Acceptance: a failed item cannot cause partial invisible writes; totals refresh once after a successful batch; text/image/raw AI response is absent from global tables and analytics.

### T17 — Nutrition capture measurement and abuse safeguards
- Events: `nutrition_capture_started`, `nutrition_capture_analyzed`, `nutrition_capture_reviewed`, `nutrition_capture_confirmed`, `nutrition_capture_failed`.
- Allowed properties: mode, item_count, confidence_bucket, catalog_hit_count, edit_count, latency_bucket, failure_category. Prohibited: source text, image path, food names, macros tied to a user, model output.
- Add per-user rate limits, request IDs for idempotency, size/item limits, and cost/timeout fallback to manual quick log.
- Acceptance: dashboard measures capture-to-log conversion and edit rate without exposing health or personal content.

## Release 4 — Trust upgrades

### T18 — Replace placeholder meal-plan fallback
- Files: `supabase/functions/meal-plan/index.ts`; curated deterministic meal template module/data.
- Return real meal items with quantities/macros whenever AI is unavailable. Surface provenance as `template` or `AI-assisted`.
- Acceptance: fallback never emits “Placeholder meal”; all daily totals pass macro-tolerance validation.

### T19 — Choose the Form Check truth path
- Option A: integrate landmark capture, validation, calibration dataset, confidence, and manual review.
- Option B: rename to **Technique Journal**, remove score/reps claims, preserve recording/notes/history, and make no injury/form guarantees.
- Gate: do not market camera scoring until a benchmarked landmark implementation meets documented error bounds.

## Required execution gates

### Pre-flight gate
Before every code task: reread the named files; run GitNexus `impact` on each changed symbol; report any high/critical blast radius. No implementation begins on a stale index.

### Revision gate
Every task follows TDD where a testable seam exists: write/extend failing test, run it red, implement minimally, run green, then lint/type-check the affected app. Edge Functions receive Deno/local checks separately because app TypeScript excludes them.

### Specification review gate
A fresh reviewer checks exact task requirements, paths, runtime behavior, privacy requirements, and no scope creep. Any gap returns to a fresh implementer.

### Quality review gate
After spec PASS, a separate reviewer checks error handling, RLS/auth, rate limiting, AI-output validation, accessibility, dark mode, native/web behavior, and test coverage. Critical/important findings block the next task.

### Escalation / abort gate
Stop and escalate instead of guessing if: a migration weakens RLS; a design retains user photos/text without explicit consent; an AI provider cannot guarantee transient handling; a high/critical GitNexus impact appears; or nutrition estimates would be presented as medical fact.

## Validation matrix

- App: `npm run lint`, `npx tsc --noEmit`, new test command.
- Web: boot and inspect the first route after the Supabase adapter change; no server-render crash.
- Edge Functions: format/type/local invocation for each changed Deno function, including malformed JSON and unauthorized requests.
- Database: migration in a clean local/staging Supabase environment; RLS tests with owner, non-owner, and service-role cases.
- iOS/Android smoke: create text capture, photo capture, cancel, edit quantities, batch add, offline/network failure, screen-reader labels, and dark mode.
- Privacy: inspect database rows/event payloads after both capture modes and prove no raw prompt/photo/user ID was written to the global catalog/candidate data.

## Execution order

1. T01–T04 (foundation) sequentially.
2. T05–T08 (Today) sequentially after baseline measurement is live.
3. T09–T11 (Session Copilot) sequentially because they touch the same workout surfaces.
4. T12 before T13; T13 and T14 can run in parallel; T15 after both; T16 then T17.
5. T18 and T19 are independent, but must not begin until privacy/analytics reviewers approve Releases 0–3.

## First build slice

Start with **T01** only. It restores browser QA and is a contained precondition for screenshot-level UX verification. Then complete T02–T04 before changing Home or adding AI image processing.
