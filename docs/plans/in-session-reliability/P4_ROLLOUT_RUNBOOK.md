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

1. Confirm the new app build (P4 client) is released or ready. Its local-first writes never depend on
   the deploy succeeding.
2. In one maintenance step, back to back:
   1. `supabase db push` (0100 → 0200 → 0300, plus any later migration, e.g. 0400).
   2. Immediately, from the **repo root** (the functions import `../../../lib` and `../../../types`):
      `supabase functions deploy log-set`, then `history`, then `chat`, `coach` and `next-set`.
3. Smoke test with one test account: log a set, End the workout, then GET the history. A replay of
   the same operation key must return the same receipt. Reusing a key with a different payload must
   return 409 `operation_conflict`, and another user's session must return 403 `forbidden`.

Never deploy the functions before the schema: every set log returns 500 until 0300 exists.

## Old-client window

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

- Stuck sessions: count rows in `workout_operation_sessions` with `state = 'open'` older than the
  expected session length. No TTL policy is approved (D08), so report them; don't delete them.
- Account deletion purges the P4 tables (`delete_user_data`, 0300). Verify with
  `supabase/tests/p4_account_purge.sql` on a local stack.

## Known gaps before production

- Open LOW (F6): a workout that never synced and has no live set operations can't be deleted on the
  server (403 `forbidden`, because there is no session row yet). History restores it and tells the
  user to retry after it syncs.

- Native process-death durability and a real-device run (Xcode/simulator) haven't been verified.
- `20260113205331_remote_schema.sql` fails on a fresh chain ("chats already exists"). This is
  pre-existing and doesn't affect production's applied history, but `supabase db reset` from scratch
  needs a decision.
