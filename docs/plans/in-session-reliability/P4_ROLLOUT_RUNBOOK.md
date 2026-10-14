# P4 rollout and recovery runbook

Scope: `20261008000300_session_operation_integrity.sql`, the `log-set`/`history` Edge functions, and the
P4 app build. Authorized human operators run every command; nothing here has been run against production.

## Why order matters

The migration is **not purely additive**:
- it revokes `INSERT/UPDATE/DELETE` on `workouts`/`workout_log` from `anon`/`authenticated`;
- it revokes the old `save_workout`/`delete_workout` RPCs;
- the only write path for both functions becomes `apply_workout_operation` (JWT-owned).

What the pre-P4 code does against the new schema:

| Component | Pre-P4 write path | After the schema push |
|---|---|---|
| `history` Edge | user client upserts `workouts` (1f77fe2^ history:115) | **fails** (permission denied) until the new Edge is deployed |
| `log-set` Edge | service role inserts `workout_log` (1f77fe2^ log-set:166) | keeps writing identity-free legacy rows that bypass the session fence |
| new `log-set`/`history` Edge on the **old** schema | call `apply_workout_operation` | **500 on every write** (RPC missing) |
| pre-P4 app build | posts identity-less sessions | new Edge returns 400; the session stays `pendingSync` on the device |

## Order (minimise every window)

0. Run the read-only pre-check against production and resolve every `ok = false` row first:
   `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prod_precheck_p4.sql`.
   It checks the known dependencies of 0100–0500:
   - required columns (including `workouts.user_id` and `workout_log.user_id`, which `remote_schema`
     may have dropped), tables and functions;
   - return types of the functions the migrations replace;
   - views that would block the `set_number` type change;
   - that no P4 objects exist yet;
   - that `pg_cron` is available and preloaded.

   It is a strong guard, not a full proof that the push succeeds. Run it as the same role the push
   uses: it reads `shared_preload_libraries`, which needs superuser or `pg_read_all_settings`, the
   same as 0500's pg_cron guard.
1. Confirm the new app build (P4 client) is released or ready. Its local-first writes never depend on
   the deploy succeeding.
2. In one maintenance step, back to back:
   1. `supabase db push` (0100 → 0200 → 0300 → 0400 → 0500). 0500 schedules the 24 h auto-close
      with pg_cron (job `expire-open-workout-sessions`, every 15 minutes).
   2. Immediately, from the **repo root** (the functions import `../../../lib` and `../../../types`):
      `supabase functions deploy log-set`, then `history`, then `chat`, `coach` and `next-set`.
3. Smoke test with one test account: log a set, End the workout, then GET the history. A replay of
   the same operation key must return the same receipt. Reusing a key with a different payload must
   return 409 `operation_conflict`, and another user's session must return 403 `forbidden`.

Never deploy the functions before the schema: every set log returns 500 until 0300 exists.

## Old-client window

- Pre-P4 installs also get a 400 on every **live set** once the new `log-set` is deployed, and
  `api.logSet` returns null, so the user sees no error. Impact until that user updates:
  - no server rows for their live sets;
  - no live PR detection, so no confetti;
  - no next-set baseline from that session.

  The sets are not lost: they stay in the device draft and in local history (`pendingSync`). After
  the update, `syncPendingWorkouts` gives the session a P4 identity and finalizes it. The ID never
  reached `workouts`, so it is not legacy-blocked, and its sets and PRs land then.
- Order: **release the P4 app build first and let it reach most users** (finish the phased release)
  **before** `supabase db push && supabase functions deploy …`.
  - The P4 build works against the old Edge: the old log-set and history accept its extra fields,
    and the old log-set acknowledges with `ok: true`.
  - The cost of shipping it first is that workouts finalized through the old Edge become legacy,
    read-only rows after the migration, the same as every pre-P4 workout.
  - Deploy the schema and functions as one chained step (`&&`), never separately.

- Pre-P4 installs get a 400 on End. Their workout stays on the device as `pendingSync`.
- After the user updates the app, `syncPendingWorkouts` assigns a P4 identity and syncs it (SPEC F3).
  If the ID already exists on the server as a legacy workout, the server answers 409 `legacy_session`.
  The local copy is then kept, flagged `syncBlocked`, and not retried. A 400 from history
  pre-validation (e.g. a pre-P4 row without an id) is also final: it is flagged `invalid_session`.
- Risk: a pre-P4 user who **signs out** before updating loses the unsynced local workout, because
  `clearAllCaches` removes the history. Tell users to update before signing out, or keep the window short.
- Legacy (pre-P4) server workouts are read-only by product decision. Delete and edit return 409
  `legacy_session`, and the app shows a clear message.

## Rollback

- **Edge only:** redeploy the previous function versions. With 0300 applied, the old `history`
  cannot write `workouts` (grants revoked), so an Edge-only rollback means History saves stay local
  (`pendingSync`) until a fix ships. Prefer a fix-forward.
- **Schema:** do not drop the P4 tables, receipts or tombstones (they are user data and resurrection
  fences), and do not re-grant the daily-live deletion. If writes must be restored for old Edge
  versions, re-grant `INSERT/UPDATE/DELETE` on `workouts`/`workout_log` to `authenticated` as a
  temporary, recorded exception.
- Local data is never deleted by a rollback. Pending sessions and operations remain on the device and
  retry when compatible.

## Recovery checks

- Open sessions: D08 decision (2026-10-13). A session still open 24 h after creation is auto-closed
  by `expire_open_workout_sessions()` (0500): it is finalized with the sets already logged, exactly
  like an End, and late live sets are rejected. A later End from the phone (higher revision) still
  replaces the snapshot. A session with no logged sets is only locked, with no history row. Check the
  job with `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;`. To pause it, run
  `SELECT cron.unschedule('expire-open-workout-sessions');`.
- Other D08 decisions (2026-10-13): the higher finalize revision wins across devices; deleted IDs
  are never restored; legacy workouts are not backfilled and stay read-only.
- Account deletion purges the P4 tables (`delete_user_data`, 0300). Verify with
  `supabase/tests/p4_account_purge.sql` on a local stack.

## Known gaps before production

- F6 (closed when online): History deletes a never-synced workout by queueing the durable abandon
  tombstone before removing the local copy, so a late sync of that ID is rejected. Offline, the
  server can't answer, so the delete still asks the user to retry. If removing the local copy fails
  after the tombstone is queued, the next sync gets `session_deleted` and drops the stale copy.
- Accepted trade-off (L1): one auto-close run is a single transaction, so each processed user's PR
  lock is held until the batch commits. A live set from that user can wait for the run (batch of 100
  every 15 minutes). A per-session commit would need a procedure; not worth it at this scale.
- Auto-close failures: a session that can't be closed (e.g. a clashing legacy ID) is recorded in
  `expire_failed_at`, sorted after never-failed sessions so it can't starve the queue, and retried.
  Inspect with `SELECT session_id, created_at, expire_failed_at FROM workout_operation_sessions
  WHERE state = 'open' AND expire_failed_at IS NOT NULL;`.

- Native process-death durability and a real-device run (Xcode/simulator) haven't been verified.
- `20260113205331_remote_schema.sql` fails on a fresh chain ("chats already exists"). This is
  pre-existing and doesn't affect production's applied history, but `supabase db reset` from scratch
  needs a decision. Don't edit that already-applied migration blind: rebaseline it from the real
  production schema (a user-run `supabase db pull` after the pre-check) instead.
