# P4 Edge `_shared` fixture identity drift: repaired locally

The repair is a test-fixture change only. No production, Edge, SQL or migration file was changed. This closes the drift recorded in [p4-auth-provenance-local.md](p4-auth-provenance-local.md#verification-receipts-in-hermesprofilestelegramlitecachescratchp4-auth-log): `_shared` 66/13.

## Diagnosis: proven per test, not assumed

The baseline run on the unmodified file (`00-baseline-cause.txt`) returned:
- `400 {"error":"Session operation identity required."}` for all 13 log-set first calls;
- the identity / unique-row-ID message for the 1 history call.

So every test failed at the P4 identity guard (`log-set/index.ts` identity check, `history/index.ts` saveWorkout check), before any validation ran.

With identity injected in a scratch copy, **all 13 returned 200**. They then failed on two further layers of P4 drift, neither of which is a log-set regression:

1. **Write shape.** The assertions read the old direct `workout_log` insert columns (`set_kind`, `set_number`, `reps`, `weight_lbs`, `calories`, `rows_json`). P4's only write is now the JWT-scoped `apply_workout_operation` RPC.
2. **PR source.** PR acknowledgement is now SQL-owned (`receipt.pr`). The old harness's `rpc` proxy resolved `[]`, so the missing receipt produced a 500.

Under identity, all 44 negative tests reject with their own validation message, not the identity message (`01-negatives-with-identity.txt`). **No real regression was found, so no code fix was needed.** The independent reviewer reproduced 13/13 from the original file.

| Test | Cause | Fix |
|---|---|---|
| explicit numeric zero (0×0) | identity 400; PR now in SQL receipt | identity helper; SQL-model receipt |
| warmup reaches insert without PR | identity; `set_kind` column → RPC row | `forwardedRow().setKind === 'warmup'` |
| valid strength PR 126.7 | identity; PR in receipt | SQL-model receipt (computed from the forwarded row) |
| set-number 0 / "0" / "00" / 1 / "01" / undefined (6 tests) | identity; `set_number` → RPC row `set`; PR | `Number(forwardedRow().set)`; SQL-model receipt |
| safe reps 9007199254740991 | identity; `reps` column | `forwardedRow().reps`; int32 `i3_pr_reps` guard modelled |
| explicit zero bodyweight | identity; `weight_lbs` column | `forwardedRow().weightLbs === '0'`; load > 0 rule modelled |
| history unknown raw evidence | identity/row IDs; `rows_json` → `p_payload.rows` | `rpcCall('finalize').p_payload.rows[0]`; insert-count kept; **new** `logRows` deepEqual `[]` |
| cardio invalid / zero optional | identity; `calories` / `weight_lbs` columns | `forwardedRow().calories === 0`, `weightLbs !== '0'` |

## Fixture contract (`supabase/functions/_shared/workoutValidation.test.ts`)

- `withSessionOperation()` uses the same fields the app sends:
  - log-set follows `sessionOperationOutbox.ts`: `id === rowId`, `sessionId`, `dateISO`, `revision`, `put:<row>:<rev>`, `operation`.
  - history follows `workoutStorage.ts`: `finalize:<id>:<rev>`, plus row IDs.
  - Explicit body keys override the defaults, so malformed-field negatives still reach validation.
- `edge()` applies the helper to every log-set/history call. It also asserts that no response was an identity rejection, so no negative can pass vacuously. `edgeRaw()` skips the helper.
- `sqlReceipt()` is the offline stand-in for SQL. It derives PR only from the forwarded `p_payload.row`, using the `i3_strength_eligible` rules:
  - shared `isStrengthEvidence`
  - load > 0
  - int32 `i3_pr_reps`
  - non-null epley
  - tracked lift

  It never hard-codes an asserted value. Known non-asserted gaps: it doesn't raise like `p4_validate_row`; tracked-lift match is exact rather than `lower(trim())`; it assumes no prior e1RM.
- `rpcCall()` is stricter than the old checks: exactly one write, RPC name, `p_kind`.
- New test: identity-less log-set and history requests get 400 with the exact identity message and zero RPC calls. It includes a positive control and 7 single-field identity corruptions.
- Assertions: none deleted or loosened. The retargets are equivalent through `p4_insert_row` (reviewer-verified mapping).
- The parity runner (`run.py`, `parity.mts`) is kept with the receipts. It is scratch-only and not committed.

## Verification

Receipts are copied to `~/.hermes/profiles/telegramlite/cache/scratch/edge-identity-receipts/`.

- `node --test "supabase/functions/_shared/*.test.ts"`: **80 pass / 0 fail** (79 original + 1 new negative), `10-edge-shared.log`.
- `node --test --test-timeout=20000 "lib/__tests__/*.test.ts"`: **3381 / 0**, `11-lib.log`.
- `npm run lint`: exit 0, no warnings. `npx tsc --noEmit`: exit 0. `git diff --check`: exit 0. The untracked test file has 0 trailing-whitespace lines.
- Mutation checks (`02`, `03`):
  - The model detects these mutants:
    - no PR: 4 failures
    - no load > 0 rule: 1
    - no int32 guard: 1
  - Edge-source mutants are detected:
    - drop `setKind`: 1 failure
    - force `set: 1`: 3
    - discard `receipt.pr`: 4
  - "Planned rows to logRows" survives. It is an equivalent mutant for that input, because the row also fails complete validation.
- **Real SQL parity** (`20-real-sql-parity.log`, PARITY OK, 15 cases):
  - Setup: actual log-set/history handlers → real `apply_workout_operation` on freshly initdb'd PG15 (TCP disabled, Unix socket, migrations 100/200/300 applied, `P4_APPLY=true`), using the `p4_session_sql.py` bootstrap.
  - Covered: 126.7; set 0/"0"/"00" → null; 1/"01"/undefined → 126.7; warmup / MAX_SAFE reps / 0×12 / 0×0 → null.
  - Readbacks: `set_kind`, `set_number`, raw reps, `weight_lbs '0'`, `calories 0`, cardio `weight_lbs ''`.
  - History planned-unknown row stays raw with 0 `workout_log` rows.
  - Identity-less request → 400 with 0 RPC calls.
  - Shutdown verified.
- **`supabase start` / `db reset` / `functions serve`: BLOCKED.** Docker and Podman are not installed. No `.env.local` exists. The disposable-PG parity above substitutes for the local stack, but it is not a full Supabase auth/RLS/Deno stack. No remote Supabase command was run.
- Graph:
  - `impact edge` UNKNOWN / partial. A text search confirms the test file has no external references (it is a leaf).
  - `detect_changes --scope all`: CRITICAL, 27 files / 126 symbols, inherited from the dirty I1–P4 tree.
  - Staged-only scope is recorded in `doc.md` at commit time.
- Graph, staged scope (test file only): **LOW**, 1 file / 16 test-local symbols, 0 processes.
- Independent review: round 1 SPEC PASS / QUALITY APPROVED with 2 nits. Applied: helper `id: rowId`, comment wording, constant `tracked` param. Re-review: **SPEC PASS / QUALITY APPROVED**, all `assert` lines unchanged.
- Local commit **958b0c0** (test file only). Not pushed.

## Limits

Commit scope: the test file only. Its green result depends on uncommitted P4 log-set/history and `_shared` sources, so it will not pass at that commit in isolation. Deno typecheck, native, full-schema/RLS and deployed verification are not covered. Whole P4 and P5 remain open.
