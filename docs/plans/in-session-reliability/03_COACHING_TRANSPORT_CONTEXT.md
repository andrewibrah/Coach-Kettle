# Coaching transport, context and feedback Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for authorized implementation, task by task. This handoff authorizes documentation only, not fixes, installs, migrations, commits, deployments, credentials or live services.

**Goal:** Preserve true performed-session evidence and make coaching decisions explicit, current and testable.
**Architecture:** Thin HomeScreen wiring delegates typed validation, serialization and ownership to pure domain helpers; local-first persistence and authenticated Edge/SQL contracts must agree. Adaptive questions/rules/UI are new proposed scope, not existing behavior.
**Tech stack:** Expo Router/React Native/React, TypeScript, AsyncStorage, Supabase Edge (Deno) and PostgreSQL. Current package versions override stale SDK prose; see [discovery evidence](evidence/discovery-impact.md).

**Prerequisites:** D1, I2, P2, P3 (see [master order](00_INDEX.md)); policy gates in [DECISIONS.md](DECISIONS.md).

## Execution discipline
- All paths below are relative to `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`; commands run there. New paths are explicitly proposed; verify collisions and current source before editing. Never rewrite an already-applied migration; proposed SQL filenames require chronology/uniqueness review.
- Run graph `impact SYMBOL --direction upstream --repo WorkoutTracker --file PATH` before each symbol edit. See [risk evidence](evidence/discovery-impact.md): `resequenceSets` CRITICAL, `saveWorkout`/`clearWorkoutDraft` HIGH. Review callers; UNKNOWN/empty sets require manual source fallback, never all-clear.
- Each checklist item is a small action: write desired-behavior failing case, run it to confirm the defect/absence, make the narrow change, rerun and inspect output, then review integration. Break larger items into test/implementation/retest slices; no copy-paste implementation is prescribed.
- Test commands below are **future execution commands**, not reported passes. Proposed test files must be created first. Node tests use installed TypeScript/native stripping; TSX/native imports need the D1 offline transpile/shim harness or mounted React test fixture, not raw unsupported Node TSX imports. Final native confidence requires V2.
- No network/provider/real DB calls from fixtures. SQL commands require an explicitly disposable local database; never use a linked production URL. Deno/native checks and deploys require separate executor authorization. Preserve raw user evidence on rollback.

### C1 — Scoped coaching conversation and durable pain context

**Objective / evidence:** executed follow-up context loss; source-verified scope gaps. Scoped coaching conversation and durable pain context.

**Audit coverage:** Q2. **Depends on:** I2, P2. **Policy:** D09.

**Exact targets:**
- `app/(tabs)/index.tsx`
- `lib/api.ts`
- `lib/chatStorage.ts`
- `components/modals/CoachModal.tsx`
- `supabase/functions/chat/index.ts`
- `supabase/functions/coach/index.ts`
- `supabase/migrations/20261008000400_coaching_scope.sql (proposed only if durable chat schema needed)`
- `lib/__tests__/coachingContext.test.ts (proposed)`

**Symbols / seams:** `toApiRows`, `api.chat`, `api.askCoach`, `saveWorkoutChatQA`, `saveCoachChatQA`, `fetchChatHistory`, `submitCoachQuestion`.

**Failure-first reproduction:** My shoulder hurts then Should I add weight? second request lacks prior disclosure/question. Coach reopen loads cross-session history; last10 trimming drops older symptoms; historical strength summary omits notes.

**Action checklist:**
- [ ] Capture red real route→API→Edge request tests for pain follow-up, clarification reply, reopen/new session, stale contradictory answer and history truncation.
- [ ] Carry session/exercise/set IDs and revisions with bounded conversation; explicitly separate global chat archive from applicable current coaching context.
- [ ] Retain applicable symptom evidence independently of last10 prose window; include historical notes only with date/scope/freshness label, never as current symptoms by default.
- [ ] Define latest explicit applicable answer precedence, contradictions→clarify and D09 retention/TTL; skipped never clears a prior disclosure to no-pain.
- [ ] Apply response ownership fence from P2; keep exact Q/A pairs and role validation, protect auth ownership.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/coachingContext.test.ts supabase/functions/chat/handler.test.ts supabase/functions/coach/handler.test.ts`

**Acceptance gate / expected result:** Follow-up receives applicable pain disclosure and preceding clarification, no stale cross-session inheritance. Missing scope/freshness stays unknown; no tested claim about real model advice. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Version context fields with readable archive; disable contextual coach if compatibility unsafe rather than silently dropping symptoms.

### C2 — Lossless provider SSE chunk assembly

**Objective / evidence:** offline real-handler runtime-verified bug. Lossless provider SSE chunk assembly.

**Audit coverage:** Q5. **Depends on:** D1. **Policy:** No additional choice.

**Exact targets:**
- `supabase/functions/coach/index.ts`
- `supabase/functions/_shared/sseDecoder.ts (proposed)`
- `supabase/functions/coach/sse.test.ts (proposed)`
- `lib/api.ts`

**Symbols / seams:** `coach ReadableStream/start`, `api.askCoach`.

**Failure-first reproduction:** Split valid data JSON containing Do not increase load. across two network chunks: real handler returns status200/empty body.

**Action checklist:**
- [ ] Make failing fixtures split every byte boundary including multibyte UTF-8, CRLF, multiple events, blank lines, DONE, malformed event and trailing final line.
- [ ] Keep incremental TextDecoder stream state and persistent line/event buffer; parse only complete framed events and flush decoder at end.
- [ ] Choose documented malformed/truncated stream error rather than returning a success-shaped complete answer; preserve assembled valid text and avoid duplicate tokens.
- [ ] Check client callback aggregation/abort contract and ensure P2 stream fences remain intact during integration.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test supabase/functions/coach/sse.test.ts supabase/functions/coach/handler.test.ts`

**Acceptance gate / expected result:** Every valid split preserves exact bytes/text including negations; truncated stream is visibly incomplete/error. Existing secret-handling tests still pass; no network provider call needed. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Feature-disable streaming or fail visibly if decoder rollback required; never claim truncated response complete.

### C3 — Visible errors, honest review and uniform rest effects

**Objective / evidence:** runtime/source-verified defects plus rest/review policy gaps. Visible errors, honest review and uniform rest effects.

**Audit coverage:** S10, Q3, Q4. **Depends on:** I2, P2, P3. **Policy:** D03, D07.

**Exact targets:**
- `components/modals/CoachModal.tsx`
- `components/modals/SessionReviewModal.tsx`
- `components/workout/StartRestPrompt.tsx`
- `app/(tabs)/index.tsx`
- `lib/api.ts`
- `lib/workoutStorage.ts`
- `lib/restTimer.ts`
- `lib/__tests__/coachingFeedback.test.ts (proposed)`

**Symbols / seams:** `CoachModal/error`, `generateSessionReview`, `SessionReview`, `triggerRestTimer`, `suggestRestSeconds`, `isCompoundExercise`.

**Failure-first reproduction:** Offline review returns fabricated rating7 and generic completion praise. Coach receives error prop but never renders it. Skeleton fills return before rest effect; old rest prompt may span sessions (unmounted hypothesis).

**Action checklist:**
- [ ] Add failing tests for API offline/invalid JSON/no body, Coach error/retry, skeleton single/batch vs fast/AI fill and start/end prompt reset.
- [ ] Return discriminated review available/unavailable status; absent rating stays absent. Never store generatedAt as real coaching for fabricated fallback. Save real performance even when review fails.
- [ ] Render readable error and explicit retry with preserved question; incomplete streaming and no-history/unavailable next-set must not remain Loading forever.
- [ ] Emit one common post-performed-set effect from all log/fill paths; rest only on approved eligible classification, obey active-timer/auto-start preference. Clear stale session prompt.
- [ ] Resolve rest classifier and batch/warmup/backoff policy D03/D07; add Leg press/Lat pulldown fixtures. Review excludes planned/warmup/cardio per policy and describes prescribed backoff without fabricated failure grade.

**Checks (expected behaviors, not executed results):**
- `node --experimental-strip-types --test lib/__tests__/coachingFeedback.test.ts lib/__tests__/restTimer.test.ts`

**Acceptance gate / expected result:** No fake7/10 or praise; unavailable review clearly marked and raw workout saved. Coach error visible/retryable. Routine and normal paths offer consistent rest without duplicate timer or cross-session prompt. Test exit must be zero after fix, with these assertions exercised and no unexplained exclusions.

**Rollback:** Disable AI rating/review rather than restore fabrication; storage keeps older reviews readable and labels unknown legacy provenance.
