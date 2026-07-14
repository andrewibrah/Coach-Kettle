# Coach Kettle Product, UI/UX, AI, and Analytics Audit

Date: 2026-07-14
Scope: current working tree on `feat/exercise-library-oss-dataset`; no product code changed.

## Executive verdict

Coach Kettle has more real product underneath than its shell communicates. It is a capable local-first workout logger with structured parsing, programming, nutrition, daily feedback, progress tracking, subscription enforcement, and a 1,324-exercise catalog. The central weakness is not a lack of features. It is that the app presents them as disconnected utilities instead of one decisive daily operating loop.

**Current identity:** a broad fitness utility collection with a strong workout logger.

**Recommended identity:** a gym-session copilot that tells a member what to do today, makes logging nearly frictionless, and closes the loop with evidence-based feedback.

A realistic 10–20% product improvement does not start with another large subsystem. It comes from unifying the existing systems around one screen and instrumenting the funnel that proves whether that screen improves activation, workout completion, nutrition adherence, and retention.

## What I inspected

- 59 route components under `app/`, 12 contexts, 32 client library modules, 27 Edge Functions, and 46 SQL migrations.
- Primary workout experience: `app/(tabs)/index.tsx` (1,408 lines), `hooks/useWorkoutSession.ts`, `lib/structuredGate.ts`, `components/home/HomeDashboard.tsx`.
- Nutrition, coaching, programming, progress, exercise library, form check, navigation, auth/provider hierarchy, and observability schema/function.
- Product documentation, implementation stubs, test inventory, GitNexus status, and live web startup behavior.

## Evidence-backed product map

| Capability | Evidence | Assessment |
|---|---|---|
| Fast local workout logging | `lib/structuredGate.ts` parses normal sets, warmups, dropsets, supersets, cardio, `same`, and end-workout language; workout drafts persist on background in `app/(tabs)/index.tsx:229-292` | **Gold.** This is the differentiated core. Keep improving it. |
| Local-first reliability | `AGENTS.md` defines AsyncStorage-immediate / Supabase-background behavior; workout draft restores same-day sessions | **Gold.** Correct gym-environment decision. |
| Personalized programming | `contexts/ProgramContext.tsx`, `lib/programming.ts`, `supabase/functions/programming`, `app/program/**` | **Gold, but underexposed.** |
| Nutrition with targets and offline pending saves | `contexts/NutritionContext.tsx:3-12, 295-345, 418-444` | **Strong engineering.** Source-of-truth and fallback semantics are unusually clear. |
| Daily feedback / accountability | `contexts/CoachingContext.tsx`; `app/coach/index.tsx`; documented harshness state machine in `CLAUDE.md` | **Good product direction.** Needs actionable next steps, not just a report. |
| Progress metrics | `app/(tabs)/progress/index.tsx` covers weight, RHR, recent body metrics, local 7-day workout count | **Useful but fragmented.** |
| Exercise catalog | `app/exercise-library/index.tsx`, latest migration seed; search backend limits results to 25 | **Good trust and discovery asset.** |
| Form analysis | `app/form/index.tsx`, `lib/formAnalysis.ts`, migration `0039` | **Not ready for marketing.** Current score/reps are conservative fixed estimates when no landmarks exist. |
| AI usage telemetry | `supabase/functions/observability/index.ts`, `event_logs` schema | **Infrastructure exists, product analytics does not.** There is no client event producer or funnel dashboard. |

## UI/UX diagnosis

### What is working

1. **The interaction model for actual lifting is correct.** The Home screen supports loose inputs (`185 x 8`, abbreviated follow-ups, templates, rest markers), and parsing deterministically handles the common cases before AI. This is exactly where the app should be fast and quiet.
2. **Visual consistency is decent.** Theme tokens, consistent cards, 12–16px radii, haptics, safe-area padding, and many accessibility roles/labels are used across modern screens.
3. **The dashboard has the correct raw data.** `HomeDashboard` already has program, coaching, and nutrition context with no additional requests.

### What is holding the UX back

1. **The daily path is hidden inside navigation.** Five fixed tabs are Home, Timer, Nutrition, Progress, More (`app/(tabs)/_layout.tsx:60-100`). Program, coach, exercise library, history, chat, templates, and form check are all secondary destinations. A user must understand the information architecture before the app directs their next action.
2. **The Home dashboard uses the right inputs but the wrong decision.** It shows a full-program exercise count (`HomeDashboard.tsx:72-80`), not the actual session/day to perform. “Start” launches a generic name flow rather than a committed “Today: Push — Bench, OHP, rows” plan. This creates choice rather than momentum.
3. **The main route is too dense.** `app/(tabs)/index.tsx` is 1,408 lines, joining dashboard, session state, persistence, parsing, API calls, realtime subscriptions, modals, gestures, UI, and coach chat. It increases regression risk and makes experience changes expensive.
4. **The More tab is a feature warehouse.** Coach Report, Program, Exercise Library, History, Chat History, Templates, Settings, and form check are spread across More/Settings. Form Check is especially buried (`app/settings/index.tsx` routes to `/form`).
5. **Screens often report data without producing the next move.** Coach says what went well/improved/tomorrow focus; Progress gives measurements; Nutrition gives totals. The user must decide what to do after reading each one.
6. **Web is not presently a viable design-review surface.** `npx expo start --web --port 8099` completed the bundle but crashed during server rendering: `ReferenceError: window is not defined`, originating from AsyncStorage through `lib/supabase.ts:11-18`. This blocks browser screenshot/review and hurts cross-platform QA. It does not prove the iOS app is broken.

## Recommended UX: one daily command center

Make Home the **Today screen**, not a passive dashboard.

### Above the fold

1. **Today’s plan** — one sentence: “Push · 5 exercises · 45–55 min.”
2. **Single primary action** — `Start Push Workout`; resume draft when one exists.
3. **Readiness / constraint chip** — e.g. “Nutrition: 85g protein left” or “You trained 3 days straight — hold volume.” Never fake wearable readiness.
4. **Three small state cards** — Training, Nutrition, Recovery/Progress. Each gives a status plus one action.
5. **A quiet contextual suggestion** — “Last bench: 185 × 8. Target: 190 × 7–8.” This should be deterministic and cite the source set.

### During workout

- Keep the natural-language bar and table—the core already exists.
- Add an explicit **current exercise card** above the table: target, last result, next-set suggestion, rest state, and one-tap “same as last” / “+5 lb.”
- Make ambiguity visible before saving: “Logging Bench · set 2 · 185 × 8.” Let the user correct it once, quickly.
- Move full coach chat behind a compact “Ask Coach” sheet; do not compete with set logging.

### After workout

- Turn the session review into a 20-second closeout: volume/PR/one trend + one recommended next action.
- Offer one follow-through action only: log post-workout meal, schedule next session, or review form clip.

## AI automation: where it is genuinely valuable

### Build next: deterministic-first Session Copilot

**Inputs:** active program day, last 3 sessions for each lift, current workout rows, rest timer state, profile equipment/goal, recent nutrition state.

**Outputs:**
- Start recommendation for the next planned exercise.
- Set target and allowed adjustment range based on actual past performance.
- Explicit parsing confirmation for ambiguous shorthand.
- At workout end: a deterministic evidence summary, then optional AI explanation.

**Why this is the right AI:**
- The app already has structured parsing and next-set rules. AI should handle ambiguity, explanations, substitutions, and natural language—not fabricate load prescriptions.
- It produces value inside the high-frequency gym loop rather than creating another chat destination.

### Do not build yet

- A general “fitness chatbot” as the primary experience. Existing Coach chat is useful support, not the product.
- Camera “form score” marketing. `lib/formAnalysis.ts:24-46` deliberately returns expected rep count and fixed conservative scores without pose landmarks. Either wire real landmark capture and calibration, or label it as a **Technique Journal** until then.
- Meal-plan AI polish before reliability. `supabase/functions/meal-plan/index.ts:175-209` generates placeholder meals when AI fails/is unavailable. Upgrade the fallback to deterministic real-food templates before calling it personal meal planning.

## Analytics plan: turn data into product decisions

### Current state

- Error monitoring exists via Sentry in `app/_layout.tsx`.
- `event_logs` and authenticated `observability` Edge Function exist.
- Search found no client calls that produce product events, and no analytics SDK/dashboard.
- Subscription labels promise basic/advanced analytics, but the behavioral measurements needed to power those claims are absent.

### Minimum viable event taxonomy

Use a typed, privacy-safe `track()` client wrapper that queues noncritical events and strips free text by default.

| Event | Required properties | Decision it enables |
|---|---|---|
| `onboarding_completed` | step_count, goal, plan_selected | Activation drop-off |
| `today_cta_tapped` | state: start/resume/programless | Whether Home creates momentum |
| `workout_started` / `workout_completed` | source, planned, duration_sec, exercise_count | Core activation and completion |
| `set_logged` | parser: fast/ai/manual, kind, correction_made | Parser quality and AI cost/value |
| `next_set_accepted/overridden` | exercise_category, recommendation_type | Whether recommendations are trusted |
| `nutrition_logged` | source: recent/search/manual, meal_slot | Logging friction |
| `coach_opened/action_taken` | feedback_color, action_type | Whether coaching changes behavior |
| `paywall_viewed/purchased/restored` | source, product_id | Revenue funnel |
| `form_capture_saved` | analyzer_mode: placeholder/landmarks | Prevent misleading form-feature metrics |

### First dashboards

1. **Activation:** sign-up → onboarding complete → first workout started → first workout completed in 24 hours.
2. **Weekly retained lifter:** 2+ completed workouts in 7 days, segmented by program/no program.
3. **Logging friction:** median seconds from workout start to first set; parser fallback/correction rate; abandoned active sessions.
4. **Value loop:** users who view feedback and then complete next scheduled workout vs control.
5. **Revenue:** paywall source, trial conversion, and feature use before conversion.

### Privacy boundary

Never send raw coach questions, workout notes, food names, videos, or body measurements to generic analytics by default. Send categories/counts/booleans. Keep user-identifiable health data in Supabase only, with retention rules and a user-visible analytics/privacy control.

## Highest-leverage 10–20% improvement plan

### Phase 0 — Restore truth and safe iteration (1–2 days)

1. Fix server-side/web-safe Supabase storage initialization so `expo start --web` does not crash under static/server rendering.
2. Replace stale docs references: `AGENTS.md` refers to missing `docs/ai/feature-map.md` and `docs/ai/dev-workflow.md`; `docs/README.md` points to nonexistent numbered docs and old `components/*Provider.tsx` paths.
3. Define typed product events and capture the five core workout funnel events.
4. Add a small test runner and coverage for parsing, daily-plan selection, and workout completion state. Current repository has only three unit test files and no test script in `package.json`.

### Phase 1 — Make Home decisive (3–5 days)

1. Convert HomeDashboard into Today: identify the actual scheduled program day, show duration/exercise count/last performance, and give a committed Start/Resume CTA.
2. Add a compact “Today scorecard” with training/nutrition/recovery state and exactly one contextual action.
3. Promote workout history and program context at the point of starting a session; do not require More navigation.
4. Instrument baseline metrics before design changes, then compare two-week cohorts.

### Phase 2 — Session Copilot (1–2 weeks)

1. Extract workout orchestration from `app/(tabs)/index.tsx` into a session controller/hook and focused presentation components.
2. Add deterministic next-exercise and next-set cards using existing programming, PR, and last-set data.
3. Track accepted, overridden, and dismissed recommendations.
4. Add a short closeout flow that generates the next action from actual session evidence.

### Phase 3 — Trust upgrades (1–2 weeks)

1. Replace placeholder meal-plan fallback with curated deterministic meals and transparent provenance.
2. Either integrate true pose-landmark analysis with calibration/evaluation, or relabel Form Check as a recording/technique journal.
3. Build the retention and recommendation-trust dashboard; use it to decide whether advanced analytics deserves a paid entitlement.

## Concerns and risk register

| Severity | Concern | Evidence / consequence | Action |
|---|---|---|---|
| High | Web/static rendering crash | Live `expo start --web` crashed from AsyncStorage/Supabase accessing `window` during server render | Make Supabase storage platform/server safe; add web smoke check. |
| High | Form feedback could mislead users | Fixed estimate in `lib/formAnalysis.ts` when landmarks absent, while UI says “Camera rep count + technique cues” | Correct product copy or build real analysis before promotion. |
| Medium | AI meal-plan fallback is unusable as a recommendation | Fallback stores a “Placeholder meal” and description says to connect OpenAI | Use food templates; label provenance and fallback plainly. |
| Medium | No product analytics loop | Observability endpoint exists, client use absent | Implement typed events + dashboards before wide UI redesign. |
| Medium | Main workout screen is a change bottleneck | 1,408-line route owns too many concerns | Extract controller/presentation seams before heavy UI work. |
| Medium | Documentation and architecture map are stale | Broken `docs/ai/*` and old provider paths; GitNexus index is stale at commit `a42743a` while HEAD is `c2debfb` | Regenerate/update docs and re-run GitNexus analysis. |
| Medium | Testing is weak for a stateful health app | Only three test files; no configured test command | Add unit + state-flow tests and iOS smoke checklist. |

## What JOSE can do well in this repo

1. **UI/UX implementation:** turn the current Home into the decisive Today experience; create high-fidelity screen components; preserve native accessibility and dark mode.
2. **AI automation:** strengthen the deterministic parser and build an evidence-citing session copilot around it; guard AI costs and bad recommendations.
3. **User data systems:** design typed events, analytics SQL/views, retention/recommendation dashboards, and privacy boundaries.
4. **Product hardening:** identify fake/stub value claims, write fallback behavior, improve error/offline states, and make UI truthfully communicate confidence.
5. **Engineering discipline:** trace existing route/context/lib/function paths, apply small scoped changes, run lint/TypeScript checks, and verify real execution rather than stopping at design prose.

## Validation performed

- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npx expo start --web --port 8099` — bundling reached completion, then exited with `ReferenceError: window is not defined` via AsyncStorage/Supabase server render.
- `node .gitnexus/run.cjs status` — index is stale: indexed commit `a42743a`, current `c2debfb`.

## Recommended next move

Implement **Phase 0, item 1 and item 3** together: repair web-safe storage initialization and add the typed event client, then build the Today-screen slice against measured baseline behavior. This restores QA leverage and ensures the next UI change is judged by activation/completion data rather than taste.
