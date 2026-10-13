# I3 SPEC repair checkpoint — pending independent SPEC then QUALITY

## Outcome and scope
Repaired the review's cardio whole-token, actual chat mapping, untrusted classification and envelope failures. Earlier approved I1/I2/P1/P2/P3 and C2 work is retained; this follow-up edits no Home route, storage, draft, workout selector or coach streaming production files. Parent handoff states bounded C2 SPEC/QUALITY APPROVED with22 tests; older pending C2 statements are historical. I3 remains implementation_pending_review.

- `lib/structuredGate.ts`: a single anchored cardio command scanner replaces substring extractors. It validates each complete quantity before conversion; signs, scientific strings, overflow, junk suffixes and decimal commas cannot become a prefix number or an ignored optional field. Unit boundaries separate quantities; label-first numbers consume their complete token. Duplicate quantities/unknown numeric units clarify. Valid attached units, decimal/zero metrics, comma/semicolon separators and literal narrative annotations remain supported. Annotation numbers are not later re-extracted as metrics. Intent remains command-prefix based; conversational/strength controls are retained. No clinical range is introduced.
- `lib/workoutValidation.ts`: validates performance/setKind/status/distanceUnit against the actual LogRow enums, optional identity/text/time shapes, target quantities and typed finite cardio metadata, regardless of whether the row is classified cardio. Metadata omission remains legacy-compatible; unknown enums cannot become performed evidence. Cardio display objects are rejected rather than stringified.
- `supabase/functions/chat/index.ts`: validates object/message/context before auth usage gating/provider IO, rejects malformed model envelopes with sanitized502, and preserves the allowed metadata projection (including explicit0/false, stable ID/time, planned targets, performance and warmup/cardio classification). Missing optional metadata stays missing. It does not infer target reps or performed values. HTTP null/array/number/message42 produce400 without entitlement usage, writes or provider calls.
- Additive **unapplied proposal** `20261008000100_in_session_numeric_integrity.sql`: unknown SQL classifications quarantine rather than qualify. Guarded `i3_epley` matches Edge IEEE-754 evaluation/rounding and scaling-overflow behavior; tiny decimal underflow is known zero as in JavaScript, not an invented invalid clinical boundary. PR trigger/reconcile use the guarded helper. Raw load/reps strings remain unchanged. Existing applied migrations and public legacy epley function are untouched.

## Strict TDD receipts
All commands ran at `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`, offline except explicitly disposable PostgreSQL. Raw logs are under `/Users/me/.hermes/profiles/telegramlite/cache/scratch/i3-spec-*.log`.

| Slice | Actual RED | Subsequent GREEN |
| --- | --- | --- |
| Whole cardio-token matrix, parser + actual composer |22 pass /25 fail |86 /0 combined with original validation tests |
| Actual Edge model mapper |30 /2 (missing metadata) |32 /0 |
| Classification/optional shape, shared contract + log/history/chat/model + actual Home |33 /13 |46 /0 |
| HTTP/model/provider envelopes |46 /16 |62 /0 |
| Literal cardio numeric annotation |51 /1 |52 /0 |
| Typed cardio model metadata |62 /1 |included in final155 /0 |
| Unit-boundary comma separator |52 /1 |included in final155 /0 |
| Disposable SQL trigger/JS/eligibility/quarantine parity |59 cases /10 mismatches |59 cases /0 mismatches |

The mapper's first post-fix run31/1 exposed a **fixture issue**, not a remaining mapper failure: `Run and bike` has no digits and the actual Home conversation gate intentionally refuses model-returned sets. The same assertions now use the existing multi-entry command `Run and bike 5 8`; the original failed receipt is retained and not called green. No preexisting tests/assertions were altered. Tests execute the actual Edge handler in an offline VM, actual shared validator, actual Home send/builder closures and real parser; no deployed/provider/device verification is implied.

Final checks:
- `node --experimental-strip-types --test lib/__tests__/i3SpecRepairs.test.ts lib/__tests__/workoutValidation.test.ts supabase/functions/_shared/workoutValidation.test.ts`: **155 pass /0 fail /0 skipped**, exit0.
- `node --experimental-strip-types --test --test-reporter=tap 'lib/__tests__/*.test.ts'`: **3308 pass /0 fail /0 skipped**, exit0.
- `npm run lint`: exit0/no warnings. Direct `npx tsc --noEmit`: exit0. `git diff --check`: exit0. App tsc excludes tests/Edge; Deno executable remains unavailable, native Edge typecheck/bundle **BLOCKED**, not passed.
- Existing Node module/react-renderer warnings and deliberate offline diagnostics remain in full tests. No installs, commits, reset/stash, secrets, provider/network requests, real/linked DB use or deployments.

## Disposable SQL safety and verified parity
Reused only the documented PG15 cluster under active-profile scratch `i3-pg-data`, previously stopped; checked PG_VERSION15 and `pg_ctl status` before starting. Executed LC_ALL=C pg_ctl with Unix socket `i3-pg-socket`, port55483 and **TCP disabled**. No linked URL, environment DB URL or production credentials were read.

Baseline fixture with `i3_apply_proposal=true` was first rerun unchanged, exit0/ROLLBACK. New durable runner:

`node --experimental-strip-types supabase/tests/in_session_numeric_parity.mts`

The runner uses the actual JavaScript validator/epley implementation, applies the fixture and proposal inside a transaction, inserts59 explicit/golden decimal cases, then reads real trigger PRs, eligible/quarantine flags and original raw values. It verifies readback is identical after real reconcile, and requires ROLLBACK. RED54 cases/5 mismatches was broadened before production SQL edits to59 cases/10 mismatches: unknown enums generated126.7 PRs, MAX_VALUE/scaling overflow stayed eligible, underflow disagreed, and five decimal rounding ties differed. GREEN59/0 includes unchanged normal126.7, safe/int32 reps, invalid legacy strings, subnormal/underflow, extreme finite loads, zero and planned/warmup exclusions. This is a shared representability matrix, not a clinical threshold or exhaustive float proof.

Final server readback: listen_addresses empty, port55483, data_directory exactly the scratch cluster. After rollback, workout_log and i3_epley were absent from the disposable DB. `pg_ctl -m fast -w stop` returned server stopped; subsequent status returned **no server running**. Generated fixture stays in scratch for reviewer reuse. Minimal fixture does not establish full production constraints/RLS/JWT/trigger ordering/schema rollout compatibility.

## Graph and remaining gates
Pre-edit parser impact resolved by exact UID to LOW/4 symbols; real callers are Home sendMessage and embedded dev tests. Shared validator/chat/SQL targets were UNKNOWN/not indexed in the stale graph, so source searches and actual entrypoint fixtures supplied caller fallback. The inherited aggregate CRITICAL risk remains unresolved. Final detect-changes remains **CRITICAL/21 tracked files/87 range-attributed symbols/37 processes**, with presentation truncated and untracked helpers/tests not fully covered: not an all-clear.

Parent must independently rerun **SPEC first, QUALITY second**. Deno/native/full RLS/deployed server gates remain open. Edge metadata columns still require coordinated separately approved schema migration before any deploy; SQL here is only a local proposal. Broader D01/D03/D07 policies, P4 idempotency and release approval are not completed. Deadline is not an acceptance waiver.

Shell TMPDIR again pointed to macOS system temp despite the runtime note; initial10 logs were moved unchanged into active-profile scratch, and all later commands used explicit scratch paths. No cluster or generated fixture was created in system temp.
