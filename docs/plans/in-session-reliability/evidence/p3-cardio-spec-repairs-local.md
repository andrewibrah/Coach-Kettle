# P3 cardio ingestion and strength-review boundary — implementation pending review

## Bounded result

The existing final serializer was already green at the direct End/storage/API/history fixture but real AI ingestion dropped all cardio/classification fields. `buildRowsFromApi` now preserves the typed optional cardio quantities/units, explicit false/zero, valid row ID/timestamp, set kind and prescribed target. It applies the existing `isPerformedRow` semantics after mapping; explicitly planned cardio stays planned even with metrics, incomplete strength stays planned, and target reps are not actual reps. Missing optionals remain missing. This is not a new runtime schema validator, range policy, timed-strength rule or backfill.

The actual End path saves **all performed rows**, while only performed non-cardio strength rows can enter optional rating/progression review. Both `isCardio` and explicit cardio set kind exclude review. Cardio-only End supplies null review without calling the strength review API; direct `generateSessionReview` also filters and rejects no-strength input before profile/provider IO rather than accepting a positive response with no evidence. Existing strength rating validation and supplied empty text remain compatible. P2 ownership/request/draft-generation/save/cleanup fences were not weakened.

Production modified in this repair: `app/(tabs)/index.tsx`, `lib/api.ts`. Existing serializer/storage/hook/types/history handler implementations retained. Tests modified: `workoutRoundtrip.test.ts`, `sessionReviewFailure.test.ts`; new `p3SpecRepairs.test.ts`. Existing review transport/response fixtures now provide a valid strength row instead of an empty array, preserving every old response assertion so the new no-data guard cannot falsely satisfy those tests without provider IO. No coach streaming/Edge C2 files changed.

## Strict vertical RED/GREEN

All commands run at `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.

1. `node --experimental-strip-types --test lib/__tests__/p3SpecRepairs.test.ts`: ingestion RED **0 pass/1 fail**, expected exact cardio zero fields/ID/time but actual builder lost all metadata and classified Bike planned. After mapping fix GREEN **1/0**.
2. Same command with cardio-only End case: RED **1/1**, actual strength review call count1 versus expected0. Narrow review gate GREEN **2/0** (combined with existing direct roundtrip **4/0**).
3. `node --experimental-strip-types --test lib/__tests__/sessionReviewFailure.test.ts`: direct API guard RED **14/6**; empty/cardio/cardio-kind/planned/incomplete calls accepted a positive response, mixed payload sent all three rows. After API selector/no-data guard, combined three-file GREEN **24/0**.
4. Added combined actual AI send/builder/live effects -> End -> actual hook builder -> real local storage -> actual API -> actual history Edge entrypoint -> GET readback. Two schedules cover ordinary offline pending retry and first local-write failure then End retry. Initial fixture used a conversational input, so answer-only route correctly did not invoke the builder; changed to existing unsupported multi-exercise set parse input `Bench and Squat 185 8`, not production behavior. Combined mixed tests then passed. Inputs include a metadata-free performed strength row with false/zero, zero cardio metrics/time, planned cardio, and missing optional metrics. No ghost/template history, live planned log, cardio rest or PR celebration. Failed initial local write causes no clear/end/remote POST; retry retains original identity/date and exact quantities.
5. Initial full run **3207 pass/9 fail** out of3216: unchanged retained I2 assertions found equal nested target objects with different VM-realm prototypes after the review projection unnecessarily cloned targets via final serializer. Replaced only review projection with typed field mapping retaining the original target reference (and ID/time/performance/false); persisted serialization remains unchanged. No old assertions changed. Final full run is green below.

## Final verification

- P3 target: `node --experimental-strip-types --test lib/__tests__/p3SpecRepairs.test.ts lib/__tests__/workoutRoundtrip.test.ts lib/__tests__/sessionReviewFailure.test.ts lib/__tests__/workoutSource.test.ts` — **31 pass/0 fail/0 skipped**, exit0.
- Retained P2/I2: sessionOwnership, sessionReviewFailure, sessionFinalizationUi, i2QualityRepairs, i2SpecRepairs, performedSets, programTemplates, programFormat — **202 pass/0 fail/0 skipped**, exit0.
- Full `node --experimental-strip-types --test lib/__tests__/*.test.ts` — **3216 pass/0 fail/0 skipped**, exit0. Includes original P1/P2/input assertions. Existing Node module/react-renderer warnings and deliberate offline failure diagnostics remain.
- `npm run lint` — exit0, no lint warnings. `git diff --check` — exit0.
- App typecheck **BLOCKED / no verdict**: lifecycle guard refused direct `./node_modules/.bin/tsc --noEmit` because `_tsc.js` exceeds1MiB scan cap. No alternate runner, bypass, install or claimed pass. Parent authorized interactive app typecheck is still required. Tests/Edge are excluded by app tsconfig regardless.
- Raw final receipts: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/{p3-target,retained-p2-i2,p3-full-initial,p3-full-final,p3-graph-final}.log`. RED/GREEN results also remain in tool transcript. Shell TMPDIR unexpectedly pointed at system temp for initial full log; moved unchanged into required active-profile scratch and used explicit scratch destinations thereafter.

## Graph and source fallback

Pre-edit builder LOW/1 indexed caller (`sendMessage`); End LOW/2 (`sendMessage`, `onEndWorkout`); API review LOW/0 indexed callers, source search confirmed actual route use and review test harness calls. Storage query initially ambiguous UNKNOWN, then file-qualified **HIGH/7 impacted symbols/4 process groups**: End and pending sync directly, Home typed/button End and History load/refresh transitively. HIGH warned before repair; storage not edited. Reviewed actual storage save/upsert/sync, End/send and handler mapping. Stale-index new helpers remain unresolved; empty indexed callers are not proof of no runtime use.

Aggregate first scan **CRITICAL/15 tracked files/76 range symbols/37 flows**; final rerun with `--limit200` **CRITICAL/15/77/37**, still displays only15 symbols/10 flows and omits untracked helpers/tests/docs. Includes preserved I2/P1/P2 and independent C2 edits; not an all-clear.

## Limits and next gate

Offline execution runs real source closures/modules/handler, with in-memory AsyncStorage and auth/database IO doubles; handler GET reads the record produced by its real POST mapping. No fabricated live DB/provider success, native mount, actual AsyncStorage device persistence, SQL transaction/RLS/reconciliation guarantee, deployed Edge or release claim. Cardio review exclusion prevents the strength coaching request; unchanged history handler still invokes day-wide PR reconciliation (necessary retraction semantics), whose SQL exclusion remains outside this repair. Live-write replay/idempotency and history concurrency remain P4/P5. Existing cardio legacy missing-metric eligibility is preserved, not upgraded to a new validation policy.

**P3 stays implementation_pending_review.** Parent must run independent SPEC regression then QUALITY, and obtain the missing app typecheck verdict. No commit, install, reset/stash, secrets, migration, deployment, provider or live DB access.
