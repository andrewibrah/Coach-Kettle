# Coach Kettle: in-session questions → coaching audit

Repository: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle`.
Audited checkout: `e9f96fe`, branch `deps/audit-2026-09-25`.
Audit only: no repository edits, commits, deployments, live Supabase calls, or real model calls. Existing modified `CLAUDE.md` and `.claude/CLAUDE.md` were present before and remain unchanged.

## Outcome

There is **no structured in-session readiness, pain, fatigue, RPE/RIR, difficulty, or completed-reps questionnaire** in the inspected workout route/hooks/components. There are naming/confirmation/rest controls and optional user-initiated AI Q&A. Answers to AI conversations are prose, not inputs to deterministic next-set rules. Do not describe this implementation as an adaptive question-driven workout coach.

Five defects reproduced with offline execution/static AST evidence: loss of symptom text in set entries; loss of conversational pain context in workout follow-ups; missing rest prompts on routine fills; invisible Coach errors; dropped streamed advice. Separately, a verified architectural gap is that neither pain nor fatigue can override the next-set RPC. Unsafe real model advice and deployed behavior were **not** tested or asserted.

## Discovery and graph evidence

Read root AGENTS.md; recursive discovery excluding dependencies/index/build internals found no nested AGENTS.md. Graph-first CLI: `node .gitnexus/run.cjs --help`, query/context help, status, queries for workout questions/coaching/readiness, contexts for WorkoutScreen, decideAndParse, suggest_next_set, fetchNextSetSuggestion. Status reports current/indexed commit `e9f96fe`, up-to-date. Broad query results were weak; WorkoutScreen and SQL RPC were not found; decideAndParse was ambiguous until disambiguated with `--file lib/structuredGate.ts`.

Useful graph: route `sendMessage` → `decideAndParse` → end intent/same-set/conversational/skeleton helpers. `fetchNextSetSuggestion` callers are `ProgramDayScreen` and `NextSetSuggestionPill`. Source fallback was required for UI literals, SQL (unindexed), and component mounting. Text search found no mount/import of NextSetSuggestionPill beyond its definition; the workout table renders WorkoutCard, not the suggestion pill.

## Concise question-to-decision map

| Surface / question | Trigger and available answers | Default / skip | Actual downstream decision |
|---|---|---|---|
| Name your workout / routine | Manual Start, or unresolved/no/rest-day program start. Nonempty free text or existing routine selection. `components/modals/WorkoutNameModal.tsx:64-95,135-154`; route `476-575` | Empty name is rejected by modal; closing does not start. Scheduled program Start bypasses name modal. | Name changes workout bodyParts/title/part. Routine/program prepopulates exercises, set count and reps. No readiness assessment. |
| Start rest | After ordinary locally parsed or AI-parsed noncardio set with weight/reps, only when timer idle and auto-start not explicitly true. Start or dismiss. Route `317-328,1183-1192,1274-1282,1378-1389` | Missing/false auto-start preference → prompt. Dismiss or 45-second expiry → no timer (`StartRestPrompt.tsx:14,36-45`). New eligible set replaces prompt. | Start uses computed rest seconds. Compound/reps heuristics in `lib/restTimer.ts:25-40`; no pain/fatigue input. Skeleton-fill sets do not reach this trigger (Q3). |
| End workout? | End button with logged rows. Cancel / Save (`index.tsx:835-888`) | Cancel retains session. Typing recognized done/end/save bypasses this confirmation (`1198-1209`). | Save generates review and persists session; no question about pain, actual effort, missed targets or why session ended. |
| End empty session? | End button with no non-rest rows. Cancel / End Session (`842-863`) | Cancel retains session; End clears it and saves nothing. | Session lifecycle only. |
| Clear table? / row actions | Explicit user actions: Cancel/Clear or Edit Set/Add Note/Duplicate/Delete/Cancel (`600-619`; `WorkoutTable.tsx:87-99`) | Cancel leaves data unchanged. | Mutates workout rows. Add Note is the available explicit way to retain symptoms; not a prompted assessment. |
| Workout composer Q&A | User enters question/conversational message. Free text; generated response has no fixed answer buttons. Local digit/prefix/question-mark gate (`structuredGate.ts:111-123,335-338`) | Blank blocked; no mandatory reply. Dismiss bubble does not change set rules. | `/chat` receives current message, rows, lastExercise only. Answer becomes bubble and saved chat, not row/safety/program state (`index.tsx:1235-1246`; `api.ts:153-171`). A subsequent reply has no previous conversation (Q2). |
| Coach modal Q&A | Explicit menu → Coach; free text. Blank or while-loading send disabled (`CoachModal.tsx:47,119-136`) | Optional; close is allowed. Reopen fetches saved coach history. No structured follow-up schedule. | `/coach` uses profile, past workouts/PRs, current rows and last 10 role/content messages. Responses only become chat text/history (`index.tsx:427-474`). No next-set or program mutation. |
| Session review | Automatically requested at end; not a user question. | API failure/invalid JSON becomes generic rating 7/default praise (`api.ts:249-279`). | AI `nextSessionNote` is displayed/saved; not fed to next-set RPC. Computed review may be a fallback, not verified application of rubric. |
| Next-set suggestion | Program day view fetches per exercise (`app/program/day.tsx:45-64`). Not an in-session question. | No history gives null weight, 8–12 reps. Failure/null remains visually “Suggest: loading…” (`107-118`). | RPC consumes user and exercise/history only. No conversation, pain, fatigue, RIR, or session review. In-session pill exists but is not mounted. |

## Reproducible defects

### Q1 — HIGH: set-entry symptom disclosures are silently erased

Files: `lib/structuredGate.ts:199-212,437-549` (normal row notes `540-545`); `app/(tabs)/index.tsx:1087-1195`.

Repro: enter `Bench 135 8 sharp shoulder pain` into active workout. Real parser returns `kind: fast`, Bench/135/8, `notes: ""`. `Bench 135 8 exhausted` and `Bench 135 8 no pain` produce the same row. The route fast path records the set, clears input, and offers normal rest; it never calls the conversational backend. Pain and no-pain are indistinguishable downstream. This destroys the only supplied symptom evidence before coaching sees it.

Evidence: scratch probe executes actual transpiled parser; all three inputs verified. Later unsafe load advice is a possible consequence, not observed model output. Preserve symptom text / route symptom-bearing entries through a safety-aware path rather than throwing trailing language away.

### Q2 — HIGH: workout follow-up forgets an earlier pain disclosure

Files: `app/(tabs)/index.tsx:1235-1246`; `lib/api.ts:153-171`; `supabase/functions/chat/index.ts:22-26,142-160`.

Repro: with a logged Bench row, submit `My shoulder hurts`, then `Should I add weight?`. Real sendMessage extraction executed with mocked API returns shows second request contains only new question, numeric rows and `Bench`. No shoulder disclosure, previous answer, or saved chat is included. Saving QA is not context retrieval. If the assistant asks a clarifying question, replying does not carry that question either. There is no contradiction resolution or latest-answer precedence because previous answers do not exist in this request.

Evidence: request arguments captured offline from the actual route function. The fixture response was synthetic transport data only, not a claim about real AI advice. Severity reflects loss of safety-relevant context; actual recommendation was not tested.

### Q3 — MEDIUM: routine fill skips the rest question/timer entirely

Files: `app/(tabs)/index.tsx:982-997,1021-1085` vs `1183-1192` and `1274-1282`.

Repro: routine skeleton row Bench, blank weight, reps 8; send `135 8`. Real route executes `syncSkeletonFilledRow` and returns with no triggerRestTimer call. Same input as explicit `Bench 135 8` in blank table produces both logSet and rest trigger. Single and batch fill return early; auto-start preference cannot fix this missing call. Routine users miss the coaching/rest prompt ordinary log users receive.

Evidence: offline actual sendMessage branch execution; captured call lists `['syncSkeleton']` vs `['logSet','rest']`. No simulator interaction asserted.

### Q4 — MEDIUM: Coach error state is never displayed

Files: `app/(tabs)/index.tsx:460-467,1407-1415`; `components/modals/CoachModal.tsx:26-44,119-136,203-277`.

Repro: Coach question fails with ordinary network/server error. Parent sets coachError and passes error prop; modal destructures error but never reads/renders it. User's question stays in optimistic history and input is cleared; loading ends with no explanation/retry. AI-limit alert is a separate special case and may still show.

Evidence: TypeScript AST confirms all non-property-access `error` identifiers are declaration at line 32 and destructured binding at 43; none in render or business logic. Source verification, not mounted UI test.

### Q5 — MEDIUM: streamed advice is lost at normal network chunk boundaries

File: `supabase/functions/coach/index.ts:338-362`.

Repro: valid SSE JSON containing fixture text `Do not increase load.` arrives split into `data: {"choices":[{"delta":{"content":"Do not ` and `increase load."}}]}\n`. Real handler decodes/splits each transport chunk independently and discards first JSON parse error; second half no longer begins `data: `. Response status 200 with empty body. In a longer answer this can omit critical clauses/negations, not just cosmetic tokens.

Evidence: executed actual Edge handler with fake auth/database/entitlement/provider transport, no network. Expected fixture text above; actual empty string. Existing coach handler tests all pass because they test secret handling, not chunk reassembly. Buffer incomplete SSE lines and incremental UTF-8 decoding.

## Verified architectural gaps and advice/computation divergence

* **Pain/fatigue cannot override progression.** Next-set Edge accepts only exercise, calls RPC with user+exercise (`next-set/index.ts:53-80`). SQL `0037_next_set_suggestion.sql:54-147` only looks at weight/reps/date. Even explicit notes are not selected. Progression condition requires top reps ≥8, drop-off <20 and min reps ≥5; top reps ≥12 increases load, ≥10 micro-loads; failing progression with min reps <4 deloads; otherwise hold. No injury gate, RIR/difficulty answer, stop-session rule, or answer priority exists. This is a verified capability gap, not proof that deployed AI tells an injured user to train.
* Coach prompt directs a concrete weight/volume/deload next step (`coach/index.ts:33-52`) but never receives deterministic RPC result; Q&A response only displays text. AI review instruction on missed reps/volume (`api.ts:244`) is also separate from RPC. No code ensures agreement or reconciles recommendations. Divergence is structurally possible; exact contradictory generated advice remains hypothetical.
* Optional explicit Add Note can retain symptoms in rows sent to Coach/current-session review. Historical Coach strength summaries discard all notes (`coach/index.ts:261-266`), so saved historical pain notes are omitted from that context. Source-verified context omission, not a separate runtime-tested finding.
* No structured answers means no validation for contradictions such as high pain + low effort, no freshness/TTL, no exercise-specific applicability, and no “skipped = unknown” safety semantics. Do not mistake missing measurement for “no pain.”
* Coach modal trims to 10 messages (`index.tsx:438-442`), backend removes last current question (`coach/index.ts:286-303`). Older disclosures can age out; reopened modal loads cross-session coach history with no workout-ID/session-boundary applicability filter (`CoachModal.tsx:71-86`). Last answers can thus be absent or stale. These are source-verified context policies; repeated/unsafe AI prompting is not tested.
* Rest prompt repetition is intentional per eligible new set, suppressed for a non-idle timer. There is no persistent opt-out from dismiss; 45s expiration is per prompt. Route does not clear restPrompt at workout start/end; an old prompt may remain for its remaining lifetime across sessions. That cross-session UI effect was not mounted/tested and is a follow-up hypothesis.
* Suggestion pill cannot currently adapt in session because it is not mounted. Even if mounted, effect depends only on exercise (`NextSetSuggestion.tsx:39-55`), not logged sets or responses. Treat this as dormant implementation, not demonstrated live UX defect.

## Checks, evidence and limitations

Executed:
1. Graph CLI discovery/status/query/context commands above; current index confirmed.
2. `node --experimental-strip-types --test supabase/functions/coach/handler.test.ts`: **3 passed**, zero failed.
3. `node /Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-question-probes.cjs`: successful exit; existing embedded structuredGate dev cases passed, and defect probes/assertions above passed.
4. Recursive AGENTS discovery and git status before/after. No new repository modifications.

Probe artifacts:
* `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-question-probes.cjs`
* `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-question-probes.json`

Harness exercises real transpiled parser, extracted real route function and real Edge handler with offline transport/state doubles. It is not an end-to-end simulator test. Initial harness wiring assertions failed while developing the scratch probe (missing injected api, AST console.error exclusion); corrected harness runs successfully. No live model outputs, SQL database execution, paid APIs, simulator/device UI checks, or deployed-version verification. Numerical set-rule and session persistence audits belong to other auditors; SQL here is inspected only to determine whether questions/answers can reach decisions.
