# V2 release results: in-session reliability (local and offline matrix)

Status: **local and offline gates GREEN. On-device gates BLOCKED.** Everything was verified on this Mac against disposable local databases and the real Supabase edge runtime. Nothing ran against production. TestFlight builds and human testing are the next step, owned by the user.

## Environment

- Branch `deps/audit-2026-09-25`, results at the commits named below.
- The **local Supabase** stack is scratch project `ck-p5`, which is unlinked. It runs under colima Docker on ports 551xx, with `supabase functions serve` on edge-runtime 1.74.3 (Deno 2.1.4).
- **Disposable PG15 clusters** were created per suite (socket only, TCP disabled) and shut down afterwards.
- **Fresh-chain caveat (pre-existing):** the repo's full migration chain cannot be applied from scratch. `20260113205331_remote_schema.sql` is a diff that collides with legacy `0008_chats_table`. The local baseline therefore applies every migration *except* `remote_schema`, one transaction per file. Production already has `remote_schema` recorded, so `db push` skips it. See the prod pre-check below.

## App and Edge suites (isolated worktree at the committed HEAD)

| Gate | Result |
|---|---|
| `node --test "lib/__tests__/*.test.ts"` | **3747/0** at final HEAD (4b0923c + V2 test-only edits); 3650/0 at d46c904 |
| Edge: every `supabase/functions/*/*.test.ts` | **494/0** at final HEAD |
| `npx tsc --noEmit`, `npx expo lint --max-warnings 0` | exit 0 |
| iOS production JS bundle (`expo export --platform ios`, no local env) | builds at final HEAD. It contains the prod project ref and **no** local-stack URL |
| `expo-doctor` | 20/21; the only failure is patch-level drift within SDK 57 (10 packages). Not a TestFlight blocker |

## Database and Edge fixtures

| Fixture | How | Result |
|---|---|---|
| `p4_session_sql.py` (chains `p4_edge_sql.mts`) | disposable PG15, `P4_APPLY=true` | pass: 62 invalid-row and 18 invalid-snapshot no-effects, 660 boundary checks, 0 failures |
| `coach_disposable.sh` | disposable | pass (5) |
| `meal_plan_disposable.sh` | disposable | pass (4) |
| `nutrition_target_sets_disposable.sh` | disposable | pass |
| `delete_user_data_disposable.sh` | disposable | pass |
| `in_session_numeric_integrity.sql` (proposal applied) | disposable PG15 | pass |
| same file, without the proposal | disposable PG15 | expected RED control (the documented integer overflow) |
| `in_session_numeric_parity.mts` | disposable PG15, `I3_SCRATCH` | pass, 65 cases |
| `i3_cardio_storage.mts` | disposable PG15 | **superseded**: its handler phase mocks the pre-P4 insert path. The identical 8-value cardio matrix runs through the real Edge handlers and real RPC in `p4_edge_sql.mts` (pass). The file is annotated; deleting it is the user's call |
| `in_session_history_baseline.sql` | ck-p5 | 24/24 |
| `body_metrics_isolation.sql`, `exercise_mojibake.sql`, `onboarding_completion.sql`, `p4_account_purge.sql` | ck-p5 | pass |
| `onboarding_completion_concurrency.sh` | ck-p5 (disposable; libpq env vars, since this psql ignores a URI in PGDATABASE) | 3/3 scenarios PASS, exit 0, 0 leftover fixture users. Fixed a pre-existing macOS bash 3.2 bug: an empty `pids[@]` under `set -u` crashed the cleanup trap |
| `p4_session_expiry.sql` | ck-p5 after a fresh reset (66/66 migrations, excluding remote_schema) | PASS: 6 closed, exercise grouping and order kept |
| `auto_rest_duration.sql` | ck-p5 | exit 0 (nullable column, no backfill) |
| `prod_precheck_p4.sql` | **production, user-run, read-only** | not run here by design |

## Real HTTP smokes (Kong → `functions serve` → ck-p5 Postgres)

| Suite | Result | Proves |
|---|---|---|
| P5 history | 8/8 | revision ordering, exact replay safe, terminal delete, no resurrection |
| H1 next-set baseline | 7/7 | newest completed session only, current session excluded, warmup dropped, adaptive off |
| C1 coach/chat context | 6/6 | hostile history bounded, sanitized provider errors, context ignored while flag off |
| C3 AI quota | 5/5 | invalid coach requests consume no `ai_usage`; valid ones still meter (RED at HEAD 0→4) |
| A2 decisions | 4/4 | with the flag off a forged decision is ignored; next-set unchanged |
| Auto-rest prefs | 11/11 | null default (classifier); 120 persists; 10, 605, 17, 'abc' and -5 rejected without clobbering; null resets |

## On-device matrix: BLOCKED (not claimed)

The iOS simulator cannot run here: Xcode is not installed (only CommandLineTools) and the disk has 8.5 GB free, too little for Xcode. A web substitute (Expo web plus Playwright) was started and then **stopped at the user's request**. No web results are claimed. Human testing on a TestFlight build must cover:

1. Routine, freeform, bodyweight and cardio logging; pending inline and modal edits.
2. Offline/airplane mode: log sets offline, End offline, reconnect, then check that History syncs with no duplicates.
3. A rapid return-key plus button press; End racing late AI responses.
4. Clear, delete-last and reopen; kill mid-parse; overnight and timezone change; restore/import routine.
5. Reorder and delete gestures (V1 fixed stale-index and wrong-row moves at handler level); confirm on device.
6. Coach error, retry and stall (20 s idle deadline); the review-unavailable path.
7. Sign-out/sign-in as another user: no cross-user history or upload (P5/P4 fences).
8. Pre-P4 installed build during rollout: see `P4_ROLLOUT_RUNBOOK.md` "Old-client window".
9. Adaptive features ship **disabled**. Turning `COACHING_POLICY` flags on requires the DECISIONS.md Q1–Q15 answers first.
