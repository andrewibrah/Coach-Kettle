# Coach Kettle 1.0.2 — backend deploy runbook

Target: the linked Supabase project (**production**). Run from the repo root on branch `1.0.2` at the release HEAD.
Order (plan §9): additive migrations → Edge Functions → app build. Deploy the backend **before** shipping the 1.0.2 build; the live 1.0.1 app stays compatible with the new backend.

## The one line

```sh
supabase db push && for fn in nutrition-targets meal-plan daily-feedback profile body-metrics food-barcode notifications programming exercise-library coach; do supabase functions deploy "$fn" || { echo "DEPLOY FAILED: $fn"; break; }; done
```

- `db push` lists the pending migrations and asks `[Y/n]`. Check the list against the table below before answering Y. If it asks for the database password, enter it at the prompt (or `export SUPABASE_DB_PASSWORD=…` in your shell first; never commit or paste it).
- Functions deploy one at a time and the loop stops at the first failure.

## Migration queue (local-only as of 2026-09-23; some 0904/0906 files may already be applied — `db push` skips those)

| Migration | Class | Notes |
|---|---|---|
| 20260904000000_full_body_upper_lower_templates | additive (seed INSERT) | new program_templates rows |
| 20260904000100_auto_start_rest_timer_pref | additive | new column on notification_preferences |
| 20260904000200_workout_program_source | additive + **backfill** | new columns; `UPDATE workout_programs SET start_date = created_at::date WHERE start_date = CURRENT_DATE` |
| 20260906010000_barcode_food_cache | additive | new tables barcode_foods / barcode_lookup_usage (RLS on, REVOKE anon/authenticated), quota function |
| 20260909000100_atomic_onboarding | additive | onboarding_receipts table + `complete_onboarding_atomic` RPC (EXECUTE → authenticated; called by the profile function's new action) |
| 20260914000100_atomic_nutrition_target_sets | additive + **privilege narrowing** | new columns + `save_nutrition_target_set_atomic`; revokes direct table writes from PUBLIC/anon/authenticated only (service_role kept so the live function keeps working until redeployed) |
| 20260914000200_atomic_meal_plan_replacement | additive | `replace_meal_plan` RPC, service_role only |
| 20260919000100_atomic_coach_persistence | additive | `persist_coach_feedback` RPC, service_role only |
| 20260920000100_coherent_meal_plan_read | additive | `read_meal_plan` RPC |
| 20260920000200_coherent_nutrition_target_read | additive | `read_nutrition_target_set` RPC |
| 20260921000100_body_metrics_merge_comment | comment only | `COMMENT ON TABLE body_metrics` |
| 20260924000100_revoke_service_role_target_writes | **privilege narrowing** | revokes INSERT/UPDATE/DELETE/TRUNCATE on nutrition_target_sets / nutrition_target_day_overrides from service_role (SELECT kept). Requires nutrition-targets v6 (atomic RPC only) live, as it is; saves go through the SECURITY DEFINER `save_nutrition_target_set_atomic` |

No DROP / DELETE / TRUNCATE of user data. No destructive schema change.

## Functions (changed vs commit 9931ce3)
nutrition-targets, meal-plan, daily-feedback (new `_shared/nutritionTarget*`, `mealPlanValidation`), profile (new `complete_onboarding_atomic` action; legacy `batch_onboarding` unchanged for 1.0.1), body-metrics, food-barcode (`_shared/openFoodFacts`, `verify_jwt=false` in config.toml — it does its own 401), notifications, programming, exercise-library (unpaginated default kept for 1.0.1), coach.
Secrets needed (all present by name): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.

## Read back (no token needed, writes nothing)

```sh
supabase migration list    # every local migration should show a remote timestamp
supabase functions list    # versions above: coach 26, profile 23, daily-feedback 8, exercise-library 5, nutrition-targets 5, meal-plan 4, notifications 4, body-metrics 4, programming 8, food-barcode 1
REF=$(cat supabase/.temp/project-ref); for fn in nutrition-targets meal-plan daily-feedback profile body-metrics food-barcode notifications programming exercise-library coach; do printf '%-18s OPTIONS=%s POST=%s\n' $fn "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS https://$REF.supabase.co/functions/v1/$fn)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://$REF.supabase.co/functions/v1/$fn)"; done
```
Expect OPTIONS 200/204 and POST 401 for every function.

Do **not** run `scripts/verify-body-metrics-persistence.mjs` against production (R4 stays FIXED-UNVERIFIED until a disposable stack exists).

## Rollback
Prefer redeploying the previous function version from git (`git checkout 9931ce3 -- supabase/functions/<fn>` in a scratch worktree, then deploy). Migrations are additive; do not drop the new tables or RPCs, and do not delete production rows.
