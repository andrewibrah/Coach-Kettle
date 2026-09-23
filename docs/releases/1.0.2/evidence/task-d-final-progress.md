# Package D final checkpoint (body measurements and the R4 proof)

Status: the local implementation and every local check are complete.
- F17, F23 and F26 are **FIXED**.
- F24 and R4 are **FIXED-UNVERIFIED**. The opt-in two-user verifier is built and self-tested, but no real Edge → PostgREST run has happened. This machine has no Docker, Podman, OrbStack or Colima, and `supabase status` cannot reach a Docker daemon.

Nothing was committed or deployed, and nothing touched a live database, simulator or device.

Most of §D already existed as uncommitted work from earlier sessions:
- [`task-d-implementation-progress.md`](task-d-implementation-progress.md) covers the client validation and the server changes.
- [`task-d-persistence-progress.md`](task-d-persistence-progress.md) covers the verifier and the operator steps.

This pass worked in five steps:
1. A read-only audit checked steps 1–10 against the code.
2. One gap-fill task followed, with its own task review.
3. A final Opus review ran over the whole D surface.
4. One fix wave addressed that review's findings.
5. A scoped re-review confirmed the fixes.

## Dispositions
| ID | Disposition | Where |
|---|---|---|
| F17 | FIXED | `lib/bodyMetricValidation.ts` parses each full string strictly, collects every field error, and builds a sparse payload only after all supplied values are valid. Invalid input is never turned into null. The real `body.tsx` route (rendered with `react-test-renderer`) sends no request on invalid input and keeps every field after a failure. It shows inline errors, range hints and arm/thigh circumference guidance. |
| F23 | FIXED (migration not yet applied) | `supabase/migrations/20260921000100_body_metrics_merge_comment.sql` now holds the plan's exact `COMMENT ON TABLE` string. The shipped `0036_progress_tracking.sql` is untouched. |
| F24 | FIXED-UNVERIFIED | `handler.test.ts` exercises the real Edge handler, with the database mocked. The real sequential and concurrent PostgREST test lives in `scripts/verify-body-metrics-persistence.mjs` and has not been run. |
| F26 | FIXED | Blank, omitted and null numeric fields leave stored values unchanged. The server rejects notes-only writes explicitly. `notes:""` sent with a metric clears notes. The contract is now commented at the server upsert. It is still a single sparse upsert with no read-then-merge-then-write. |
| R4 | FIXED-UNVERIFIED | The done criterion is "real sequential/concurrent readback passes", and that run is still owed. **Contingency, not built:** if a real run loses data, add a narrow atomic merge RPC (a migration plus a function change, deployed by the user) and rerun. Never read the row and write a client-merged object. |

## Audit (steps 1–10)
- Steps 1–5 were met, with one gap in step 1: out-of-range values and inline errors were proven only at the pure-function level, not on the rendered route.
- Ranges match exactly and inclusively in all three places:
  - client: `lib/bodyMetricValidation.ts:2-11`;
  - Edge: `body-metrics/index.ts` (`measurementNum`);
  - DB: `0036_progress_tracking.sql:14-21` (`BETWEEN`).

  `handler.test.ts` checks this parity against the real SQL file.
- Step 6 was partial: the comment wording paraphrased the plan's text. The filename sorts after every migration in the tree.
- Steps 7–9 are met at script level. Step 10 is blocked on environment. PostgREST version recording is wired in: it is taken from a narrowly parsed header and is null when not advertised.
- Section E's work is intact: the load state machine, stale banner and Retry in `body.tsx`, `parseStrictInteger` (resting BPM 25–220) and the `dangerForeground` token.

## Changes in this pass
- `lib/__tests__/bodyMetricValidation.test.ts` (Task D1 and the fix wave). Using the rendered route, for all 8 fields (bounds read from `BODY_METRIC_FIELDS`):
  - min−0.1 and max+0.1 send no request, keep the text and show that field's inline error;
  - exactly min and exactly max send a sparse payload with just that field;
  - a decimal next to an out-of-range value sends nothing;
  - the range hints and the arm/thigh circumference guidance render;
  - editing a field clears only that field's error.
- `app/(tabs)/progress/body.tsx`: `onChangeText` now clears that field's own inline error. It is written test-first, with RED then GREEN. Nothing else changed.
- `supabase/migrations/20260921000100_body_metrics_merge_comment.sql`: the comment is now the plan's exact string.
- `supabase/functions/body-metrics/index.ts`: adds a notes-contract comment at the upsert. It is a comment only, with no behaviour change in this pass. The file still needs deploying for Hermes's earlier validation changes.
- `scripts/verify-body-metrics-persistence.mjs`:
  - The concurrent disjoint-field writes now run on every spare test date. A new round adds concurrent writes to an existing row (seed one field, write two others at once, then assert one row, the seeded ID and all three values).
  - The blank/null same-ID check now compares against the ID captured before the write. It used to compare the row with itself, so it could never fail.
  - When no public key is supplied, the refusal now names the missing anon/publishable key as the likely cause.
- `lib/__tests__/bodyMetricsVerifier.test.ts`: new fixture failure modes that the verifier must catch: `foreign-delete-succeeds`, `spoof-honors-body-user`, `concurrent-split-ids`, a blank write that replaces the row with a new ID, and the missing-key message.
- `docs/releases/1.0.2/evidence/task-d-persistence-progress.md`: `CK_BM_PUBLIC_KEY` is now described as usually required (anon/publishable key only, never service role).

## Corrections to earlier claims
- `task-d-implementation-progress.md` says "No supplied exact comment string was discoverable". **Wrong:** plan §D step 6 gives the string verbatim. The migration now uses it.
- `task-d-persistence-progress.md` counts **20** verifier tests. It is now **25**, after the fix wave. The audit's count of 21 was also wrong.
- The audit claimed the verifier's self-tests prove it catches cross-user leaks. **Overstated:** mutation testing showed the foreign-delete, owner-spoof and concurrent same-ID checks could be removed without any self-test failing. This is now fixed.
- The operator steps otherwise match the script exactly: env var names, `--help`, exit behaviour, the 3–10 dates rule and token expiry.

## Verification (final tree)
- RED was captured before GREEN for the field-error clearing and the new verifier failure modes.
- Task D1's range fixtures were proven to catch bugs by mutating the comparison operators, then restoring the file byte-for-byte.
- The final reviewer ran 24 mutants, restored each one and checked each file with `cmp`.
- Commands, all exit 0:
  - `EXPO_NO_DOTENV=1 npm run lint -- --no-cache`
  - `./node_modules/.bin/tsc --noEmit --incremental false`
  - `node --test "lib/__tests__/*.test.ts"`: **522/522** (the baseline before this pass was 490). Of these, `bodyMetricValidation` has 42 and `bodyMetricsVerifier` has 25.
  - `node --test supabase/functions/body-metrics/handler.test.ts`: **8/8**
  - `~/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno check --no-lock --cached-only supabase/functions/body-metrics/index.ts`
  - `node --check scripts/verify-body-metrics-persistence.mjs`
  - `git diff --check`
- The route tests depend on `react-test-renderer`, the uncommitted `package.json` / `package-lock.json` devDependency added in §E.
- GitNexus impact was attempted and returned UNKNOWN (index v43, engine v42). There is no graph-pass claim. A grep found:
  - `lib/bodyMetricValidation.ts` is imported by `body.tsx`, by `resting-hr.tsx` (only `parseStrictInteger`, which is unchanged in this pass) and by tests; `body-metrics/index.ts` refers to it only in a parity comment;
  - `BodyMetricsScreen` has only its route caller.

  Risk judged LOW.

## Open
- **Real R4 run:** run the two-user verifier against a **disposable** stack only, following the operator steps in [`task-d-persistence-progress.md`](task-d-persistence-progress.md). A pass requires:
  - exit 0, `ok: true` and `cleanupVerified: true`;
  - empty failure and reconciliation lists;
  - the stack, PostgreSQL, PostgREST and Edge versions recorded.
- **Device check:** run `body.tsx` at the largest accessibility text size (8 inputs with hints, inline errors, guidance line, stale banner), with VoiceOver reading the labels and errors.
- **Moved to §G:**
  - Inline error text uses the normal text colour. `danger` `#EF4444` as small text on a light background is about 3.8:1, which fails AA.
  - iOS VoiceOver does not announce new inline errors; `accessibilityLiveRegion` works on Android only.
  - The section E banner contrast.
- **Moved to §I (F25):** `body-metrics` uses the service role for every query and scopes rows to the owner by a manual `.eq('user_id')`. Report only; not changed in D.
- **Kept as-is on purpose:**
  - `disposable-staging` mode accepts any HTTPS host; the operator must confirm the target is disposable.
  - A server 400 would show raw JSON in a toast (`lib/bodyMetrics.ts:25`). This is pre-existing, and client validation blocks every 400 the server can currently return.
  - Deleting another user's row returns 200 with no effect, not 403. That is the existing contract, and the verifier asserts nothing changes.
  - `inlineAlertTexts()` matches by substring.
  - `react-test-renderer` deprecation warnings print in test output.

## Deployment (user)
- `supabase db push`: **yes**. It applies `20260921000100_body_metrics_merge_comment.sql`, which only sets a comment. Review the rest of the untracked migration queue first (§9 step 8).
- `supabase functions deploy body-metrics`: **yes**, for strict parsing, calendar-date checks and collecting all errors, plus this pass's comment.

The ledger, reviews and full diff are in `.superpowers/sdd/2026-09-08_222459-1.0.2-full-repo-patch-audit/D/`: `progress-D.md`, `SECTION-D-FULL.diff` and `SECTION-D-this-pass.diff`.
