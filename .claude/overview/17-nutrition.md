# Nutrition System

> Food logging, daily targets, weekly meal plans, daily summaries.

---

## Domains

| DB Table | Purpose |
|---|---|
| `foods` | Catalog. `is_global=TRUE` = seeded global; `is_global=FALSE` = user-created. RLS scoped accordingly. |
| `food_logs` | Per-user intake log. Macros snapshotted at log time so totals don't shift if the food is later edited. |
| `nutrition_targets` | Per-user target macros split by training-day vs rest-day. Derived from Mifflin-St Jeor BMR → activity TDEE → goal adjustment. |
| `meal_plans` | Weekly meal plan envelope (1 active per `week_start_date`). |
| `planned_meals` | Individual meals inside a plan. Items in JSONB (3–5 foods per meal). |
| `daily_nutrition_summaries` | Per-user per-day snapshot of logged totals vs targets + color grade. |

## RPC

- `get_food_daily_totals(p_user_id, p_date)` — live totals for a date.

## Edge Functions

| Function | Method | Action |
|---|---|---|
| `food-log` | GET/POST | day / week totals, search_foods, log/update/delete entry, create_food |
| `nutrition-targets` | GET/POST | fetch / derive (BMR→TDEE→macros) / override |
| `meal-plan` | GET/POST | fetch active plan + meals, generate / recalibrate (AI via OpenAI; falls back to deterministic skeleton if no key) |

## Client API

`lib/nutrition.ts` — thin fetch wrappers + typed responses.

## State

`contexts/NutritionContext.tsx` exposes:
- `loading`, `date`, `entries`, `totals`, `targets`, `mealPlan`
- `refresh()`, `logFood(input)`, `deleteEntry(id)`

Refresh model:
- Initial load on auth ready.
- Day-boundary refresh on app foreground when date rolls.
- Optimistic refresh after every mutation.

## Macro Grading

Live in `daily-feedback` edge function (`gradeNutrition`):
- Weighted score: cal 25% / protein 30% / carbs 15% / fat 15% / fiber 10% / saturated 5%.
- Color: ≥80 green, ≥60 yellow, else red.
