# Coach Kettle set-input / training-maths audit

Repository: `/Users/me/Desktop/partner/11_Codebases/Coach-Kettle` (all file references below relative to this absolute root). Checkout `deps/audit-2026-09-25`, HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`. Existing dirty files `.claude/CLAUDE.md`, `CLAUDE.md` unchanged by audit. No repository modifications, credentials, deployment, network AI, or database calls.

## Evidence and limitations
- Read root AGENTS.md; `git ls-files '*AGENTS.md'` returned only root instructions. GitNexus help/status/query/context executed before text flow discovery. Index reports matching commit/up-to-date. Query returns incomplete flows (next-set only finds increment-set); `context useWorkoutSession` identifies HomeScreen caller, while `context workoutRules` is not found and handleSend is ambiguous. Actual source therefore supplies edge-function/UI behavior, not graph completeness claims.
- Executed `node --experimental-strip-types --test lib/__tests__/restTimer.test.ts lib/__tests__/programTemplates.test.ts lib/__tests__/programFormat.test.ts`: **22 passed, 0 failed**; warnings only about package module type. These do not test numerical progression or parsing edge cases.
- Executed isolated scratch probe using installed TypeScript to transpile actual source into VM. Existing structuredGate DEV cases report all passed. Probes run actual `decideAndParse`, `resequenceSets`, rest rules, and extracted unchanged HomeScreen `addOrFillRow` / API review method. No React UI or backend integration executed. Review probe replaces network with an explicit thrown offline error, not a fabricated service response.
- Probe: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-set-probe.cjs`; parser results: `/Users/me/.hermes/profiles/telegramlite/cache/scratch/coach-kettle-set-probe-results.json`.
- SQL conclusions below are **source-verified / predicted SQL outputs, not PostgreSQL execution**. No claim about which migrations are deployed. AI-generated numerical recommendations were not sampled.

## Actual flow
1. `app/(tabs)/index.tsx:999–1019` sends typed input plus last exercise and rows to local `lib/structuredGate.ts:244–556`. Same-set duplication and empty routine-row filling precede normal parsing. Weight defaults to pounds; explicit kg is converted by 2.20462 and rounded to 0.1 lb; plates assume 45-lb plates per side + 45-lb bar (`:129–143`). Explicit exercise + lone integer becomes bodyweight reps; bare integers with history use >20=weight, <=20=reps (`:369–434`).
2. Skeleton branches fill first empty rows and return immediately (`index.tsx:1022–1084`). Fast parsing then uses `addOrFillRow` (`:1095–1148`) to fill missing fields on the last matching row or append a committed row. Only appended rows are live-synced (`:1157–1181`). Fast non-cardio sets trigger rest based solely on reps and heuristic compound name (`:1183–1191`, `lib/restTimer.ts:25–40,106–121`); skeleton fills do not trigger this path. There is no structured effort/RPE/RIR field (`types/workout.ts:13–33`).
3. Ambiguous inputs go to AI chat (`index.tsx:1212–1283`; `supabase/functions/chat/index.ts:36–56,207–217`). Prompt converts units, but returned weight/reps receive string trimming, not numerical validation. It does not preserve effort in a defined field.
4. `supabase/functions/log-set/index.ts:127–175` permissively parses numbers for live PR precheck, canonicalizes tracked lift aliases, stores strings, and replaces missing weight/reps with `0`. Epley estimate is rounded `weight*(1+reps/30)` (`_shared/liftMatching.ts:56–60`; DB function `0022_profile_pr_workouts.sql:138–147`). DB trigger independently casts strings and updates tracked PRs (`20260703000000_pr_integrity_and_training_days.sql:50–105`).
5. Next-set RPC takes only user + exercise, not current set, effort, goal, equipment, pain or planned rep target (`next-set/index.ts:77–80`). It chooses latest calendar date, heaviest weight, best reps at that weight, minimum reps, and max-minus-min weight spread (`0037_next_set_suggestion.sql:54–107`). Default holds load with rep floor clamped 4–12 and upper=floor+2. Best reps >=12: +5 lb below 135 lb, +10 otherwise; >=10: +2.5/+5; conditions require best reps >=8, load spread <20 lb, minimum reps >=5. Minimum reps <4 otherwise drops 5/10 lb. This is not autoregulation.
6. There is **no mounted NextSetSuggestionPill on workout HomeScreen**: search finds definition and its internal fetch only. Live recommendation display occurs on `app/program/day.tsx:45–64,106–118`, fetching on day change, not after logged sets. Thus no actual deterministic next-set adjustment happens in the in-session logger.
7. Ending includes every committed non-rest row, including unfilled templates, warmups and cardio, and passes only exercise/set/weight/reps/notes to review (`index.tsx:891–928`). `lib/api.ts:226–247` asks an LLM to rate intensity, goal-range fit, volume versus history, compound ratio, drops and exercise count, and give overload numbers. No deterministic scoring or target-attainment calculation runs. Any error becomes a success-shaped 7/10 review (`:274–280`).

## Findings (ordered by impact)

### S1 — HIGH: effort and pain silently discarded [runtime verified]
`lib/structuredGate.ts:199–212,537–549`; `types/workout.ts:13–33`.
- `Bench 185 8 RPE 9`, `Bench 185 8 RIR 2`, `Bench 185 8 RPE 9 RIR 1`, and `Bench 185 8 shoulder pain` all return the identical fast row `{exercise:"Bench",weightLbs:"185",reps:"8",notes:"",kind:"normal"}`.
- Single-pair parsing ignores unconsumed tail and constructs empty notes. The original message never reaches coaching. Progression cannot distinguish easy from maximal/painful sets. Verified information loss; not claiming a specific unsafe AI answer.

### S2 — HIGH: regex manufactures valid-looking set numbers [runtime verified]
`lib/structuredGate.ts:200–212,537–549`.
- `Bench 185kg` (missing reps) -> **18 lb × 5**, not clarification or kg conversion.
- `Bench 185 x -8` -> **18 lb × 5**.
- `Bench 100 oz 8` -> **10 lb × 0**.
- `Bench -185 x 8` -> **185 lb × 8** (minus sign lost).
Pair separator is optional and regex unanchored, so it backtracks/splits a single numeral, skips signs/unsupported text, and the single-pair path ignores leftover numbers. Produces false history/PR/recommendation inputs. Explicit valid `Bench 100kg 5` correctly produces 220.5 lb × 5.

### S3 — HIGH: explicit completed set overwritten with planned reps / wrong skeleton [runtime verified actual HomeScreen closure]
`app/(tabs)/index.tsx:1095–1118`.
Two Bench skeletons (sets 1/2, blank weight, planned 10 reps), message `Bench 185 8`: set 1 stays blank; **set 2 becomes 185 × 10**, not actual 185 × 8. Reverse search selects last row and only fills missing values, leaving planned reps intact. This can falsely establish target completion and drive overload. Unlike numeric skeleton-fill branches, explicit-name fast fill also adds no row to appended-row live-sync loop (`:1160–1181`).

### S4 — HIGH: warmup attaches to previous work set and new set disappears [runtime verified]
`app/(tabs)/index.tsx:1104–1115`.
Existing Bench work set 185×8 with empty notes; input `Bench 95 10 warmup` -> only existing **185×8 row remains, now notes="warmup"**. The notes-only fill condition consumes the new set without appending its 95×10 performance. A general repeated-exercise note-bearing input can alter old row classification rather than log new work.

### S5 — MEDIUM: warmup semantics do not survive parser/edit/storage/rules [runtime + source verified]
- `lib/structuredGate.ts:523–533`: `Bench 45 10 95 8 warmup` -> two **normal** rows with empty notes. `warmup Bench 185 8` also stores exercise as `warmup Bench` (`:352–359`).
- `lib/workoutRules.ts:71–79` / `index.tsx:733`: resequencing warmup set 0 and work set 1 yields **1 and 2** on any changed cell, with no warmup exception.
- `log-set/index.ts:172`: set 0 becomes 1 via `set || 1`; no warmup exclusion in PR precheck (`:129–131`) or DB trigger (`20260703000000_pr_integrity_and_training_days.sql:50–78`).
- Next-set SQL includes all rows without warmup/cardio filters. Example predicted SQL: warmup 45×10 + work 185×12 creates spread 140, so holds 185 instead of increasing; intentional back-off/drop sets also count as spread rather than ordered fatigue. Downstream numerical contamination is source-proven; DB not run.

### S6 — MEDIUM: comma-pair input changes meaning in a routine [runtime verified]
`lib/structuredGate.ts:157–171,279–301` versus `:182–197`.
With four blank Bench skeletons (planned 8 reps), `100,10,120,10` -> weights **100,10,120,10 lb** across four sets, not two sets 100×10 and 120×10. Normal no-skeleton parser recognizes weight/reps pairs. Earlier routine branch silently changes grammar and truncates extra weights if fewer skeletons remain.

### S7 — MEDIUM: numerical validation differs between editing, PR response and database [runtime/source verified]
`structuredGate.ts:201,537–549`; `index.tsx:679–695`; `log-set/index.ts:127–131`; PR migration `20260703000000_pr_integrity_and_training_days.sql:50–59`; next-set migration `0037_next_set_suggestion.sql:74–75,94–95`.
`Bench 185 x 8.5` accepted as fractional reps. Live precheck `parseInt("8.5")` = 8 and e1RM = **234.3**; strict DB text::INTEGER cannot accept `8.5`, so trigger skips. Same applies to model-provided `8oops`; inline edits also truncate such reps. Weight editing accepts arbitrary strings (e.g. `100kg`/`abc`) without conversion/validation. Next-set SQL casts stored strings directly rather than filtering/catching invalid data, so malformed weight/reps can turn the endpoint into 500 instead of usable suggestion. Offline probe verifies live number coercion; strict-cast failure is predicted SQL, not integrated endpoint execution.

### S8 — MEDIUM: missing values and bodyweight become training zeros [source verified; predicted SQL]
`log-set/index.ts:98–103,172–174`; `0037_next_set_suggestion.sql:59–60,72–88,127–146`.
Only rejects non-cardio when **both** weight and reps are absent; missing one is stored `0`. A weight-only 185-lb row therefore has zero reps and can trigger a 175-lb deload if selected by RPC. Actual bodyweight parser uses weight `0`; 0×12 can satisfy progression and produce **5-lb × 8–11** without knowing whether the exercise supports external loading. Missing, performed zero reps, and bodyweight are not distinct numerical states.

### S9 — MEDIUM: “prior session” and alias/history semantics are wrong; no adaptive set loop [source verified]
`0037_next_set_suggestion.sql:52–60,77–79,97–99`; `log-set/index.ts:140–143,168–171`; `app/program/day.tsx:45–64`; `NextSetSuggestion.tsx:39–55`.
- Latest date includes current day's live sets and merges separate workouts on the same date, contrary to prior-session comments. Example predicted SQL: yesterday 185×8; after today's first 185×12 live insert, query switches to today and suggests **195×8–11**, even without a completed session/effort report.
- Logging canonicalizes `Bench` to tracked `Bench Press` (probe verified); RPC only lowercases/trims requested `Bench`, so it reports no_history despite canonical history.
- Workout UI does not use suggestion component, and program day fetch depends only on day. Even dormant pill fetch depends only on exercise, not completed sets. Do not describe this as implemented in-session load autoregulation.

### S10 — MEDIUM: review failure presented as real successful coaching [runtime verified extracted API method]
`lib/api.ts:268–280`; `app/(tabs)/index.tsx:920–946`.
Throwing an offline error for a row with **blank weight and reps** returns **rating 7**, strengths “Completed your workout”, “Logged all your sets”, weakness “Consider tracking more details”, note “Keep up the consistency!”. Screen saves/displays it with `generatedAt` as a normal review. No unavailable/fallback marker. This fabricates completeness and a numerical rating; also conflicts with prompt prohibition on generic praise.

## Lower-priority training-policy concerns (not proven injury / AI misbehavior)
- Rest classifier calls `Leg press` and `Lat pulldown` isolation: actual 5-rep recommendations 90s versus Bench 180s (`lib/restTimer.ts:106–121`). It uses name/reps rather than effort or load and starts rest after warmups too; skeleton fills never offer rest (`index.tsx:1022–1084,1183–1191`).
- Bare-number >20 heuristic produces weighted Pushups **21 lb×20** for `21` after 0×20, and **25 lb×20** for `20` after curls 25×12 (`structuredGate.ts:374–417`). This is intentional documented behavior but needs clarification/confirmation, not silent load inference.
- Progression uses fixed absolute increments, not equipment/goal or percentage: low-load isolation can get proportionally large jumps; strength target ranges are not passed to RPC. `micro_load` label is always +2.5 lb even when SQL selects +5 lb (`NextSetSuggestion.tsx:27`; migration `:137`). Dormant UI issue, not an observed in-session bug.
- Review prompts treat >=20-lb drop as failure regardless of prescribed backoffs/dropsets and have no explicit warmup/cardio exclusion, pain gate or RPE/RIR input (`lib/api.ts:228–244`). These are contract/design safety gaps; live model output not tested.

Priority: fix silent input loss/regex corruption and planned-versus-performed set mixing before trusting progression or ratings; then align typed numeric validation and set classifications across UI/API/SQL. Audit only—no implementation performed.
