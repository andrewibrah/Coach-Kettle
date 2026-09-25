# Coach Kettle 1.0.2 — backend deploy runbook

Target: the linked Supabase project (**production**). Run from the repo root on branch `1.0.2` at the release HEAD.
Order (plan §9): additive migrations → Edge Functions → app build. Deploy the backend **before** shipping the 1.0.2 build; the live 1.0.1 app stays compatible with the new backend.

**Requires Supabase CLI ≥ 2.117.** Check with `supabase --version` first; upgrade if older.

**If `supabase db push` (or any command that logs in) times out or hangs creating a login
role,** check whether the project is paused before assuming a network problem:

```sh
supabase projects list -o json
```

If the target project's status is `INACTIVE`, it is paused — restore it from the Supabase
Dashboard (Project → Settings → General → Restore project) before retrying.

**Precondition for `20260924000100` (the nutrition-targets service_role REVOKE):** run
`supabase functions list` **before** `db push` and confirm `nutrition-targets` is already at
version ≥ 6 (the atomic-RPC-only version). If it is still at v5 or lower, the live function may
still perform a direct table write that this migration revokes, and saves would start failing.
Deploy `nutrition-targets` to v6+ first, confirm the version, then run `db push`.

## Pre-release read-only production check (run BEFORE release)

Run these in the Supabase SQL editor (or `psql` with a read-only role). They read the catalog
only and change nothing. Source: `.superpowers/sdd/release-1.0.2-gj/g11-inventory.md` §0.

```sql
-- Every FK that points at auth.users, with its delete rule
SELECT c.conrelid::regclass AS tbl, a.attname AS col, c.conname,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
            WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
ORDER BY 1;

-- Confirm workouts / workout_log / chats really have user_id today
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('workouts','workout_log','chats') AND column_name='user_id';
```

- **First query:** any `NO ACTION` or `RESTRICT` row outside the tables `delete_user_data` purges
  would make `auth.admin.deleteUser` fail, and deletion returns `AUTH_DELETE_FAILED`. Fix that
  FK before release.
- **Second query:** it must return **3 rows** (`workouts`, `workout_log`, `chats`). A missing
  row means `delete_user_data` cannot purge that table. The user is told their data is gone,
  but those rows stay, and the function log shows
  `delete-account: purge_skipped tables=<names>`. Do not release until that is resolved.

## Commands to run, in order

Run each line separately — do not chain them. Confirm each step's output matches expectations
before moving to the next.

```sh
supabase migration list
```

Compare the pending list against the migration table below.

```sh
supabase db push --dry-run
```

Review the exact SQL that will run. Confirm it matches the 3 new migrations (plus anything
already pending from the prior 1.0.2 patch-audit lanes) and nothing else.

```sh
supabase db push
```

Answer `Y` only after the dry run matched. If it asks for the database password, enter it at the
prompt (or `export SUPABASE_DB_PASSWORD=…` in your shell first; never commit or paste it).

```sh
supabase functions deploy body-metrics
supabase functions deploy chat
supabase functions deploy coach
supabase functions deploy daily-feedback
supabase functions deploy delete-account
supabase functions deploy meal-plan
supabase functions deploy nutrition-analyze
supabase functions deploy revenuecat-webhook
supabase functions deploy terms-acceptance
```

Deploy one at a time so a failure is attributable to a single function. **`terms-acceptance`
must be deployed before the 1.0.2 build is submitted for review** — otherwise every new 1.0.2
install loops at the privacy gate (an old server compares the latest acceptance row with `===`
against `1.0.0`, which a 1.0.2 client recording `1.1.0` can never satisfy).

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
| 20260924000100_revoke_service_role_target_writes | **privilege narrowing (non-destructive to data)** | revokes INSERT/UPDATE/DELETE/TRUNCATE on nutrition_target_sets / nutrition_target_day_overrides from service_role (SELECT kept). **Precondition:** `supabase functions list` must show `nutrition-targets` at version ≥ 6 (the atomic-RPC-only version) **before** this runs — see the precondition note above. Saves go through the SECURITY DEFINER `save_nutrition_target_set_atomic`, which is unaffected by the REVOKE because it runs as its owner. |
| 20260924000400_fix_exercise_degree_mojibake | **data backfill (idempotent UPDATE of 4 seed rows by slug)** | replaces `в°` with `°` in 4 exercise names (sled-45-calf-press, sled-45-leg-press, sled-45-leg-press-back-pov, sled-45-leg-wide-press). Re-running is a no-op once the names are already correct. |
| 20260924000900_delete_user_data | **additive (new SECURITY DEFINER function, EXECUTE → service_role only)** | `delete_user_data(uuid)` purge function used by the new `delete-account` function. Touches no data at migration time — it only creates the function. |

None of the migrations in this pass DROP or DELETE user data at migration time.

## Functions (deploy set, diff vs the last deployed commit `667e8d1`)

Deploy: **body-metrics, chat, coach, daily-feedback, delete-account (NEW), meal-plan,
nutrition-analyze, revenuecat-webhook, terms-acceptance.**

- **delete-account** is new. It is set to `verify_jwt = false` in `config.toml`, like the other
  functions listed there (functions with no `config.toml` entry, such as body-metrics and
  nutrition-analyze, keep the platform default). The handler verifies the bearer itself via
  `auth.getUser()` on the anon client and returns its own 401. OPTIONS → 200; POST without
  auth → 401.
- **daily-feedback** and **meal-plan**: only their imported `_shared/nutritionTargetResolution.ts`
  changed, and only by a comment. Deploying them keeps source and deployment identical; this is
  harmless, not a behavior change.
- **food-barcode** is unchanged in this pass (still GET-only; GET without auth → 401) and is not
  in the deploy list above, but its read-back line is kept below so the full function surface is
  checked in one pass.

Secrets needed:
- Existing (already set; confirm present, never re-paste values): `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`.
- **New, for Sign in with Apple token revocation** (optional — without them, account deletion
  still works, but Apple tokens aren't revoked and the log shows `apple_revoke_failed
  reason=missing_secret`): `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`.

  ```sh
  supabase secrets set APPLE_TEAM_ID=<10-char Team ID>
  supabase secrets set APPLE_KEY_ID=<10-char Key ID of a Sign in with Apple key>
  supabase secrets set APPLE_CLIENT_ID=com.coachkettle.coachkettle
  supabase secrets set APPLE_PRIVATE_KEY="$(cat /path/to/AuthKey_<KEYID>.p8)"
  ```

  Never paste secret values into chat, a commit, or this file. `supabase secrets list` shows
  names only — use it to confirm what's already set before deciding what's missing.

## Read back (no token needed, writes nothing)

```sh
supabase migration list    # every local migration, including the 3 new ones, should show a remote timestamp
supabase functions list    # confirm nutrition-targets >= 6 (precondition), and a bumped version on each function just deployed
REF=$(cat supabase/.temp/project-ref)
for fn in body-metrics chat coach daily-feedback delete-account meal-plan nutrition-analyze revenuecat-webhook terms-acceptance; do
  printf '%-20s OPTIONS=%s POST=%s\n' "$fn" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS https://$REF.supabase.co/functions/v1/$fn)" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://$REF.supabase.co/functions/v1/$fn)"
done
# food-barcode is GET-only; unauthenticated GET should be 401, not POST
printf '%-20s OPTIONS=%s GET=%s\n' food-barcode \
  "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS https://$REF.supabase.co/functions/v1/food-barcode)" \
  "$(curl -s -o /dev/null -w '%{http_code}' https://$REF.supabase.co/functions/v1/food-barcode)"
```
Expect OPTIONS 200/204 and POST 401 for every function in the main loop, and OPTIONS 200/204 +
GET 401 for `food-barcode`.

Do **not** run `scripts/verify-body-metrics-persistence.mjs` against production — it targets a
LOCAL disposable stack only (see `QA_PACK.md`, "Disposable-stack runs"). R4 stays
FIXED-UNVERIFIED against production until that local run happens.

## Roll forward, not back

Once the backend is deployed, fix bugs **forward**: patch on `1.0.2`, test, and redeploy the
one affected function. Never roll back as a reflex.

**Never roll these back:**
- **`terms-acceptance`: never redeploy the `667e8d1` version (or anything older) once any
  1.0.2 user has accepted privacy 1.1.0.** The old code compares only the latest acceptance
  row with `=== "1.0.0"`. Every user who recorded `(1.0.0, 1.1.0)` would be asked to accept
  again. Their re-accept posts the same pair, which is a duplicate no-op, so they loop forever
  at a gate they can't dismiss (Decline only signs them out).
- **`delete-account`: never remove or disable it once the 1.0.2 build is live.** The in-app
  "Delete account" entry calls it, and App Store Guideline 5.1.1(v) requires in-app deletion
  to work. If it has a bug, deploy a fix.

**Don't roll back below this release unless it is the last resort.** An older version still
runs, but it brings back a problem this release fixed:
- `body-metrics`: back to the service-role client, undoing the least-privilege fix.
- `chat`, `coach`: back to logging (and for coach, returning) raw OpenAI error bodies.
- `revenuecat-webhook`: stops acking events for deleted users (FK 23503), so RevenueCat
  retries them indefinitely.
- `nutrition-analyze`: loses the 422 "unreadable" status and the confirm-branch 404/400
  mapping, so the 1.0.2 client's distinct error messages fall back to generic ones.

**Safe to redeploy an earlier version from git** (in a scratch worktree, then
`supabase functions deploy <fn>`) for a function-local bug, as long as that version's
request/response contract matches what the 1.0.1 and 1.0.2 clients send:
- Every function **not** changed in `667e8d1..1.0.2`: chat-history, chats, default-templates,
  entitlements, exercise-library, food-barcode, food-log, health, history, iap, log-set,
  next-set, notifications, observability, parse, pr-tracking, profile, programming,
  resting-hr, workout-templates.
- `daily-feedback`, `meal-plan`: only a comment changed in their shared import in this release.
- `nutrition-targets`: only at **v6 or later**. v5 and older write the target tables directly,
  and migration `20260924000100` revoked those writes, so saves would fail.

**Migrations are one-way.** They are additive or privilege-narrowing. Do not drop
`delete_user_data`, the new RPCs or tables, and do not re-grant the service_role write
privileges that `20260924000100` revoked. Do not delete production rows. Fix schema problems
with a new forward migration.
