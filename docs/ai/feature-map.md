# Coach Kettle feature map

Short map for coding agents. Read this before adding duplicate systems.

## 1. Personalized workout programming

Implemented core:
- Routes: `app/program/index.tsx`, `app/program/create.tsx`, `app/program/week.tsx`, `app/program/day.tsx`
- Client: `contexts/ProgramContext.tsx`, `lib/programming.ts`, `lib/programSchedule.ts`
- Backend: `supabase/functions/programming`, `supabase/functions/next-set`
- Schema: `supabase/migrations/0035_programming_engine.sql`, `0037_next_set_suggestion.sql`

Capabilities:
- Goal/split/days/week/week count input.
- Multi-week plans with intensity and volume multipliers.
- Deload weeks via `deload_every` / `program_weeks.is_deload`.
- Week advancement and next-set suggestions.
- Home's program card starts the scheduled program day's rows directly, via `resolveHomeStartDecision()` in `lib/programSchedule.ts`.

Watchpoint:
- True week-to-week adaptation is mostly rules/backend-driven, not a full AI planner yet.

## 2. Form and technique feedback

Implemented app surface + persistence, video analysis disabled:
- Route: `app/form/index.tsx`
- Client: `lib/formAnalysis.ts`
- Types: `types/form.ts`
- Schema: `supabase/migrations/0039_form_and_recovery_stubs.sql`

Capabilities:
- `/form` shows previously captured records (unverified — scores, rep counts, and cues stay hidden since nothing has analyzed the video) plus a "Video analysis is coming soon" notice.
- Non-Pro users see an upgrade CTA on this screen; the Form Check entry stays visible in navigation as a purchase driver.
- Real-time-ready cue/warning shape exists in the data model for when analysis ships.

Watchpoint:
- Camera capture and video analysis are disabled. Nothing in the UI claims video analysis works today — do not re-enable recording or scoring copy without wiring a real analyzer. Native MediaPipe landmark extraction is not wired yet; `lib/formAnalysis.ts` accepts `pose_landmarks` and is where the native analyzer attaches when added.

## 3. Nutrition tracker + coaching

Implemented core:
- Routes: `app/(tabs)/nutrition/index.tsx`, `log.tsx`, `plan.tsx`, `targets.tsx`, `app/settings/nutrition-preferences.tsx`
- Client: `contexts/NutritionContext.tsx`, `lib/nutrition.ts`
- Backend: `supabase/functions/food-log`, `nutrition-targets`, `meal-plan`, `daily-feedback`, `nutrition-analyze`, `food-barcode`
- Schema: `supabase/migrations/0033_nutrition_system.sql`
- Transactional contracts (1.0.2): `complete_onboarding_atomic`, `save_nutrition_target_set_atomic`, `replace_meal_plan`, `persist_coach_feedback`, `read_meal_plan`, `read_nutrition_target_set` — these RPCs make the corresponding multi-row writes/reads atomic and consistent; call them instead of writing the underlying tables directly.

Capabilities:
- Food logs with calories, protein, carbs, fat, fiber, saturated fat.
- Training/rest macro targets in grams.
- Weekly meal plans with foods, portions, day split, meal slots.
- AI generation fallback to deterministic skeleton.
- End-of-day gap summaries and green/yellow/red nutrition grading.
- Transient text/photo meal analysis (`nutrition-analyze`) and barcode lookup (`food-barcode`), both in `app/(tabs)/nutrition/log.tsx`. Failure messages are classified into "provider unavailable" / "couldn't read that" / "feature not available" (see `classifyNutritionAnalysisError` in `lib/nutrition.ts`) rather than one generic "couldn't analyze" message.

## 4. Nutrition feedback loop

Implemented core:
- Logged vs target comparison: `daily-feedback` and `daily_nutrition_summaries`.
- Recent logs passed into meal plan regeneration: `supabase/functions/meal-plan`.
- Behavior events + harshness state: `supabase/migrations/0042_behavior_events_idempotent.sql`, `daily-feedback`.

Watchpoint:
- Automatic scheduled weekly recalibration depends on notification/cron deployment, not just client code.

## 5. Daily honest feedback

Implemented core:
- Function: `supabase/functions/daily-feedback/index.ts`
- UI: `app/coach/index.tsx`, `app/coach/history.tsx`
- Context: `contexts/CoachingContext.tsx`

Output contract:
- Nutrition grade.
- Workout completion check.
- Genuine win.
- Specific improvement.
- One tomorrow directive.
- Tone escalates from supportive to accountability without shaming.
