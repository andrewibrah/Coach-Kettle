# I3 numeric-integrity local checkpoint — implementation pending review

## Current outcome
A single pure app implementation (`lib/workoutValidation.ts`) is re-exported by the Edge adapter. Unknown/null/empty is distinct from explicit0; finite non-negative canonical load, whole non-negative safe reps and finite non-negative optional cardio quantities are validated. Numeric JSON loads expand to decimal text rather than exponent strings. No medical/effort ranges or inferred loading mode were added. Existing performed selector and approved P2/P3 compatibility are preserved.

Actual Home inline/modal saves reject malformed/blank-exercise edits with visible toast/modal error and retain editable input. Invalid pending edits block blur, edit switching, mutation wrappers, delete, composer, End, Start and clear paths. Actual AI response ingestion rejects malformed rows before performed effects and restores input; zero-rep rows remain retained but do not produce live log/rest/PR effects. Log-set HTTP, history upload and chat HTTP/model rows enforce the shared contract. History keeps unknown/planned raw rows in rows_json without inventing numeric workout_log zeros. Epley rejects invalid/zero-rep/non-finite calculations. Legacy int32 PR representability is separate from accepted safe rep counts; larger valid counts remain raw and produce no PR response.

Next-set Edge now returns suggestion:null/reason:policy_unapproved after existing auth/request barriers, before legacy RPC. This implements DECISIONS' disable-unapproved-adaptive rule, not H1/A2 or D07 approval. Proposed SQL also disables that RPC's adaptive outputs. No live deployment changed.

## Executed receipts
All commands ran at repository root, offline except local disposable PostgreSQL. No live provider/database, secrets, install, commit, reset/stash or deployment.
- First actual inline/modal route RED:7 failures ->7 passes. Blur/modal-backdrop RED:2 behavioral failures ->9 combined passes.
- Actual AI ingestion/zero-rep effects RED:2 behavioral failures ->green.
- Edge HTTP/history RED: initial22 failures; chat initially had missing entitlements fixture dependency, corrected and separately rerun without guard: HTTP200 instead of502 behavioral RED, then green. This fixture error is not a behavioral RED.
- Epley/chat context RED:22 pass/2 fail ->green. Numericzero/warmup persistence RED:24/2 ->green. Safe rep/int32 PR mismatch RED:27/1 ->green. Next-set unavailable RED:1 fail ->green. Scientific numeric model load RED:1 fail ->green.
- NaN/Infinity/cardio tokens RED:1 pass/7 fail ->green. Numeric JSON exponent/decimal cardio precision RED:37/2 ->green.
- Final targeted `node --experimental-strip-types --test lib/__tests__/workoutValidation.test.ts supabase/functions/_shared/workoutValidation.test.ts`: **69 pass/0 fail/0 skipped**, exit0; scratch `i3-targeted.log`.
- Full `node --experimental-strip-types --test --test-reporter=tap 'lib/__tests__/*.test.ts'`: **3255 pass/0 fail/0 skipped**, exit0; scratch `i3-full-final.log`. Existing module/react-renderer warnings and intentional offline diagnostics remain. No C2 coach files edited.
- Initial full3245/6 failures were retained-harness missing dependencies plus two old I2 assertions explicitly marked “I3 input rejection is deferred.” Added actual contract/toast fixture dependencies without changing other assertions. Those two deferred assertions now require unchanged prior unknown load and whole-row integrity, retaining End exclusion. Original failed receipts remain in `i3-full.log`/`i3-retained.log`; not relabeled green.
- Latest direct `npx tsc --noEmit`: **exit0**. Latest `npm run lint`: exit0/no warnings. `git diff --check`: exit0. This new permitted direct app check supersedes the historical P3 scan-cap block for the current checkout; no alternate runner/bypass. App tsconfig excludes tests/Edge. Deno executable unavailable, therefore native Edge typecheck/bundle **BLOCKED**, not passed.

## Disposable SQL receipts and limits
Installed PostgreSQL15.14 was found under `/opt/homebrew/opt/postgresql@15/bin`; no install or existing/linked DB used. Fresh cluster under active-profile scratch `i3-pg-data`, Unix socket `i3-pg-socket`, port55483, TCP disabled. Initial startup failed due macOS locale/multithreaded startup; explicit LC_ALL=C succeeded. Cluster stopped and shutdown confirmed at checkpoint.

Fixture command: `psql -h /Users/me/.hermes/profiles/telegramlite/cache/scratch/i3-pg-socket -p 55483 -d postgres -v ON_ERROR_STOP=1 -v i3_apply_proposal=false -f supabase/tests/in_session_numeric_integrity.sql`.
- Baseline **exit3**, actual reconcile integer overflow for raw reps99999999999999 despite regex filter.
- Same command with `i3_apply_proposal=true`: **exit0**, transaction **ROLLBACK**. Initial proposed SQL had reserved parameter `row` syntax error, corrected to `evidence` before green. The fixture verifies guarded reconcile, invalid/unknown load/reps, safe rep maximum, preserved raw NaN, valid PR126.7, exclusions for zero reps/load/warmup/cardio/planned and unavailable adaptive outputs. This is a minimal disposable schema fixture, **not production migration application, full Supabase RLS/JWT correctness, or deployed server roundtrip approval**.

`20261008000100_in_session_numeric_integrity.sql` is a new additive proposal after the existing latest20260924000900 timestamp; applied migrations remain unchanged. It adds classification columns, total safe-cast helpers, read-only quarantine view, guarded PR trigger/reconcile definitions and unavailable suggestion RPC. No destructive backfill/conversion/deletion of workout_log raw strings is proposed. Export grouped quarantine counts and obtain separate migration/rollout approval first. Existing reconcile access grants are retained; actual RLS/auth acceptance is still a release gate.

## Impact and preservation
Pre-edit applyPendingEdit impact was CRITICAL/13 affected symbols (composer, End, clear, duplication, modal save); warned before edits. File-qualified parser/buildRowsFromApi/saveWorkout/epley/next-set impacts were LOW; new helpers, SQL and ambiguous symbols were UNKNOWN/stale, requiring actual source/caller fallback. Final tracked graph **CRITICAL/21 files/86 symbols/37 processes**, presentation truncated and new untracked helpers not fully indexed: no all-clear. Prior dirty CLAUDE, P2/P3 and C2 sources preserved; no commit.

## Focused remaining contract/review gates
1. Parent independent SPEC regression then QUALITY review; I3 is **implementation_pending_review**, not whole-task complete. D01/D03/D07 broader policy remains unresolved.
2. Edge log/history now map additive performance/set_kind columns: **do not deploy these functions against the old schema**. Coordinated separately approved migration and bundle/typecheck are prerequisites; no production migration performed.
3. Bounded tests do not establish exhaustive full-token cardio grammar across every calorie/time/distance spelling or malformed punctuation. Existing parser still has regex extractors for some cardio fields; reviewer should challenge prefix/sign/overflow boundaries rather than assume the shared helper proves every parser path.
4. Chat response mapper remains primarily strength-shaped; exhaustive cardio/classification/planned-target response preservation through that real model mapper is not established. Optional metadata enum validation and all non-object HTTP/AI response shapes also need focused reviewer scrutiny.
5. Proposed SQL uses legacy int32 PR materialization limits; larger safe rep counts remain preserved but cannot produce PRs. Set-number storage still uses existing integer schema. Extreme floating-point/SQL rounding or overflow parity is not exhaustively verified. No clinical limit is inferred from storage limits.
6. SQL fixture does not validate full production RLS/auth/trigger ordering/schema compatibility. No real device, Deno bundle, live provider, deployed history/PR/next-set or P4 idempotency/barrier guarantee.

## Approval-status correction from parent handoff
Latest bounded P2 is SPEC/QUALITY APPROVED. Latest bounded P3 is QUALITY APPROVED (3216 full at that receipt), with historical app-typecheck scan-cap block; the current direct app check above is separately recorded. C2 implementation is pending re-review with22 tests per parent, coach folder untouched/read-only. Older pending statements are historical, not current approvals. These reports do not mark whole P2/P3/C2 or external release gates complete.
