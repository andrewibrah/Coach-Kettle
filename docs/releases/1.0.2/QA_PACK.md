# Coach Kettle 1.0.2 — QA pack (gates G01–G12)

Written after the G–J patch pass (commits `63cf555`, `54ecb24`, `5014755`, `c851cc5`, `dc91335`
on branch `1.0.2`, base `667e8d1`). **No simulator or mobile automation is available in this
session** (no Xcode on this Mac, `xcrun simctl` is missing), so every device gate below is a
procedure with an empty `Result` / `Evidence` / `Notes` field for Andrew to fill in. Nothing
here should be read as a PASS until Andrew runs it.

Fill in `Result: PASS / FAIL / BLOCKED`, `Evidence:` (screenshot path, SQL output, or function
log line) and `Notes:` for every gate. Leave a gate `BLOCKED` if you could not run it rather than
guessing.

Account types referenced throughout:
- **new/unaccepted** — a fresh sign-up, never accepted any terms/privacy version.
- **existing 1.0.1** — an account created and last used on the live 1.0.1 build (has a
  `user_terms_acceptance` row of `terms 1.0.0 / privacy 1.0.0` and no AI-disclosure consent).
- **free sandbox** / **Pro sandbox** — StoreKit sandbox testers, one with no active
  entitlement and one with an active Pro subscription.
- **disposable A / disposable B** — two throwaway accounts used only for cross-user isolation
  checks (body metrics, delete-account), never accounts with real data.

---

## G01 — Launch

1. Cold-launch the 1.0.2 build from a terminated state (production build, no Metro attached).
2. Warm-launch (background → foreground) after a cold launch.
3. Force-quit mid-network-call (e.g. during Home load) and relaunch.
4. Trigger a deliberate crash-adjacent state: airplane mode before first load, then restore.

Expected: cold launch reaches Home or onboarding without a white screen or JS error overlay;
warm launch resumes state; airplane-mode launch shows a retry/offline affordance, not a crash.
Readback: none (no persistence claim here) — visual/behavioral only.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G02 — Upgrade (1.0.1 → 1.0.2)

1. Start from a device/simulator with the 1.0.1 build installed and an existing account with
   workout history, nutrition targets, a program, and PR data.
2. Install the 1.0.2 build over it (do not uninstall/reinstall — this must be an upgrade).
3. Launch. Confirm the privacy 1.1.0 gate appears once (see G11 below) and, after accepting,
   confirm workout history, nutrition targets, program state and PRs are all still present.
4. Confirm the existing entitlement (Pro or free) carried over.

Expected: no data loss, no forced re-onboarding, privacy gate shown exactly once.
Readback: History tab shows pre-upgrade workouts; Nutrition targets screen shows the same
values as before upgrade; Settings → Subscription shows the same entitlement state.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G03 — Onboarding / auth

1. New/unaccepted account: complete onboarding end to end (units, PRs, goals, program setup).
2. At each onboarding step, tap **Back**, then **Skip** (where offered), then resume forward.
3. Kill the app mid-flow (after at least one step is saved) and relaunch; confirm resume lands
   on the correct step with prior answers intact — repeat at 3 different steps (early, PR entry,
   final review).
4. Sign out and sign back in with the same credentials (email/password, and Apple/Google if
   available) — confirm no duplicate onboarding.
5. **Settings → Delete account** (disposable account only — see the "New device checks" DA-01
   procedure below; do not run this against an account with real data).

Expected: no step loses data, Back never double-pops, resume always lands on the last completed
step (not before it), a killed app mid-flow resumes correctly on relaunch.
Readback: relaunch after kill — the onboarding screen shown matches the last answered step, and
previously entered values are pre-filled where the screen supports it.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G04 — Workout logging

1. Blank start: Home → generic Start → log 2+ sets → Finish → History shows it after relaunch.
2. **QA-06 (this pass, task I3): planned-day start from Home.** On an account with an active
   program and a scheduled training day today, tap the Home program-hero card's Start. Confirm
   it starts with that day's assigned exercises/sets pre-populated (not a blank/named session).
3. On a rest day, or an account with no program, tap the same Home Start card and confirm it
   falls back to the generic blank-name flow (not an error, not a blank program day).
4. Add/edit/remove sets mid-session; background the app during an active rest timer and return;
   confirm the timer kept counting.
5. Cancel a workout in progress; confirm no partial row was saved.
6. Kill the app mid-workout with unsaved sets; relaunch; confirm the draft is recoverable.
7. Go offline (airplane mode) mid-log, log a set, restore network; confirm it syncs without
   duplicating.

Expected: G04-1/4/5/6/7 as before; G04-2/3 are new behavior from this pass (`lib/programSchedule.ts`
`resolveHomeStartDecision`/`resolveProgramDayItems`, wired into `app/(tabs)/index.tsx`
`handleStartFromHome`).
Readback: History tab after relaunch shows the finished workout with the exercises/sets that
were actually logged; for G04-2, the started session's exercise list matches the program day's
assigned lifts, sets and rep targets in `program_exercises` for that user/day.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G05 — Nutrition

1. Manual entry: log a food with all four macros; confirm it appears in today's totals.
2. **Text analysis error classes (task I4, this pass):** put the device in airplane mode, then
   submit a text description for AI analysis. Expected message class: "temporarily unavailable"
   (not the old generic "Could not analyze" string). Restore network.
3. **Photo analysis error classes:** submit a genuinely unreadable/gibberish photo (e.g. a blank
   or solid-color image) for AI analysis. Expected message class: "we couldn't read that — try a
   clearer photo or more detail" (distinct from the network-unavailable message in step 2).
4. Barcode scan: a recognized product, an incomplete product, and a not-found barcode — confirm
   three distinct outcomes (this was already correct pre-pass; confirm no regression).
5. **Confirm-branch expiry (I4, flagged as a known, unfixed gap):** analyze a food photo/text,
   then wait past the confirm window (or otherwise force a stale/expired analysis id) before
   confirming. Expected (per the report): this still shows one generic "Could not add this food
   log…" message for 404/409/410 alike — record what actually appears; this is not required to
   pass, just to confirm the documented gap didn't get worse (e.g. a crash).
6. Edit and delete a logged entry; confirm totals update.
7. Meal plan: generate a weekly plan (Pro sandbox only), confirm 7 days × correct meal slots.
8. Cross midnight (or change device clock/timezone) and confirm the nutrition day rolls over
   without losing the prior day's log.

Expected: error message shown to the user matches its class (unavailable vs. unreadable vs.
not-deployed vs. generic), never the same string for airplane-mode and a bad photo.
Readback: Nutrition day view after relaunch shows the logged entries and correct running totals
for the day they were logged against.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G06 — Coach / programming / Form Check

1. Coach chat: ask a question referencing recent workouts; confirm a relevant, evidence-cited
   response (no "Great job!" boilerplate — every line must cite a specific hit or miss per
   CLAUDE.md).
2. Daily feedback: trigger a bad day (miss a scheduled workout or log red-nutrition) and a good
   day; confirm harshness level moves in the expected direction (see G07 below for persistence).
3. Programming: start a new linear program, confirm week-1 intensity and that week 4 (or the
   configured deload week) shows reduced intensity/volume.
4. Form Check row on the **More/Settings** screen and inside the feature itself: confirm the
   copy reads "Video analysis coming soon" and that previously recorded rows (if any) are still
   listed with metrics withheld.
5. **Free-user Form Check upgrade CTA (task H, this pass):** as a free-sandbox account, open Form
   Check and confirm it shows only benefits that ship today plus a 44pt "Upgrade to Pro" button
   that opens the paywall. As a Pro-sandbox account, confirm the CTA is absent.
6. Paywall feature list: confirm it lists only real, shipping Pro features (no fatigue
   monitoring or 1RM-projection claims — `constants/subscription.ts` description was corrected
   this pass to "Strength progression with e1RM and volume per session").

Expected: no fabricated video-analysis claim anywhere; paywall/Form Check copy matches what
actually ships.
Readback: Progress → Strength screen (Pro) shows per-session top e1RM and volume — confirm that
is genuinely what's behind `advancedAnalytics`, matching the corrected paywall description.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G07 — History / progress / library

1. Log a body-metrics entry (weight + at least one measurement) and a body photo; relaunch;
   confirm both persist and the photo thumbnail still loads (exercises the JWT-signed URL path
   from task I1 — body-metrics now runs entirely on the caller's JWT, no service-role client).
2. **Reflection persistence (task E carryover, re-verify after this pass's changes):** write a
   daily reflection, navigate away to another tab, return to the reflection screen — confirm it
   still shows. Then relaunch the app entirely and confirm it still shows.
3. Exercise library: search, open an exercise's detail, confirm content/instructions render.
4. **Exercise-name mojibake fix (task L, this pass):** in the exercise library, search for or
   open the 4 corrected seed exercises — confirm the names read literal `°` (degree sign), not
   `в°`/`Â°`/mangled characters:
   - sled 45° calf press
   - sled 45° leg press
   - sled 45° leg press (back pov)
   - sled 45° leg wide press
5. Charts (strength progress, body-metrics trend): confirm data points match logged values.

Expected: 07-1/2 both survive navigate-away AND full relaunch (two separate checks, don't skip
the relaunch one). 07-4 shows a real ° character everywhere the name appears (list, detail,
history reference).
Readback: same reflection text visible after relaunch; body-metrics chart point matches the
value entered; exercise names in-app match the corrected strings above (can cross-check against
`SELECT slug, name FROM exercises WHERE slug IN (...)` on the disposable stack — see below).

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G08 — Settings / notifications

1. Notification preferences: toggle a reminder on/off, confirm it persists across relaunch and
   that the scheduled local notification actually fires (or is cancelled) accordingly.
2. **More-screen Settings gear (task H, this pass):** on the More tab, confirm a gear icon
   appears in the header (`ScreenHeader` `rightElement`), is at least 44×44pt tappable, and
   navigates to Settings.
3. Deny notification permission at the OS level, then toggle a reminder in-app; confirm an
   honest "permission denied, open Settings" affordance rather than a silent no-op.

Expected: gear icon present and reachable in one tap; permission-denied state is explicit, not
silent.
Readback: after toggling and relaunching, the preference screen still reflects the last choice
(check against local notification preferences storage / server row if applicable).

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G09 — Accessibility

1. **44pt targets (task G, this pass):** using the Simulator's Accessibility Inspector (or a
   physical device), measure tap targets on: DeleteWorkoutModal delete button, WorkoutTable
   swipe-delete action, WorkoutBottomBar "End" pill, exercise-template delete button
   (`app/settings/templates.tsx`), the More-screen Settings gear, and the Form Check "Upgrade to
   Pro" button. All must be ≥44×44pt.
2. **Danger-button contrast (task G, this pass):** visually confirm text/icons on every filled
   danger surface listed in the task-G report are legible (white-on-`dangerFill`, not the older
   `#EF4444` low-contrast red) — Delete Workout modal, swipe-delete, active End pill, template
   delete, Coach error banner, Nutrition error banner, 5 Progress-tab error cards, onboarding
   error icon, media-picker error badge/remove button.
3. **Legal gate cannot be dismissed (task H, this pass):** open the terms/privacy acceptance
   gate (new/unaccepted account, or an existing 1.0.1 account re-prompted for privacy 1.1.0).
   Attempt to swipe it away, attempt Android hardware back (if testing Android — this app is
   iOS-first, so confirm there is no gesture-based dismiss on iOS either) — confirm it cannot be
   dismissed without Accept or Decline.
4. **Reader-mode Close from a deep link (task H, this pass):** open Terms or Privacy from
   Settings (reader mode, not the gate). Confirm a 44pt Close control is present and swipe
   dismissal also works. Then deep-link into the reader (e.g. from a push notification or
   external link if one exists) and confirm Close lands on the main tabs, not a dead end.
5. **Nutrition preference pills as VoiceOver checkboxes:** turn on VoiceOver, navigate to the
   dietary-preference pills (onboarding or Settings), confirm each is announced as a checkbox
   with its checked/unchecked state, not as a plain button or label.
6. **Largest Dynamic Type** on body metrics entry screen and the exercise library list/detail —
   confirm no truncated/overlapping text and controls remain tappable.
7. **VoiceOver full traversal** of: the four main tabs, the entire onboarding flow start to
   finish, the paywall, and the legal gate. Confirm every interactive element is reachable and
   has a meaningful label (no "button 1 of 1" style gaps).
8. Reduce Motion: enable it and confirm animated transitions (rest timer, PR confetti) degrade
   gracefully rather than breaking layout.

Expected: every 44pt target measured ≥44×44; no low-contrast danger text; the legal gate is
truly modal (no swipe/back escape); reader Close always reaches tabs; preference pills read as
checkboxes; Dynamic Type and VoiceOver traversal have no dead ends.
Readback: none beyond direct observation — this gate is inherently device/AX-tree evidence.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G10 — Commerce

1. Sandbox purchase: buy Pro from the paywall, confirm entitlement flips immediately.
2. Cancel/refund in the sandbox, confirm entitlement reverts after the next check.
3. Restore purchases on a second sandbox device/account with an existing purchase.
4. Confirm StoreKit shows the correct localized price and the paywall's dismiss-only CTA says
   "Continue"/"Continuing…" (not implying a trial starts) — pre-existing behavior, re-verify no
   regression from this pass's `constants/subscription.ts` copy edit.
5. **Paywall real-features-only check (task H, this pass):** confirm every bullet on the paywall
   matches something that actually ships (see G06-6 above — same check, cross-reference here).

Expected: entitlement state always reflects the sandbox's true subscription status; no purchase
copy overclaims.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G11 — Privacy / security

1. **Privacy 1.1.0 gate, existing 1.0.1 account (task G11b, this pass):** using an existing
   1.0.1-era account (accepted terms 1.0.0 / privacy 1.0.0, on device or restored from backup),
   upgrade to 1.0.2 and launch. Confirm the legal gate appears exactly once, shows the new "AI
   Features (OpenAI)" disclosure card and `CONSENT_ACCEPT_TEXT` above Accept. Accept it, relaunch
   the app twice more, and confirm the gate does **not** reappear (this is the specific bug this
   pass fixed — the old code compared only the latest row with `===`, which could loop forever).
2. **Account deletion (tasks G11a/G11b, this pass) — DISPOSABLE ACCOUNT ONLY, never a real one:**
   see the dedicated DA-01 through DA-06 procedure below.
3. Cross-account isolation: as disposable user A, confirm you cannot see disposable user B's
   workouts, body photos, or nutrition logs anywhere in the app.
4. Confirm no secret (API key, JWT, service-role key) appears in any client-visible log, error
   toast, or network response body during normal use or induced-failure testing (airplane mode,
   bad input).
5. Confirm the app's declared permission strings (camera, photo library, notifications, health if
   applicable) match what the app actually accesses, and that denying each permission produces an
   honest fallback rather than a crash.

Expected: G11-1 shows the disclosure once and never loops; G11-2 fully removes the account (see
DA procedure); G11-3 shows zero cross-user leakage.
Readback: `user_terms_acceptance` row for the account shows `(terms_version, privacy_version) =
('1.0.0','1.1.0')` after accepting — confirm via the disposable-stack SQL section below, or by
never re-seeing the gate across 3+ relaunches.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

### DA-01 through DA-06 — Account deletion (Settings → Delete account), disposable account only

Use **disposable account only**. Do not run this against Andrew's real account or any account
with data you need to keep.

1. **DA-01 — reachability:** Settings → confirm a "Delete account" row exists, is styled with a
   danger token (not a hardcoded hex), and is ≥44pt tall.
2. **DA-02 — typed confirmation gate:** tap it, confirm the delete screen requires typing the
   literal string `DELETE` before the submit button enables. Typing `delete`, `Delete`, or
   leaving it blank must keep the button disabled.
3. **DA-03 — re-authentication:**
   - **Password account:** confirm a password field appears; wrong password shows an inline
     error, makes no deletion call, and the session is unaffected (still signed in).
   - **Apple account:** confirm it triggers a fresh `AppleAuthentication.signInAsync` (no
     password field); a cancelled Apple sheet aborts with no deletion.
   - **Google account:** same shape as Apple; cancel/dismiss aborts with no deletion.
   - **Wrong-account re-auth:** deliberately re-authenticate with a *different* account's
     credentials than the one being deleted. Confirm the app detects the mismatch, refuses the
     deletion, and restores the original session (does not sign you into the other account).
4. **DA-04 — success path:** with a valid re-auth and `DELETE` typed, submit. Confirm: (a) the
   app signs out and lands on `/auth/sign-in`; (b) attempting to sign back in with the deleted
   account's original credentials fails, or a new sign-up with the same email creates a genuinely
   fresh account (no leftover data); (c) in the RevenueCat dashboard, the deleted user's customer
   record is gone (or shows as deleted); (d) in the Supabase Storage dashboard, the
   `workout-media/{uid}/` folder for that user is empty.
5. **DA-05 — Apple token revocation (best-effort):** if `APPLE_TEAM_ID`/`APPLE_KEY_ID`/
   `APPLE_CLIENT_ID`/`APPLE_PRIVATE_KEY` secrets are set (see the runbook), confirm the function
   log for the deletion does **not** contain `apple_revoke_failed`. If those secrets are not yet
   set, expect `apple_revoke_failed reason=missing_secret` in the log and confirm deletion still
   succeeds (Apple revocation is best-effort by design).
6. **DA-06 — idempotent retry:** if feasible, attempt the deletion flow a second time against an
   already-deleted account's stale session/token; confirm it fails safely (401) rather than
   double-deleting or crashing.

Expected: DA-02/03 block deletion on any invalid input; DA-04 is the only path that actually
removes the account, and it removes it everywhere (auth, DB, storage, RevenueCat).
Readback: sign-in attempt with old credentials fails; RC dashboard customer entry gone; Storage
dashboard folder empty; (optional, disposable-stack only) `SELECT * FROM profiles WHERE user_id =
'<deleted-uid>'` returns zero rows.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

## G12 — Submission

1. Confirm the marketing version is `1.0.2` and the build number is what Andrew intends to
   submit (check `app.json` / Xcode project against the actual archived build).
2. Re-run the full verification suite (lint, tsc, node --test, deno check — see below) against
   the exact commit being archived, and paste the counts here.
3. Confirm support and privacy-policy URLs in App Store Connect point at the current, updated
   privacy 1.1.0 text (task G11b rewrote `constants/legal.ts` `PRIVACY_POLICY`, `privacy.html`,
   `support.html`).
4. Prepare redacted screenshots (no real user data visible) for the submission.
5. Release notes: confirm they don't overclaim (no "AI form analysis" claim — Form Check is
   "coming soon" only).
6. Confirm the backend deploy (migrations + functions, see `DEPLOY_RUNBOOK.md`) is done and
   read-back-verified **before** the 1.0.2 build is submitted — in particular `terms-acceptance`
   must be live before submission, or every new 1.0.2 install loops at the privacy gate.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

---

## Restore settings checklist

After running the accessibility and permission-denial checks above, restore the test
device/simulator to its normal state before continuing other QA or handing it back:

- [ ] Text size back to the system default (undo largest Dynamic Type).
- [ ] Dark mode / appearance back to its original setting.
- [ ] VoiceOver turned off.
- [ ] Reduce Motion turned off.
- [ ] Notification permission restored to whatever state existed before the denial test (or
      re-granted, if you want future tests to see the granted path).

---

## Disposable-stack runs (LOCAL stack only — never production)

**Every command in this section targets a LOCAL `supabase start` stack. Do not point any of
these at the production project. `SUPABASE_DB_PASSWORD`, project refs, and any `--project-ref`
flag below refer only to the local stack unless stated otherwise.**

```sh
supabase start
supabase db reset      # applies every migration, including the 3 new ones, to the local stack
```

The scripts below fall into two different families — read this before running anything:

- **Plain `.sql` files** (`onboarding_completion.sql`, `body_metrics_isolation.sql`,
  `delete_user_data.sql`, `nutrition_target_service_role_revoke.sql`, `exercise_mojibake.sql`,
  `nutrition_target_read.sql`, `nutrition_target_sets.sql`, `meal_plan_read.sql`,
  `meal_plan_replacement.sql`, `coach_persistence.sql`) are self-contained, wrap in
  `BEGIN…ROLLBACK`, and can run with `psql` against the **local `supabase start` stack** (get its
  connection string from `supabase status`, the `DB URL` line).
- **`*_disposable.sh` / `*_concurrency.sh` scripts** (`coach_disposable.sh`,
  `meal_plan_disposable.sh`, `nutrition_target_sets_disposable.sh`,
  `delete_user_data_disposable.sh`, `onboarding_completion_concurrency.sh`,
  `nutrition_target_sets_concurrency.sh`) spin up their **own private, throwaway PG15 cluster on
  a local socket** — they do **not** touch the `supabase start` stack at all. Run them
  standalone, each with the env var(s) their header requires. This is intentional: they need
  privileges (creating roles, REVOKE/GRANT, raw sockets) that a shared local stack shouldn't be
  handed.

All of the below are marked **BLOCKED-until-run**.

### Plain SQL, against the local `supabase start` stack

```sh
DB_URL=$(supabase status -o json | jq -r '.DB_URL')   # or read it from `supabase status`

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/onboarding_completion.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/body_metrics_isolation.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/exercise_mojibake.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_target_read.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_target_sets.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_target_service_role_revoke.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/meal_plan_read.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/meal_plan_replacement.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/coach_persistence.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/delete_user_data.sql
```

Expected output for each: no `ERROR`, transaction rolls back cleanly (every script wraps its own
`BEGIN…ROLLBACK`), and for the ones with explicit `ASSERT`s (all of the above except
`meal_plan_replacement.sql`/`coach_persistence.sql`, which fail with a Postgres error on
mismatch), a clean exit with no `FAIL:`/`ASSERT` message. `nutrition_target_read.sql` and
`nutrition_target_sets.sql` require the atomic-save migrations (`0047`,
`20260914000100`, `20260924000100`) to already be applied — `db reset` handles that.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

### Standalone private-cluster scripts (do NOT point these at `supabase start`)

```sh
# Onboarding completion, concurrent-write races
ONBOARDING_TEST_DATABASE_URL=<disposable-only URL> ONBOARDING_TEST_CONFIRM_DISPOSABLE=YES \
  bash supabase/tests/onboarding_completion_concurrency.sh

# Coach persistence (spins its own PG15 cluster, then runs coach_persistence.sql +
# coach_concurrency.sh inside it)
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/coach_disposable.sh
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/coach_disposable.sh --red   # expect failure: RPC missing

# Meal plan replacement/read + concurrency (own PG15 cluster)
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/meal_plan_disposable.sh
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/meal_plan_disposable.sh --red   # expect failure

# Nutrition target sets + the new service_role revoke test (own PG15 cluster)
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/nutrition_target_sets_disposable.sh
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/nutrition_target_sets_disposable.sh --red        # expect failure: RPC missing
NUTRITION_DISPOSABLE_TEST=YES bash supabase/tests/nutrition_target_sets_disposable.sh --read-red    # expect failure: read RPC missing
# Concurrency variant needs its own explicit disposable socket/database/user/port — see the
# script header (supabase/tests/nutrition_target_sets_concurrency.sh) for the exact 4 env vars.

# delete_user_data (own PG15 cluster; stubs workouts/workout_log/chats per g11-inventory §0)
DELETE_USER_DATA_DISPOSABLE_TEST=YES bash supabase/tests/delete_user_data_disposable.sh              # expect exit 0
DELETE_USER_DATA_DISPOSABLE_TEST=YES bash supabase/tests/delete_user_data_disposable.sh --red        # expect failure: function missing
DELETE_USER_DATA_DISPOSABLE_TEST=YES bash supabase/tests/delete_user_data_disposable.sh --grant-red  # expect failure: authenticated can EXECUTE
```

Expected exit codes: `0` for the default mode of each script, non-zero (`3` for
`delete_user_data_disposable.sh`, or the script's own documented failure) for every `--red` /
`--grant-red` / `--read-red` mode — the failure modes are the proof that the migration's
privilege narrowing (or the RPC's existence) is actually load-bearing, not incidental.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:

### Real Edge → PostgREST body-metrics persistence check

`scripts/verify-body-metrics-persistence.mjs` is opt-in, destructive-on-disposable-only, and
never reads credential files. Read its full `HELP` text first:

```sh
node scripts/verify-body-metrics-persistence.mjs --help
```

Then run it with every required env var set explicitly (do not export a persistent shell
profile with these — set them inline for this command only):

```sh
CK_BM_CONFIRM=YES \
CK_BM_ENVIRONMENT=disposable-local \
CK_BM_URL=<local supabase start API URL, e.g. http://127.0.0.1:54321> \
CK_BM_TOKEN_A=<user A access JWT> \
CK_BM_TOKEN_B=<user B access JWT> \
CK_BM_USER_A=<user A uuid> \
CK_BM_USER_B=<user B uuid> \
CK_BM_DATES=2026-09-20,2026-09-21,2026-09-22 \
CK_BM_PUBLIC_KEY=<local anon key> \
  node scripts/verify-body-metrics-persistence.mjs
```

Expected: it proves sparse-write semantics (a blank field doesn't clobber an existing value) and
two-user isolation against the **real** Edge function → PostgREST path (not a mocked handler
test) — the local stack's `body-metrics` function must be served (`supabase functions serve
body-metrics --env-file .env.local`) for this to hit a live endpoint. Read the script's own exit
message for pass/fail; do not infer success from exit code alone without reading the reported
per-check detail.

Result: PASS / FAIL / BLOCKED
Evidence:
Notes:
