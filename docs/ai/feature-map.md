# Coach Kettle feature map

Short map for coding agents. Read this before adding duplicate systems.

## 1. Personalized workout programming

Implemented core:
- Routes: `app/program/index.tsx`, `app/program/create.tsx`, `app/program/week.tsx`, `app/program/day.tsx`
- Client: `contexts/ProgramContext.tsx`, `lib/programming.ts`
- Backend: `supabase/functions/programming`, `supabase/functions/next-set`
- Schema: `supabase/migrations/0035_programming_engine.sql`, `0037_next_set_suggestion.sql`

Capabilities:
- Goal/split/days/week/week count input.
- Multi-week plans with intensity and volume multipliers.
- Deload weeks via `deload_every` / `program_weeks.is_deload`.
- Week advancement and next-set suggestions.

Watchpoint:
- True week-to-week adaptation is mostly rules/backend-driven, not a full AI planner yet.

## 2. Form and technique feedback

Implemented app surface + persistence:
- Route: `app/form/index.tsx`
- Client: `lib/formAnalysis.ts`
- Types: `types/form.ts`
- Schema: `supabase/migrations/0039_form_and_recovery_stubs.sql`

Capabilities:
- Camera video capture.
- Saved rep count, average tempo, ROM score, form score.
- Real-time-ready cue/warning shape.
- Recent post-set feedback summaries.

Watchpoint:
- Native MediaPipe landmark extraction is not wired yet. `lib/formAnalysis.ts` accepts `pose_landmarks`; attach the native analyzer there when added.

## 3. Nutrition tracker + coaching

Implemented core:
- Routes: `app/nutrition/index.tsx`, `log.tsx`, `plan.tsx`, `targets.tsx`, `settings/nutrition-preferences.tsx`
- Client: `contexts/NutritionContext.tsx`, `lib/nutrition.ts`
- Backend: `supabase/functions/food-log`, `nutrition-targets`, `meal-plan`, `daily-feedback`
- Schema: `supabase/migrations/0033_nutrition_system.sql`

Capabilities:
- Food logs with calories, protein, carbs, fat, fiber, saturated fat.
- Training/rest macro targets in grams.
- Weekly meal plans with foods, portions, day split, meal slots.
- AI generation fallback to deterministic skeleton.
- End-of-day gap summaries and green/yellow/red nutrition grading.

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
