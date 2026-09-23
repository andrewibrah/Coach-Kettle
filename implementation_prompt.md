# Implementation Prompt — Coach Kettle b65/66 Bug Fix & Feature Pass

You are implementing fixes for 12 issues on branch `b65/66` (commit `7efd492` at time of writing — confirm `git log -1` still matches before you start; if it doesn't, some line numbers below will have drifted and you must re-locate them, not assume they're still accurate).

Two independent AI-generated investigation reports exist in the repo root: `c_debug.md` and `h_debug.md`. A third-party verification pass has already fact-checked their claims against the live codebase. **Do not re-read those two files as ground truth on their own — read this prompt first.** It tells you, per issue, which report's approach to follow, where they were wrong, and what still needs your own investigation. Where this prompt cites a file:line, it has been verified against actual source at the commit above; treat it as reliable unless you find it's drifted.

## Non-negotiable operating rules

1. **GitNexus is mandatory in this repo** (see `.claude/CLAUDE.md`). Before editing any function/class/symbol: run `impact({target: symbolName, direction: "upstream"})` and report blast radius. If it returns HIGH or CRITICAL risk, state that explicitly before proceeding — you are authorized to proceed through this task's known HIGH/CRITICAL symbols (`saveWorkout`, `ScreenHeader` — both flagged below), but do not skip the check or the warning. Run `detect_changes({scope: "compare", base_ref: "main"})` before every commit.
2. **Investigate before you edit, verify after every meaningful change.** "Verify" means: `npx tsc --noEmit`, `npx expo lint`, the relevant `node --test` file(s), and — for anything user-visible — actually running the app (`npx expo start`, then exercise the flow in the iOS simulator via `npx expo run:ios`) and observing the real behavior. Do not claim a fix works because it compiles or because a test you just wrote passes; write the test to fail first against the bug, then make it pass, per this repo's TDD convention in `CLAUDE.md` root file.
3. **No test-gaming.** If a test is hard to make pass honestly, that's signal to look harder at the code, not to weaken the assertion, mock around the real behavior, or delete the test. If you hit a wall, diagnose out loud (what you expected, what happened, what you checked) and iterate — don't paper over it with a cosmetic patch.
4. **Preserve working behavior unless you have evidence it should change.** Several items below have a locked decision already (see "Locked decisions"). Everything else — implementation details neither report nail down, or where they disagree without a locked decision — is your judgment call, but it must be backed by what you find in the code, not by splitting the difference between the two reports. If both reports agree, that's corroboration, not proof; verify the specific claim yourself if it's load-bearing for your change.
5. **Migrations**: prepare them, do not run `supabase db push` — the user runs that manually. Same for `supabase functions deploy`. Say clearly which migrations/functions need those manual steps at the end.
6. **Scope discipline**: touch only what each issue requires. Don't refactor adjacent code. Do remove imports/vars your own changes orphan; don't remove pre-existing dead code you didn't create unless it's explicitly in scope (e.g. `RestTimerBar` deletion is in scope, `app/program/day.tsx` dead code is not, mention it and move on).

## Locked decisions (already made by the user — implement as stated, do not relitigate)

- **#8 (dual rest timer indicators):** Delete `components/workout/RestTimerBar.tsx` and its mount at `app/(tabs)/index.tsx:1373`. Keep `RestTimerToast` (`app/_layout.tsx:50`) as the single automatically-shown indicator on every route. The full-screen `/timer` tab is unaffected — manual, opt-in, reached only when the user taps into it; `RestTimerToast`'s existing exemption of that one route (`RestTimerToast.tsx` ~`:58-60`) stays as-is.
- **#3 (auto-start rest timer):** Not a removal — a **Settings toggle**, `auto_start_rest_timer`, default `false`. Verified: the existing sibling toggle `rest_timer_enabled` lives in `types/notifications.ts:21` and its Switch UI is rendered in **`app/settings/notifications.tsx:18`** — not a generic settings screen as either report vaguely implied. Put the new toggle there, next to it. When on, preserve today's exact behavior (auto-start fires immediately). When off, show the dismissible "Start Rest" prompt instead.
- **#10 (ScreenHeader / clipped titles):** Fix `components/ui/screen-header.tsx` directly — add `flexShrink: 1` to the title-wrapping `<View>` (`:57`), and `numberOfLines={2}` + `adjustsFontSizeToFit` (minimumFontScale ~0.7) to `styles.title` (verified at `:99-101`, not `:99-102`). Do **not** do a page-local workaround instead. **Verified regression-check list: 26 files import `ScreenHeader`**, not the 6 named in either report — get the current list yourself with `grep -rl "ScreenHeader" app/ components/` before you touch the component, and visually check every one after (short titles unchanged, long titles wrap to 2 lines instead of clipping).

## Where the two reports disagree and how to resolve it (not by averaging)

- **#1 architecture** — `c_debug.md` gives a concrete, ready-to-run migration and step sequence. `h_debug.md` adds real engineering value c_debug lacks: a typed `source: {kind: 'freestyle'|'template'|'program', ...}` discriminator on the session/workout instead of three loose nullable columns guessed at from context, a **pure, independently-testable day-resolver function** (local date/timezone/weekday/start-date/completed-days in → training/rest/completed/program_complete out), an explicit guard against double-starting a session, and a caution against inferring schedule alignment from `created_at`. **Build c_debug's schema as the base, but implement h_debug's structural guardrails on top of it** — this is additive, not a compromise; both ideas hold up under evidence, don't drop either. GitNexus flags `saveWorkout` as HIGH risk (7 impacted symbols, several execution flows) — run `impact` on it before touching, and cover it with the storage round-trip test both reports independently call for.
- **#2 history delete** — c_debug's swipe-to-delete + overflow menu is good UX and cites real, already-installed infra (`GestureHandlerRootView` at `app/_layout.tsx:48`). h_debug catches something c_debug missed: `handleDelete` should use the existing `deleteWorkout()` helper rather than hand-rolling AsyncStorage writes, and flags a real correctness gap — an offline/failed remote delete can let the item resurrect on next sync. **Do both**: c_debug's affordance (overflow button required, swipe optional/nice-to-have) + h_debug's correctness fix (existing helper, tombstone or equivalent guard against resurrection). Verify `handleDelete` at `history.tsx:117` and the long-press at `:189` first — both confirmed accurate.
- **#4 AI grammar** — c_debug's fix is verified concrete and correct: no `temperature` key in `coach/index.ts`'s OpenAI call (confirmed), and the two contradictory length instructions are real, at verified lines **`:38`** and **`:44`** (not `:39`/`:45` — off by one, re-locate before editing). Ship c_debug's temperature + prompt rewrite. Separately, **investigate h_debug's claim that this report did not independently verify**: that session-review generation abuses the conversational streaming `coach` endpoint by injecting a JSON-schema request as a fake user question, then extracts JSON with a greedy brace regex (`lib/api.ts` ~`:191-238`). This is a plausible, distinct fragility bug that c_debug never mentions at all. Read that code yourself before deciding whether it's in scope for this pass or a separate ticket — don't take h_debug's word for it, and don't dismiss it unchecked either.
- **#5 tutorial** — the underlying bug is smaller than either report's full implementation guide suggests: confirmed real defect is `TutorialModal.tsx:90-96`'s unguarded `await markTutorialShown()`, which can permanently soft-lock the modal open on an AsyncStorage failure. **Ship the two-line `try/catch` fix — mandatory, cheap, real.** h_debug's full user-scoped/versioned server-side tutorial system is a legitimate product improvement but is scope creep for a bug-fix pass on a feature that's "largely already fixed" per commit `156c218` (confirmed: `tutorialState.ts:3`, `AuthProvider.tsx:54` deliberately preserve the key). Do not build the versioned system unless you finish everything else early and want to flag it as a follow-up recommendation — don't silently expand scope.
- **#6 / #7 are coupled** — verified fact: `programming/index.ts:70` selects a template by `split_type` alone; `days_per_week` is stored (`:109` region) but never used to filter, so picking any days/week count for a given split silently gets whatever day-count that split's single seeded template happens to have (c_debug's "Finding B" — confirmed true, not speculative). **#7's fix must query by `split_type` AND `days_per_week`** (with a closest-match fallback, per c_debug's implementation) — this is a prerequisite for #6 to mean anything, since #6's weekday suggestions are keyed by day count. Do #7 before #6.
- **#7 seed data caution**: c_debug ships ready SQL with real exercise slugs. **Before running it, verify every slug referenced actually exists in the `exercises` table** (`SELECT slug FROM exercises WHERE slug IN (...)`) — c_debug's own report warns that an unmatched slug falls back to the raw slug string in `programming/index.ts` (~`:158` region) and silently reintroduces the underscore-formatting bug from #10 inside program day listings. Don't skip this check.
- **#11 exercise library** — both agree on the core fix (FlatList, derive filters from data not a hardcoded array, server-side filtering, pagination). c_debug is more implementation-ready (concrete `FlatList` props). h_debug catches something c_debug doesn't: **cache shape mismatch** — `action=search` returns `select('*')` while `action=list` returns a trimmed projection, and both populate the same client-side cache; verify whether this actually produces inconsistent card rendering depending on which action populated the cache, and fix the projection mismatch if so. Also: verified fact — `action=list` (`exercise-library/index.ts` ~`:54-63`) genuinely has no `.limit()`/`.range()` in the code (not a suspicion, confirmed absent). Whether this actually truncates results is a live PostgREST config fact, not something you can determine by reading code — **run it**: hit the deployed function or query the table directly and compare the returned row count to `SELECT count(*) FROM exercises` (confirmed dataset size: 1,324 imported + curated rows). If truncated, pagination is mandatory, not precautionary; report the actual number you observed.
- **#12** — use c_debug's `formatProgramDayLabel` implementation (the `startsWith` comparison is more precisely specified and testable than h_debug's looser prose rule). Pull h_debug's broader test-case framing (case differences, whitespace, underscore values) into the test file alongside c_debug's six real template rows — more coverage, same function, no conflict here.
- **#9 emoji cleanup** — reports agree closely on inventory; treat as an independent, low-risk pass. Don't block anything else on it.

## Sequencing (dependency- and risk-ordered, not report order)

**Wave 1 — independent, verified, low-risk:**
1. #7 Full Body template fix (verified 100%-reproducible crash on an advertised option — highest severity item in the whole list)
2. #4 coach `temperature` + prompt rewrite (one-line + prompt swap, verified real defect)
3. #12 `formatProgramDayLabel` + tests (self-contained)
4. #5 `try/catch` in `TutorialModal.handleDismiss` (two lines, prevents a hard lock)

**Wave 2 — rest timer consolidation (do together, they share the same container/UI region):**
5. #8 delete `RestTimerBar`, move haptic into `useRestTimer.ts`'s confirmed `running→done` guard (~`:123`)
6. #3 `auto_start_rest_timer` toggle in `app/settings/notifications.tsx`, wired to gate the two call sites at `index.tsx:1095` and `:1186` (verified locations), plus the "Start Rest" prompt for when it's off

**Wave 3 — shared-component UI fix + adjacent polish:**
7. #10 `ScreenHeader` fix + full 26-consumer regression pass
8. #2 History delete affordance + correctness fix
9. #9 emoji cleanup

**Wave 4 — larger features, depend on earlier waves:**
10. #6 training-day suggestions (depends on #7's split+days_per_week template lookup)
11. #11 Exercise Library rebuild (independent of the rest, but larger — do last of the "contained" items so earlier wins are banked)
12. #1 program→workout pipeline (largest scope; depends on #12's formatter and #7's templates; touches the HIGH-risk `saveWorkout`)

## Testing & verification requirements

Run after every wave, not just at the end:
- `npx expo lint`
- `npx tsc --noEmit`
- `node --test "lib/__tests__/*.test.ts"` (glob required — a bare directory path fails on this repo's runner)
- `mcp__gitnexus__detect_changes` compared against `main` before any commit
- Start the dev server (`npx expo start`, then `npx expo run:ios` for anything touching UI) and manually exercise the actual changed flow in the simulator. Typecheck and unit tests verify code correctness, not feature correctness — for anything user-facing (rest timer indicator, settings toggle, history delete, exercise detail page, exercise library list, program day titles), you must observe it working in the running app before calling it done. If you cannot run the simulator in your environment, say so explicitly rather than claiming verified UI behavior.

Per-issue minimum test coverage (write these as failing-first where a code change is involved):
- `lib/__tests__/programFormat.test.ts` — all template-day cases + edge cases (#12)
- `lib/__tests__/exerciseFormat.test.ts` — underscore/acronym formatting (#10 companion, if you touch display formatting)
- `lib/__tests__/trainingSchedule.test.ts` — split→weekday suggestions incl. the `null`→Custom path (#6)
- `lib/__tests__/restTimer.test.ts` — confirm no timer start path fires when `auto_start_rest_timer` is off, confirm exactly one haptic fires on completion (#3, #8 regression guard)
- Storage round-trip test for program source IDs surviving draft→local history→sync→API→fetch (#1)
- A regression test/fixture asserting every value in `programming/index.ts`'s `VALID_SPLIT` has at least one seeded `program_templates` row for every day-count the UI offers (#7 — prevents this class of bug recurring)

## Definition of done

- All 12 issues addressed per the decisions and sequencing above, or explicitly deferred with a stated reason (e.g. "#1's full offline-sync completion semantics deferred — flagging as follow-up" is acceptable if justified; silently skipping is not).
- `tsc`, lint, and the full `node --test` suite are clean.
- `detect_changes` scope matches what you intended to touch — no surprise blast radius.
- Every migration file is written but not applied; every function change is written but not deployed; both listed explicitly at the end for the user to run.
- You have actually run the app and watched the changed flows work, not inferred it from passing tests.
- Final report is concise and evidence-backed: what changed, what you verified and how (test output, simulator observation, actual DB counts where relevant — e.g. the exercise-library truncation check), what you deliberately deferred and why, and the exact manual steps (`supabase db push`, `supabase functions deploy <name>`) the user still needs to run.
