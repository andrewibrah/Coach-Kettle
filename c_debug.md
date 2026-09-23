# Coach Kettle — Bug Investigation, Diagnosis & Implementation Guide

**Branch:** `b65/66` · **Base:** `main` · **Date:** 2026-09-04
**Scope:** 12 reported issues across Program/Workout flow, AI & Onboarding, Program Creation, Rest Timer, and UI polish.
**Method:** Static analysis of the repo at HEAD (`7efd492`). Every claim below cites `file:line`. Where I could not verify a claim at runtime, I say so explicitly.

> **Screenshot note.** The five attached images live under `~/Library/Containers/com.apple.MobileSMS/…/QuickLook/`. macOS TCC blocks that container for this process — `Read` returns `EPERM` and `cp` returns `Operation not permitted` even with the sandbox disabled. This is an OS-level privacy restriction, not something I can work around. **To include the visual evidence, copy the five PNGs to `~/Desktop/` (or drag them into the terminal) and I'll re-examine them.** Everything below was derived from source, and the code independently confirms the symptoms described in the written report — including the exact `Pull - Pull (Heavy)` string and the exact underscore values (`hip_flexors`, `body_weight`) visible in the exercise-detail screenshot.

---

## Summary

| # | Issue | Severity | Root cause located | Type |
|---|---|---|---|---|
| 1 | Program does not auto-populate workouts | **High** | Feature absent + schema gap | Missing feature |
| 2 | Workout delete hidden behind long-press | Medium | `history.tsx:189` | UX defect |
| 3 | Rest timer auto-starts on log | Medium | `index.tsx:1095`, `:1186` | Behavioral defect |
| 4 | AI grammar / writing quality | **High** | `coach/index.ts:39` + missing `temperature` | Prompt + config defect |
| 5 | Tutorial reappears | Low | *Largely fixed already*; residual gaps below | Partially fixed |
| 6 | Split does not auto-select training days | Medium | `program/create.tsx` — no such field exists | Missing feature |
| 7 | Full Body split template missing | **High — crashes** | `0035` seeds 3 of 6 splits | Data gap → 500 |
| 8 | Dual rest-timer indicators | Medium | `_layout.tsx:50` + `index.tsx:1373` | Architectural defect |
| 9 | Low-quality emojis | Low | 20 sites, enumerated | Polish |
| 10 | Exercise detail: raw underscores, clipped title | Medium | `[slug].tsx:100–158`, `screen-header.tsx:57` | Presentation defect |
| 11 | Exercise Library unfinished | **High** | Non-virtualized 1,324 rows + broken filters | Perf + correctness |
| 12 | Duplicate name in program-day title | Low | `program/week.tsx:57–60` | Presentation defect |

### Findings beyond the reported list

These surfaced during investigation. They are real and I recommend folding them into the same passes:

- **A. `upper_lower` split is equally broken as `full_body`** (#7). Both pass server validation and both have no template row. `upper_lower` isn't even offered in the UI, so it's latent rather than user-visible today.
- **B. `days_per_week` is collected but ignored by generation** (#7). `program/create.tsx:183` lets the user pick 1–7 days; `programming/index.ts:142` iterates `structure.days` from a fixed template. Picking "PPL 3-day" + "6 days" silently produces 3 days.
- **C. `action=list` in the exercise-library function has no `.limit()`** (`exercise-library/index.ts:57–63`). PostgREST caps responses (commonly 1,000 rows); with 1,324 seeded exercises the library is likely **silently truncated**. Needs runtime confirmation — see Verification.
- **D. `app/program/day.tsx` is dead code.** Nothing routes to it (grep for `program/day` returns only its own log statement). `program/week.tsx:71` navigates to the exercise library instead. It's also the only screen calling `fetchNextSetSuggestion`, so the next-set heuristic is currently unreachable.
- **E. `NotificationsProvider` ignores `profile.training_days`** (`:82`, `:110`), using only the `training_days_per_week` heuristic map. This contradicts the documented contract in `lib/trainingSchedule.ts:17-19` ("Explicit user-selected days take priority"). Relevant to #6.
- **F. `TutorialModal.handleDismiss` has no error handling** (`TutorialModal.tsx:90-96`). `markTutorialShown()` is awaited with no `try/catch`; an AsyncStorage failure rejects before `onDismiss()`, leaving the modal permanently stuck open.

---

## Cross-cutting: the schema gap behind #1

`workouts` has **no** `program_id`, `program_day_id`, or `week_number` column. Verified two ways:

- `grep program_id supabase/migrations` returns hits only in `0035_programming_engine.sql:51,80,108` — the three *program* tables. Nothing touches `workouts`.
- `saveWorkout()` in `supabase/functions/history/index.ts:113-125` upserts exactly: `id, dateISO, part, createdAt, rows_json, review_json, reflection, user_id`.
- The client type `WorkoutSession` (`lib/workoutStorage.ts:39-50`) has no program fields either.

So there is currently **no link, at any layer, between a completed workout and the program day it came from**. Issues #1 is therefore a feature build, not a fix. Everything else is repairable in place.

---

## 1. Auto-populate workouts when a program is started

### Investigation

The program engine generates a complete prescription tree and then stops. `generateProgramFromTemplate()` (`supabase/functions/programming/index.ts:57-223`) writes `workout_programs` → `program_weeks` → `program_days` → `program_exercises`, with `target_sets`, `target_reps_low/high`, `target_weight_lbs`, and `rest_seconds` per exercise (`:179-192`).

Consumption is read-only:

- `app/program/week.tsx:55-96` lists days and exercises. Tapping an exercise opens the **library page** (`:71-74`), not a workout.
- `app/program/day.tsx` would show per-exercise suggestions but is unreachable (Finding D).
- **No screen anywhere calls `startWorkoutSession` with program data.** `grep startWorkoutSession` returns only `app/(tabs)/index.tsx:460, 470, 494` and `hooks/useWorkoutSession.ts:66`.

`workout_programs.current_week` is tracked (`0035:17`) and advanced manually via the "Advance to next week" button (`program/index.tsx:128`). **There is no concept of a current *day*** — `program_days.day_index` is a 1..N slot within the split (`0035:82,90`), deliberately *not* a weekday, and nothing maps slot → calendar date.

### Diagnosis

Three distinct gaps, in dependency order:

1. **No day-cursor.** `current_week` exists; the day pointer does not. Without it "the correct workout for the current program day" is undefined.
2. **No program → workout bridge.** The skeleton-row mechanism already exists and works — `expandTemplateToRows()` (`lib/workoutRules.ts:94-116`) turns `{lift_name, target_sets, target_reps}` into N `LogRow`s with `weightLbs: ""` and `status: "committed"`, used by `handleSelectTemplateForStart` (`index.tsx:468-483`). `ProgramExercise` is shape-compatible. **Nothing wires the two together.**
3. **No back-link on save.** Per the cross-cutting section above.

The good news: gap 2 is nearly free — the requested behavior ("import all exercises with empty/unlogged values") is *exactly* what `expandTemplateToRows` already produces.

### Implementation guide

**Step 1 — Migration `0049_program_day_cursor_and_workout_link.sql`**

```sql
-- Day cursor on the program
ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS current_day_index SMALLINT NOT NULL DEFAULT 1
    CHECK (current_day_index BETWEEN 1 AND 7);

-- Back-link from completed workouts to the program day they fulfilled
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS program_id     UUID REFERENCES public.workout_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_day_id UUID REFERENCES public.program_days(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_week   SMALLINT;

CREATE INDEX IF NOT EXISTS idx_workouts_program_day
  ON public.workouts (program_id, program_week, program_day_id);
```

`ON DELETE SET NULL` is deliberate: archiving or deleting a program must never cascade-delete workout history.

**Step 2 — Advance the cursor server-side.** In `supabase/functions/programming/index.ts`, add `action: 'complete_day'`:

```ts
if (action === "complete_day") {
  const pid = String(body.program_id ?? "");
  const { data: cur } = await admin.from("workout_programs")
    .select("*").eq("id", pid).eq("user_id", userId).maybeSingle();
  if (!cur) return jsonRes({ error: "not found" }, 404);

  // Day count comes from the actual week, not days_per_week (see Finding B).
  const { data: wk } = await admin.from("program_weeks")
    .select("id").eq("program_id", pid).eq("week_number", cur.current_week).maybeSingle();
  const { count } = await admin.from("program_days")
    .select("id", { count: "exact", head: true }).eq("week_id", wk!.id);

  const dayCount = count ?? 1;
  const rollover  = cur.current_day_index >= dayCount;
  const nextDay   = rollover ? 1 : cur.current_day_index + 1;
  const isFinal   = rollover && cur.current_week >= cur.weeks_total;
  const nextWeek  = rollover && !isFinal ? cur.current_week + 1 : cur.current_week;

  const { data } = await admin.from("workout_programs")
    .update({ current_day_index: nextDay, current_week: nextWeek,
              status: isFinal ? "completed" : cur.status })
    .eq("id", pid).eq("user_id", userId).select().single();
  return jsonRes({ program: data });
}
```

Server-side is the right home: it's the same rollover logic `advance_week` already owns (`:330-354`), and it keeps the cursor authoritative if the user has two devices.

**Step 3 — Client: `startProgramDay`.** In `app/(tabs)/index.tsx`, alongside `handleSelectTemplateForStart` (`:468`):

```ts
const handleStartProgramDay = (
  day: ProgramDay & { exercises: ProgramExercise[] },
  program: WorkoutProgram,
) => {
  startWorkoutSession([formatProgramDayLabel(day)]); // see #12 for the helper
  setRows(expandTemplateToRows(day.exercises.map((ex) => ({
    lift_name:     ex.exercise_name,
    target_sets:   ex.target_sets,
    target_reps:   ex.target_reps_low,          // low end of the range
    target_weight: ex.target_weight_lbs,
  }))));
  setActiveProgramRef({ programId: program.id, dayId: day.id, week: program.current_week });
  setMessageInput(""); setEditingCell(null); setEditValue("");
};
```

`expandTemplateToRows` already emits `weightLbs: ""`, satisfying "empty/unlogged values" with no change to that function.

**Step 4 — Entry points.** Two, both needed:

- `app/program/week.tsx` — add a **"Start this workout"** button per day card, highlighting the one matching `program.current_day_index`.
- `components/home/HomeDashboard.tsx` — a "Today: Push (Heavy) — Start" card when a program is active. This is the "loaded automatically" half of the request.

I'd stop short of auto-starting a session on app open without a tap. It would collide with draft restore (`useWorkoutSession.restoreWorkoutSession`) and take a destructive action the user didn't ask for. One tap from a prominent card meets the intent safely — flagging this as a deliberate deviation for your call.

**Step 5 — Persist the link.** Thread `program_id` / `program_day_id` / `program_week` through `WorkoutSession` (`lib/workoutStorage.ts:39`) → `saveWorkout` upsert (`history/index.ts:113-125`), then call `complete_day` after a successful save. Because `part` still carries the day label, History keeps working unchanged — satisfying "saved both to Workout History **and** associated with the Program Day."

**Step 6 — Surface it.** In `app/history/[id].tsx`, render a "Week 3 · Day 2 — Pull (Heavy)" chip when `program_id` is set.

**Ordering constraint:** Step 1 must be pushed before Step 5 ships, or the upsert silently 400s on unknown columns.

---

## 2. Make workout deletion visible in History

### Investigation

`app/(tabs)/history.tsx:182-200` — the card is a `Pressable` with `onPress` → detail and **`onLongPress` → delete modal** (`:189-192`). The only affordance is the accessibility label (`:199`): `"… — long press to delete"`, which is invisible to sighted users.

`handleDelete` (`:117-139`) is already correct and complete: optimistic removal, server call, AsyncStorage reconciliation, rollback + toast on failure. **The deletion logic is fine — only the affordance is missing.**

`react-native-gesture-handler` is installed and `GestureHandlerRootView` already wraps the app (`_layout.tsx:48`), so `ReanimatedSwipeable` is available with zero new dependencies.

### Diagnosis

Pure discoverability defect. No state, network, or data-integrity dimension.

### Implementation guide

Recommend **swipe-to-delete plus a visible trailing affordance** — swipe is the iOS-native idiom the user already expects in a list, and the visible icon solves discoverability for people who don't try swiping.

1. Extract `renderWorkoutCard` (`:177-228`) into `components/workout/HistoryCard.tsx`.
2. Wrap in `ReanimatedSwipeable` with a `renderRightActions` panel: full-height `dangerColor` button, `trash` SF Symbol via `IconSymbol`, ~88pt wide.
3. Replace the chevron at `:224` with a `48×48` overflow button (`ellipsis` symbol, `hitSlop={8}`) opening an `ActionSheetIOS` with `Delete` (destructive) / `Cancel`.
4. **Keep `onLongPress`** — removing it would break muscle memory for existing users at no benefit.
5. Update the a11y label at `:199` to drop "long press to delete" and add `accessibilityActions={[{name:'delete', label:'Delete workout'}]}` so VoiceOver users get a real rotor action rather than a text hint.

All three paths call the existing `setSelectedId` + `setDeleteModalVisible`, so `handleDelete` is untouched.

---

## 3. Do not auto-start the rest timer after logging a set

### Investigation

Two call sites, one per parse path:

- **`app/(tabs)/index.tsx:1091-1099`** — fast regex path. After syncing rows: finds the last non-cardio row, then `startRestTimer({exercise, repsLastSet, isCompound})`.
- **`app/(tabs)/index.tsx:1182-1190`** — AI fallback path. Identical block against `newRows`.

`startRestTimer` is `start` from `useSharedRestTimer` (`:298`). In `hooks/useRestTimer.ts:145-155` it immediately sets `running` state **and fires a local notification** (`:151-153`) when `rest_timer_enabled && permission_granted`.

The user's premise is correct and the code confirms it: logging is a *data-entry* action here. `structuredGate` also supports pre-filling skeleton rows and batch entry (`index.tsx:930`, `:958`) — in the batch case the auto-start is unambiguously wrong, since the user just typed several sets at once and can't have performed them all.

### Diagnosis

Correct behavior conflated with correct data. Compounding factor: a wrongly-started timer also **schedules a push notification** that fires minutes later — the failure is not silent.

### Decision (updated) — make it a toggle, not a removal

User preference: don't remove auto-start outright — add a **Settings switch** ("Auto-start rest timer after logging a set"), alongside the existing `rest_timer_enabled` control. Default it **off** (matches the original complaint), but let users opt back into the old behavior.

- Toggle **off** (default): logging a set never calls `startRestTimer()` directly — show the dismissible "Start Rest" prompt (Step 2 below) instead.
- Toggle **on**: preserve today's behavior exactly — `startRestTimer()` fires immediately at both call sites, and the prompt is skipped (nothing to prompt for if it's already running).

Both call sites stay in the code; they just get wrapped in one setting check instead of being deleted.

### Implementation guide

**Step 0 — Add the setting.** New boolean, `auto_start_rest_timer`, default `false`. Client-only AsyncStorage setting is fine if this shouldn't sync across devices; otherwise add it to `profiles` alongside `rest_timer_enabled`. Add a switch row in Settings next to the existing rest-timer controls.

**Step 1 — Gate both auto-start call sites behind the setting** (`:1091-1099`, `:1182-1190`) — do not delete them:

```ts
if (autoStartRestTimer) {
  startRestTimer({exercise, repsLastSet, isCompound});
} else {
  setRestPrompt({exercise, repsLastSet, isCompound, at: Date.now()});
}
```

**Step 2 — New `components/workout/StartRestPrompt.tsx`.** A dismissible pill rendered near the top of the workout screen, driven by new state:

```ts
const [restPrompt, setRestPrompt] = useState<
  { exercise: string; reps?: number; isCompound: boolean; at: number } | null
>(null);
```

At each former call site, replace `startRestTimer(...)` with `setRestPrompt({...})`.

**Step 3 — Behavior.**
- Copy: `Start rest · 2:30` (precompute via `suggestRestSeconds` from `lib/restTimer.ts:25` so the duration is visible *before* tapping).
- Tap → `startRestTimer(hints)` then `setRestPrompt(null)`.
- Dismiss: an `×` at ≥44pt, **plus** auto-expire after ~45s via a `useEffect` timeout keyed on `restPrompt?.at`.
- Logging another set replaces the prompt rather than stacking.
- Must not shift layout — absolutely positioned below the header, matching the `RestTimerToast` placement pattern (`RestTimerToast.tsx:71`).

**Step 4 — Suppress while a timer already runs:** render only when `state.kind === 'idle'`. Otherwise the prompt and the live timer compete, re-creating #8.

**Note:** the "Start rest" affordance the user asked for at the top of the screen and the consolidated timer indicator from #8 occupy the same region. **Build #8 first, then slot this prompt into the same container** — otherwise you'll ship a third overlapping element.

---

## 4. AI grammar and writing quality

### Investigation

Four functions call OpenAI; **all four use `gpt-4o-mini`** (`chat:156`, `coach:306`, `nutrition-analyze:202`, `meal-plan:119`).

The user-visible prose comes from `coach`. Its config (`coach/index.ts:305-309`):

```ts
body: JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    stream: true,
}),
```

**No `temperature`.** Compare siblings: `chat` uses `0.2` (`:163`), `nutrition-analyze` uses `0` (`:203`), `meal-plan` uses `0.5` (`:125`). Coach is the only one that omits it — so it runs at the OpenAI default of **1.0**.

The prompt itself (`coach/index.ts:33-46`) contains, verbatim at **line 39**:

```
- logically think if your response must be over 75 words and if so, under 200
```

And at **line 45**:

```
- Keep answers focused and actionable, 100-200 words.
```

### Diagnosis

Three compounding causes, in order of impact:

1. **`temperature` unset → 1.0.** This is the dominant driver. At 1.0 a 4o-mini produces meaningfully more meandering syntax, redundant clauses, and awkward constructions than at 0.3–0.5. It is a one-line fix and should land first.
2. **Line 39 is itself ungrammatical and semantically incoherent.** "logically think if your response must be over 75 words and if so, under 200" has no clear reading. Models mirror the register of their instructions; a malformed constraint both confuses the length target and licenses sloppy prose. It also **contradicts line 45** (two different length rules).
3. **No writing-quality instruction exists at all.** The prompt covers content (cite numbers, identify trends) and formatting (no markdown, `:46`) but says nothing about grammar, sentence structure, or terminology.

`daily-feedback` is *not* implicated: `buildNarrative` (`daily-feedback/index.ts:97`) is deterministic template code, not an LLM call. Its output quality is a code concern, not a prompt one.

### Implementation guide

**Step 1 — Add temperature** (`coach/index.ts:305-309`). Highest impact, lowest risk:

```ts
body: JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.4,
}),
```

**Step 2 — Rewrite the prompt.** Replace `coach/index.ts:33-46` wholesale:

```ts
const SYSTEM_PROMPT = `You are Coach, a direct, knowledgeable strength coach for Coach Kettle, a workout tracking app.

You have access to the user's profile, recent workout history, and personal records. Use that data to give specific, personalized advice.

CONTENT
- Reference the user's actual numbers, exercises, and patterns.
- When asked about a lift, cite their recent performance and PR for that lift.
- Name the trend explicitly: progressing, plateauing, or regressing.
- Recommend one concrete next step (a weight increase, a volume change, a deload).
- Align advice with the goals stated in their profile.
- If you have no history for what they asked, say so plainly. Never invent numbers.

WRITING
- Write 100-200 words. Never exceed 200.
- Use complete, grammatical sentences in the second person.
- One idea per sentence. Prefer short sentences to long ones.
- Use the app's terms exactly: set, rep, e1RM, PR, deload, volume, intensity.
- Write weights as "225 lb" and sets as "3x5".
- No filler openers ("Great question!"), no hedging, no rhetorical questions.
- Plain text only. No markdown, bold, italics, bullets, or emoji.`;
```

Changes that matter: the incoherent line 39 is gone; the two contradictory length rules are collapsed into one; an explicit WRITING section now governs grammar, person, sentence length, and terminology; unit formatting is pinned so output is consistent with the UI.

**Step 3 — Consider `gpt-4o` for `coach` only.** It is the sole surface producing long-form prose a user reads closely. `chat` (JSON extraction at temp 0.2) and `nutrition-analyze` (temp 0) should stay on mini — deterministic extraction doesn't benefit. Cost impact is bounded by the existing AI gate (`gateAiRequest`, `coach/index.ts:115`). **This is a cost decision, so I've left it as a recommendation rather than applying it.**

**Step 4 — Also fix `chat`'s ANSWER MODE** (`chat/index.ts:53-55`). "Maximum 50 words. Be direct and gym-focused." → add "Write complete, grammatical sentences. Plain text only."

---

## 5. Prevent the tutorial from repeatedly appearing

### Investigation

**This was substantially fixed already**, in commit `156c218` ("show tutorial only on first-ever login + remove video crash surface"). Reporting that plainly rather than re-fixing it:

- `lib/tutorialState.ts` persists `tutorial_shown_v1` in AsyncStorage.
- The gate (`app/(tabs)/index.tsx:377-383`) shows the modal only when `!shown && rows.length === 0 && !workoutActive`.
- `AuthProvider.clearAllCaches` **deliberately preserves** the key, with a comment at `contexts/AuthProvider.tsx:54-56` explaining why. I confirmed the removal filter (`:63-68`) can't catch it incidentally — `tutorial_shown_v1` matches none of `sb-`, `supabase`, `auth`, or `coach-kettle:nutrition`.
- Every dismissal path routes through `handleDismiss` → `markTutorialShown()`: Skip (`TutorialModal.tsx:141`), hardware back (`:135` `onRequestClose`), and the final button. **No bypass exists.**
- A manual re-entry already exists in Settings (`app/settings/index.tsx:300-303`).

So: signing out and back in on the same device will **not** re-show it.

### Diagnosis

Three residual gaps remain — real, but narrower than the report implies:

1. **The flag is device-local, never user-scoped.** Reinstall, new device, or a second device replays the tutorial. There is no `profiles.tutorial_completed_at`.
2. **One expected replay on upgrade.** Users who installed before `tutorial_shown_v1` existed have a null key and will see it exactly once after updating. If the report was filed on a pre-`156c218` build, this is very likely what was observed.
3. **Finding F — no error handling.** `TutorialModal.tsx:90-96`: `await markTutorialShown()` is unguarded. An AsyncStorage failure rejects before `onDismiss()` runs, leaving the modal **permanently open with no exit**. Low probability, total severity.

### Implementation guide

**Step 1 — Fix Finding F first** (2 lines, prevents a hard lock):

```ts
const handleDismiss = async () => {
  try { await markTutorialShown(); }
  catch (e) { console.warn('[tutorial] persist failed', e); }
  setCurrentIndex(0);
  onDismiss();
};
```

Dismissal must never depend on a successful write.

**Step 2 — Server-side flag** (closes gap 1):

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMPTZ NULL;
```

Then in `lib/tutorialState.ts`, make `isTutorialShown()` check local first (fast path, offline-safe) and fall back to `profile.tutorial_completed_at != null`; `markTutorialShown()` writes both, with the server write fire-and-forget. Local remains the source of truth for the render decision so the gate never blocks on network.

**Step 3 — Add a Help entry on the workout screen.** `MenuModal` already has `onNavigateTemplates` (`index.tsx:1321`); add a parallel "Tutorial" item so the manual path isn't buried in Settings. The final slide already promises this (`TutorialModal.tsx:70`: "Tap ? any time to revisit this guide") — a promise the workout screen doesn't currently keep.

---

## 6. Auto-select training days when choosing a split

### Investigation

`app/program/create.tsx` collects Goal (`:154`), Split (`:168`), Days per week (`:182`), Weeks total (`:187`), Periodization (`:192`). **There is no weekday selector, and the screen never reads or writes `profiles.training_days`** — confirmed by grep: `training_days` appears in the client only at `app/settings/profile.tsx:62,76,111`, a manual multi-select entirely disconnected from program creation.

The infrastructure is otherwise complete:
- `profiles.training_days SMALLINT[]` exists (`20260703000000_…:17`).
- `lib/trainingSchedule.ts:19-27` already implements exactly the requested precedence: explicit days win, `TRAINING_DAY_MAP` is the fallback.
- `TRAINING_DAY_MAP` (`:5-13`) maps 1–7 days/week to weekday sets.

### Diagnosis

Not a bug — an unbuilt feature, on top of infrastructure that's already correct. The only *defect* here is Finding E: `NotificationsProvider:82,110` reads `TRAINING_DAY_MAP[training_days_per_week]` directly and never consults `profile.training_days`, violating the precedence `isTrainingDay` documents. So even today, a user who sets explicit days in Settings gets reminders on the wrong days.

### Implementation guide

**Step 1 — Split → weekday map.** New export in `lib/trainingSchedule.ts` (keeping schedule logic in one module):

```ts
/** Suggested weekdays per split at a given days/week. null = no canonical schedule → Custom. */
export const SPLIT_DAY_SUGGESTIONS: Record<string, Record<number, number[]>> = {
  ppl_3day:      { 3: [1, 3, 5] },
  upper_lower:   { 2: [1, 4], 4: [1, 2, 4, 5] },
  full_body:     { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5] },
  pp_sh_l_5day:  { 5: [1, 2, 3, 4, 5] },
  pp_sh_l_6day:  { 6: [1, 2, 3, 4, 5, 6] },
};

export function suggestTrainingDays(split: string, daysPerWeek: number): number[] | null {
  return SPLIT_DAY_SUGGESTIONS[split]?.[daysPerWeek] ?? null;
}
```

Rest days are placed on Wed/weekend where the split allows, which is the conventional arrangement.

**Step 2 — Wire into create.** Add `const [trainingDays, setTrainingDays] = useState<number[]>([])` and `const [scheduleTouched, setScheduleTouched] = useState(false)`. On split or days-per-week change:

```ts
useEffect(() => {
  if (scheduleTouched) return;              // never clobber a manual edit
  setTrainingDays(suggestTrainingDays(split, daysPerWeek) ?? []);
}, [split, daysPerWeek, scheduleTouched]);
```

The `scheduleTouched` latch is what delivers "the user should still be able to modify the suggested schedule afterward" — without it, re-selecting a split silently discards their edits.

**Step 3 — Weekday selector.** Seven S/M/T/W/T/F/S toggles reusing the existing `Pill` component (`create.tsx:77-106`) so it matches the screen. Setting `setScheduleTouched(true)` on any tap. Show `Custom schedule` as the section subtitle when `suggestTrainingDays()` returned `null` or the selection diverges from the suggestion — this is the "treat as Custom rather than forcing predetermined days" requirement.

**Step 4 — Persist.** In `handleSubmit` (`:58-75`), after `create(...)` succeeds, patch the profile with `training_days: trainingDays.length ? [...trainingDays].sort() : null` — matching the shape `settings/profile.tsx:111` already writes.

**Step 5 — Fix Finding E.** In `contexts/NotificationsProvider.tsx:82` and `:110`, replace the direct map lookup with the precedence-aware path:

```ts
const explicit = profile?.training_days;
const trainingDays = explicit?.length
  ? explicit
  : (TRAINING_DAY_MAP[Number(profile?.training_days_per_week ?? 0)] ?? []);
```

and add `profile?.training_days` to both dependency arrays. Without this, #6 ships a schedule the notification system ignores.

---

## 7. Add the missing Full Body split template

### Investigation

**This is the most severe issue in the list — it is a hard failure, not a polish item.**

The validator accepts six splits (`programming/index.ts:30`):

```ts
const VALID_SPLIT = new Set(["ppl_3day", "pp_sh_l_5day", "pp_sh_l_6day", "upper_lower", "full_body", "custom"]);
```

`0035_programming_engine.sql:160-281` seeds **three** template rows: `ppl-3day`, `pp-sh-l-5day`, `pp-sh-l-6day`. I confirmed no later migration adds more (`grep program_templates supabase/migrations` → `0035` and `0043`, and `0043` only rewrites `rest` values).

`app/program/create.tsx:24-29` offers **Full Body** in the UI.

Execution path when a user picks it:

```
create.tsx:62  create({split_type: 'full_body', …})
  → programming/index.ts:316  VALID_SPLIT.has('full_body') → true, passes validation
  → :67-73  .eq("split_type", 'full_body').maybeSingle() → null
  → :73     throw new Error("template not found for split_type full_body")
  → :384    500 { error: "template not found for split_type full_body" }
  → create.tsx:71  showToast("template not found for split_type full_body", 'error')
```

The user picks an advertised option and gets a raw internal error string in a toast.

### Diagnosis

Validation list and seed data diverged. `full_body` is user-reachable and **100% fails**; `upper_lower` (Finding A) is identically broken but not yet exposed in the UI.

Secondary (Finding B): the template's day count is fixed, so `days_per_week` doesn't affect generation. The request explicitly asks for "workout-day generation based on the selected number of days per week," which the current template model cannot express with one row per split.

### Implementation guide

**Step 1 — Migration `0050_full_body_and_upper_lower_templates.sql`.** Seed one row per (split, days-per-week) pair. This requires relaxing the unique constraint from `slug` alone — the existing table already has `days_per_week` (`0035:144`), it's simply unused as a lookup key.

```sql
INSERT INTO public.program_templates (slug, name, description, split_type, days_per_week, goal_types, structure)
VALUES
  ('full-body-3day', '3-Day Full Body',
   'Every session trains the whole body. Best for beginners and anyone training three days a week.',
   'full_body', 3, '["muscle_building","strength","weight_loss","maintenance"]'::jsonb,
   '{"days":[
     {"day":1,"body_part":"Full Body","title":"Full Body A","exercises":[
       {"slug":"back-squat","sets":3,"reps":[5,8],"rest":180},
       {"slug":"barbell-bench-press","sets":3,"reps":[6,8],"rest":150},
       {"slug":"barbell-row","sets":3,"reps":[8,10],"rest":120},
       {"slug":"overhead-press","sets":2,"reps":[8,10],"rest":90},
       {"slug":"plank","sets":3,"reps":[30,60],"rest":60}]},
     {"day":2,"body_part":"Full Body","title":"Full Body B","exercises":[
       {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
       {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
       {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
       {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60},
       {"slug":"barbell-curl","sets":2,"reps":[10,12],"rest":60}]},
     {"day":3,"body_part":"Full Body","title":"Full Body C","exercises":[
       {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":150},
       {"slug":"pullup","sets":3,"reps":[6,10],"rest":120},
       {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
       {"slug":"tricep-pushdown","sets":3,"reps":[10,15],"rest":60},
       {"slug":"hip-thrust","sets":3,"reps":[10,12],"rest":90}]}]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
```

Add `full-body-2day` (A/B), `full-body-4day` (A/B/A/B), and `upper-lower-4day` on the same pattern.

**Every `rest` value must be ≥ 30 and every `reps` within 1..60** — `program_exercises` enforces `rest_seconds BETWEEN 30 AND 600` (`0035:117`) and `target_reps_* BETWEEN 1 AND 60` (`0035:113-114`). Migration `0043` exists precisely because the original seed violated this. The generator now clamps defensively (`programming/index.ts:166-178`), but seeding clean values keeps the data honest. **Every slug above must exist in `exercises`** — otherwise `exerciseNameBySlug.get()` falls back to the raw slug (`:158`) and the underscore bug from #10 reappears inside program day listings.

**Step 2 — Select by split *and* day count.** `programming/index.ts:67-73`:

```ts
let { data: tpl } = await admin.from("program_templates")
  .select("*").eq("split_type", split).eq("days_per_week", daysPerWeek).maybeSingle();

// Fall back to the closest available day count for this split.
if (!tpl) {
  const { data: alts } = await admin.from("program_templates")
    .select("*").eq("split_type", split).order("days_per_week", { ascending: true });
  if (alts?.length) {
    tpl = alts.reduce((best, c) =>
      Math.abs(c.days_per_week - daysPerWeek) < Math.abs(best.days_per_week - daysPerWeek) ? c : best);
  }
}
if (!tpl) return jsonRes({ error: "No template available for that split and day count." }, 400);
```

This resolves Finding B for the splits that have multiple variants, and degrades gracefully for the rest.

**Step 3 — Never leak internal errors to the UI.** `:73` currently throws a message that reaches the user's toast verbatim via `:384` → `create.tsx:71`. Return a **400 with user-facing copy** (as above) instead of a 500 with an internal string. Separately, `create.tsx:71` should map non-Error responses to a generic fallback.

**Step 4 — Add Upper/Lower to the UI.** Once seeded, add `{ value: 'upper_lower', label: 'Upper / Lower' }` to `SPLITS` (`create.tsx:24-29`). `SPLIT_LABELS` in `program/index.tsx:28` already has an entry for it.

**Step 5 — Regression guard.** A test asserting `VALID_SPLIT ⊆ {split_type values present in program_templates}`. This class of divergence recurs otherwise.

---

## 8. Fix duplicate/dual rest timer indicators

### Investigation

Both components subscribe to the **same** shared state via `useSharedRestTimer()` — so state is already consolidated. The duplication is purely in mounting:

| Component | Mounted at | Position | Hidden when |
|---|---|---|---|
| `RestTimerToast` | `app/_layout.tsx:50` — app root, above the navigator | `top: topInset + 8` (`:71`) | only on `/timer` (`:59-60`) |
| `RestTimerBar` | `app/(tabs)/index.tsx:1373` — workout screen | `bottom: 96` (`:18`) | never |
| `/timer` tab screen | `app/(tabs)/timer.tsx:32` | full screen | n/a |

`RestTimerToast` exempts itself only from `/timer` (`:59`). It does **not** exempt the workout tab. So while a rest runs on the workout screen the user sees a countdown chip pinned to the top **and** a countdown bar pinned to the bottom — both live, both with their own Pause/Skip controls.

Worse, both independently fire completion haptics on `state.kind === 'done'`: `RestTimerToast.tsx:43-47` and `RestTimerBar.tsx:25-29`. **The user gets a double haptic buzz** on every timer completion on the workout screen.

Their controls also differ, which is why "dismissing in one place doesn't feel consistent": the Bar shows Dismiss→`cancel()` on done (`:70`), the Toast shows Dismiss→`cancel()` plus a 6s auto-hide (`:49`), and the Bar has no auto-hide at all.

### Diagnosis

Not a state-management bug — a mounting/ownership bug. Two overlapping presentations of one state machine, with duplicated side effects (haptics) and divergent affordances.

### Implementation guide

**Decision (confirmed by user): keep `RestTimerToast`, delete `RestTimerBar`.** The Toast is the more capable component (progress bar, paused styling, auto-dismiss, tap-through to `/timer`) and its root mount means it already works on every screen. Retaining it gives one indicator everywhere with no per-screen wiring — only the top popup runs automatically; the full-screen `/timer` tab stays as the manual, opt-in detailed view, reached only when the user explicitly taps into it (the Toast already exempts that one route, `:59-60`).

1. **Delete `components/workout/RestTimerBar.tsx`** and its render at `app/(tabs)/index.tsx:1373` and import at `:32`.
2. **Move the haptic into the hook.** Add to `hooks/useRestTimer.ts:122-128`, inside the existing `running → done` transition guard, next to `fireWebNotification`:
   ```ts
   if (Platform.OS !== 'web') {
     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
   }
   ```
   Then remove the haptic effects from `RestTimerToast.tsx:43-47`. This is the correct home: that guard already exists specifically to distinguish a genuine completion from a rehydrated one (`:120-122`), so a hydrated stale timer won't buzz. **One state machine, one side effect.**
3. **Keep the `/timer` exemption** (`RestTimerToast.tsx:59-60`) — the full-screen dial is the intentional detailed view.
4. Reposition the Toast to coexist with the #3 "Start rest" prompt in one container so the two never overlap.
5. Rename `RestTimerToast` → `RestTimerIndicator` (it is no longer only a toast).

After this: `/timer` = full view; everywhere else = one chip; `useRestTimer` owns all side effects.

---

## 9. Remove low-quality or unnecessary emojis

### Investigation

Full Unicode-range sweep of `app/`, `components/`, `lib/`, `contexts/`, `hooks/`, `constants/`. **20 sites.** Classified:

**Decorative — remove or replace with SF Symbols:**

| Location | Emoji | Recommendation |
|---|---|---|
| `app/history/[id].tsx:56-62` | 🔥 💪 👍 🙂 😅 | `getRatingEmoji()` — **delete entirely.** A 1–10 rating with a colored badge already communicates this; 😅 for a low rating reads as mockery of the user's session. |
| `constants/subscription.ts:56,61,66,71` | 💬 📊 📋 🍽️ | Paywall feature icons — the highest-stakes surface in the app. → `bubble.left.and.bubble.right`, `chart.line.uptrend.xyaxis`, `list.bullet.rectangle`, `fork.knife` |
| `components/celebration/PRCelebration.tsx:116` | 🏆 | → `trophy.fill` in `tint`. Keeps the celebration, loses the cross-platform font inconsistency. |
| `app/history/[id].tsx:89` · `SessionReviewModal.tsx:256` | 📝 | → `square.and.pencil` |
| `app/history/[id].tsx:408` · `ReflectionInput.tsx:38` | 💭 | → `text.bubble` |
| `components/media/MediaPickerBubble.tsx:71` | 📷 | → `camera` |
| `components/ui/hello-wave.tsx:16` | 👋 | Template scaffolding — verify unused, then delete the file. |

**Functional glyphs — keep.** These are typographic marks, not emoji, and render consistently: `✓` (`structuredGate.ts:746`, `history/[id].tsx:77`, `SessionReviewModal.tsx:225`, `coach/index.tsx:145`, `coach/history.tsx:88`, `nutrition-preferences.tsx:177`), `✗` (`coach/index.tsx:145`), `✕` (`MediaPickerBubble.tsx:139`, `ImageViewerModal.tsx:57`), `↑` (`history/[id].tsx:83`, `SessionReviewModal.tsx:242`), `•` bullets.

That said, `✕` at `MediaPickerBubble.tsx:139` and `ImageViewerModal.tsx:57` are **close buttons** — those specifically should become `xmark.circle.fill` for a proper tap target and platform-correct appearance.

### Diagnosis

Two failure modes: (a) emoji standing in for icons in an app that already has a real icon system (`IconSymbol` / `expo-symbols`, used throughout Settings), and (b) emoji encoding *sentiment* about the user's performance (`getRatingEmoji`) — the most damaging to a "harsh, honest coach" product identity.

### Implementation guide

1. **Delete `getRatingEmoji`** (`app/history/[id].tsx:56-62`) and its call sites. The colored `ratingBadge` (`history.tsx:207-211`) already carries this signal.
2. **Change `PRO_FEATURES.icon` from emoji string to SF Symbol name.** `constants/subscription.ts:52-75`. Update the paywall renderer to `<IconSymbol name={f.icon} size={24} color={tint} />`. Requires typing `icon` as `SymbolViewProps['name']`.
3. **Replace section-header emoji with `IconSymbol`** at the six sites in the table above, sized 16–18 and tinted with the existing per-section color (`accentColor`, `warningColor`, `tint`) so nothing else about the layout changes.
4. **Delete `components/ui/hello-wave.tsx`** after confirming zero imports.
5. **Keep every `✓ ✗ ✕ ↑ •`** except the two close buttons noted above.

`IconSymbol` has an iOS implementation (`icon-symbol.ios.tsx`, `expo-symbols`) and a fallback (`icon-symbol.tsx`) — **verify every new symbol name exists in the fallback's Material mapping**, or Android renders nothing.

---

## 10. Clean up the Exercise Detail page

### Investigation

**Underscores — exact source identified.** I parsed the seed migration directly:

```
equipment values:        body_weight (325), dumbbell (294), cable (157), barbell (154),
                         leverage_machine (81), band (54), smith_machine (48), kettlebell (41),
                         weighted (36), stability_ball (28), ez_barbell (23), assisted (15),
                         sled_machine (15), medicine_ball (13), rope (10), roller (8),
                         resistance_band (7), bosu_ball (3), olympic_barbell (2),
                         wheel_roller (2), upper_body_ergometer (1), skierg_machine (1),
                         stationary_bike (1), trap_bar (1)

primary_muscles values:  biceps (315), triceps (302), glutes (215), forearms (200),
                         shoulders (191), abs (169), pectorals (158), hamstrings (155),
                         delts (143), quadriceps (110), upper_back (89), lats (82),
                         calves (70), obliques (67), hip_flexors (66), chest (53),
                         traps (47), quads (44), trapezius (36), cardiovascular_system (29),
                         deltoids (24), spine (19), ankles (11), core (7), adductors (6),
                         lower_back (6), serratus_anterior (5), abductors (5),
                         rotator_cuff (4), soleus (4)
```

Sample seed row (`20260708000100_exercise_dataset_seed.sql`):
```sql
('3-4-sit-up','3/4 sit-up','[]','compound','["abs","hip_flexors"]',
 '["hip_flexors","lower_back"]','["body_weight"]','Abs',NULL,'[]','[]',…)
```

These are rendered **raw**, with no formatting layer, at six places in `app/exercise-library/[slug].tsx`:

- `:100` `Body part: {exercise.body_part}`
- `:103` `Category: {exercise.category}`
- `:106` `Difficulty: {exercise.difficulty}`
- `:109` `Equipment: {exercise.equipment.join(', ')}` → **"body_weight"**
- `:155` `Primary: {exercise.primary_muscles.join(', ')}` → **"abs, hip_flexors"**
- `:158` `Secondary: {exercise.secondary_muscles.join(', ')}` → **"hip_flexors, lower_back"**

**Clipped title — root cause in `ScreenHeader`.** `[slug].tsx:87` passes the full exercise name. In `components/ui/screen-header.tsx`:

- `:57` the `<View>` wrapping title+subtitle has **no `flex: 1` and no `flexShrink: 1`**.
- `:99-102` `styles.title` is `fontSize: 26, fontWeight: "800"` with **no `numberOfLines`** and no `adjustsFontSizeToFit`.
- `:77-81` `headerTop` is `flexDirection: "row"` with `justifyContent: "space-between"`.

An unconstrained `Text` inside a non-flexing `View` in a row overflows its container. Dataset names like *"Barbell Bench Press Against Chains"* or *"Cable Standing Rear Delt Row (with Rope)"* run past the screen edge and clip. **This affects every screen using `ScreenHeader` with a long title, not just this one.**

Additional presentation issues: five near-identical unstyled cards with no visual hierarchy; `Overview` is four flat `label: value` lines rather than chips; `instructions.en` is joined with `\n` (`:78`) and rendered as one text block (`:165`) despite being a numbered step array; `SHOW_EXERCISE_MEDIA = false` (`:14`) leaves no image, so the page is pure text with no anchor.

### Diagnosis

A raw-database-passthrough defect (no presentation layer between DB vocabulary and UI) plus a genuine layout bug in a **shared** component. The user's phrase "like raw database content being rendered directly" is literally accurate.

### Decision (confirmed by user)

Fix `ScreenHeader` directly, not a local workaround on this one page. The bug is systemic — any screen with a long title hits it, not just Exercise Detail — and the fix (`flexShrink: 1` + `numberOfLines={2}` + `adjustsFontSizeToFit`) is additive: screens whose titles already fit on one line render identically. The "CRITICAL" GitNexus flag reflects how many screens *use* `ScreenHeader`, not the risk of this specific change. A quick visual pass over program, settings, coach, history, and nutrition after the change is enough to confirm nothing regressed.

### Implementation guide

**Step 1 — Formatting layer.** New `lib/exerciseFormat.ts`:

```ts
/** Terms whose canonical casing is not simple title-case. */
const OVERRIDES: Record<string, string> = {
  ez_barbell: 'EZ Bar', body_weight: 'Bodyweight', leverage_machine: 'Machine',
  smith_machine: 'Smith Machine', olympic_barbell: 'Olympic Barbell',
  upper_body_ergometer: 'Upper-Body Ergometer', skierg_machine: 'SkiErg',
  bosu_ball: 'BOSU Ball', trap_bar: 'Trap Bar', wheel_roller: 'Ab Wheel',
  cardiovascular_system: 'Cardiovascular System', lats: 'Lats', abs: 'Abs',
  delts: 'Delts', quads: 'Quads', traps: 'Traps', glutes: 'Glutes',
};

export function formatTerm(raw: string): string {
  if (!raw) return '—';
  const key = raw.toLowerCase().trim();
  if (OVERRIDES[key]) return OVERRIDES[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTermList(raw: string[] | null | undefined): string {
  return raw?.length ? raw.map(formatTerm).join(', ') : '—';
}
```

The override table matters: naive title-casing yields "Ez Barbell" and "Bosu Ball", which look as unpolished as the underscores.

**Step 2 — Apply at all six sites** in `[slug].tsx` (`:100, :103, :106, :109, :155, :158`), and at `index.tsx:171, :174` for the list cards (#11).

**Step 3 — Fix `ScreenHeader` — this is the highest-leverage change in this section.** In `components/ui/screen-header.tsx`:

```diff
-                    <View>
+                    <View style={{ flex: 1 }}>
                         <ThemedText style={styles.title}>{title}</ThemedText>
+                        {/* numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} */}
```

Add `numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}` to the title, and `flexShrink: 1` to `styles.headerLeft` (`:82-86`). **Regression-check every screen using `ScreenHeader`** — it's used across program, exercise-library, settings, coach, history, and nutrition.

**Step 4 — Restructure the page.**
- **Hero:** exercise name (h1, in-page, wrapping — not only in the header), with `category` / `difficulty` / `body_part` as pills beneath.
- **Overview → chip grid.** Equipment as individual chips rather than a comma string.
- **Instructions as an ordered list.** `instructions.en` is already `string[]` (`types/exercise.ts:25`); stop joining at `:78` and render numbered rows with the `bulletRow` pattern from `:128-131`.
- **Muscles:** two labeled chip rows, primary in `tint`, secondary in `placeholder`.
- **Hide empty cards.** `Cues` and `Common mistakes` are `'[]'` for all 1,324 imported rows — currently every dataset exercise shows two cards saying "No cues available." / "No common mistakes listed." (`:122-125`, `:138-141`). **Render these sections only when non-empty.** This alone removes the two emptiest cards from ~99% of detail pages.
- Vary card padding/typography so `cardTitle` (15/700) and `body` (14/400) actually establish hierarchy.

---

## 11. Finish and polish the Exercise Library page

### Investigation

**Defect 1 — no virtualization.** `app/exercise-library/index.tsx:154-187` renders `filtered.map(...)` inside a plain `ScrollView` (`:92`). The dataset is **1,324 rows** (`20260708000100_exercise_dataset_seed.sql` header). Every card mounts a `Pressable`, three `ThemedText`s, and a `View` — ~6,600 native views on mount, all retained. This is the single largest contributor to the page feeling unfinished: slow first paint, janky scroll, high memory.

**Defect 2 — filter pills that return nothing.** `BODY_PARTS` (`:13`) is hardcoded:

```ts
['Push', 'Pull', 'Legs', 'Shoulders', 'Chest', 'Back', 'Bis', 'Tris', 'Abs', 'Cardio']
```

I parsed the actual distinct `body_part` values from the seed:

```
Legs 286 · Back 203 · Abs 169 · Chest 163 · Bis 151 · Shoulders 143
Tris 141 · Lower Arms 37 · Cardio 29 · Neck 2
```

The filter is an exact-equality match (`:86`: `e.body_part === bodyPartFilter`). Therefore:

- **"Push" and "Pull" match ~0 of 1,324 rows** — only the 7 curated rows from `0032` use those labels. Two of ten pills are effectively dead.
- **"Lower Arms" (37) and "Neck" (2) are unreachable** — no pill exists for them.

**Defect 3 — filter and search fight each other.** `bodyPartFilter` is applied client-side (`:84-87`) over `exercises`, but `searchExercises` replaces that array with **server results capped at 25** (`exercise-library/index.ts:87`). So filtering after searching filters 25 rows, not the library. Clearing the query silently refetches the full list (`:52-59`), discarding the active filter's context. Meanwhile `action=by_body_part` exists server-side (`:91-100`) and is **never called**.

**Defect 4 — possible silent truncation (Finding C).** `action=list` (`:57-63`) has no `.limit()` and no `.range()`. PostgREST enforces a max-rows ceiling (commonly 1,000). With 1,324 rows the list is likely truncated — and the code cannot tell, because a truncated response is a valid 200.

**Defect 5 — visual.** Raw `category`/`body_part` on cards (`:171`, `:174`); no result count; no search icon or clear button; no `keyboardShouldPersistTaps`, so the first tap after typing only dismisses the keyboard; a bare `ActivityIndicator` (`:146`) rather than skeletons; `firstCue` (`:155`) is null for all 1,324 imported rows, so the third line is always absent on dataset entries.

### Diagnosis

The page was built against the 18 curated rows from `0032` and never revisited after commit `c2debfb` imported 1,324. Every defect above is that mismatch: the filter vocabulary, the non-virtualized list, the client-side filtering, and the missing pagination all worked fine at n=18 and fail at n=1,324.

### Implementation guide

**Step 1 — `FlatList` (highest impact).** Replace the `ScrollView` + `.map()` (`:92`, `:154-187`) with:

```tsx
<FlatList
  data={filtered}
  keyExtractor={(ex) => ex.id}
  renderItem={renderExerciseCard}
  ListHeaderComponent={SearchAndFilters}
  keyboardShouldPersistTaps="handled"
  initialNumToRender={12}
  maxToRenderPerBatch={10}
  windowSize={7}
  removeClippedSubviews
  contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
/>
```

Cards are fixed-height once `firstCue` is dropped, so add `getItemLayout` for O(1) scroll positioning.

**Step 2 — Derive filters from data, never hardcode.**

```ts
const bodyParts = useMemo(
  () => [...new Set(exercises.map((e) => e.body_part).filter(Boolean))].sort(),
  [exercises],
);
```

This automatically fixes the dead Push/Pull pills and surfaces Lower Arms and Neck. **Do not just add the two missing labels to the hardcoded array** — that leaves the same class of bug for the next data import.

**Step 3 — Server-side filtering.** When a body-part pill is active, call the existing unused `action=by_body_part` (`exercise-library/index.ts:91-100`) instead of filtering client-side. Add a matching `getExercisesByBodyPart()` to `lib/exerciseLibrary.ts`. Make search and filter compose: pass `body_part` as an optional param to `action=search` and add `.eq("body_part", bp)` to that query.

**Step 4 — Paginate `action=list`** with `.range(offset, offset + 199)` and return a `total`, then either page on scroll or (simpler) load all pages once into the existing 24h AsyncStorage cache (`lib/exerciseLibrary.ts:9-10`). **Bump `CACHE_KEY` to `exercise_library_v3`** — users on `v2` hold a possibly-truncated cached list for up to 24h after the fix ships, and without a key bump they'd never see it.

**Step 5 — Raise the search limit** from 25 (`:87`) to 50, and add a `total`/`has_more` field so the UI can say "Showing 50 of 213."

**Step 6 — Visual pass.**
- `formatTerm()` (from #10) on the card meta tags (`:171`, `:174`).
- Search field: `magnifyingglass` leading icon, `xmark.circle.fill` clear button, `clearButtonMode="while-editing"`.
- Result count under the search bar: `1,324 exercises` / `37 in Lower Arms`.
- Cards: name (16/700), meta chips, chevron on the right for affordance parity with History.
- Empty state: "No exercises match 'xyz'" + a Clear filters button, replacing the generic `No exercises found.` (`:150`).
- 6–8 skeleton cards instead of the bare spinner (`:146`).
- Sticky section headers by body part when unfiltered — leverages the existing server ordering (`exercise-library/index.ts:60`: `.order("body_part")`).

---

## 12. Remove duplicate workout/split names from program-day titles

### Investigation

Root cause is a single expression. `app/program/week.tsx:57-60`:

```tsx
<ThemedText style={styles.dayTitle}>
  Day {day.day_index} · {day.body_part}
  {day.title ? ` — ${day.title}` : ''}
</ThemedText>
```

It concatenates `body_part` and `title` unconditionally. From the 6-day template seed (`0035:247`):

```json
{"day": 2, "body_part": "Pull", "title": "Pull (Heavy)", …}
```

Rendering: **`Day 2 · Pull — Pull (Heavy)`** — exactly the reported duplication.

Not every day is affected, which is why it looks inconsistent. From the same template (`0035:240-278`):

| day | body_part | title | Renders |
|---|---|---|---|
| 1 | Push | Push (Heavy) | `Push — Push (Heavy)` ❌ |
| 2 | Pull | Pull (Heavy) | `Pull — Pull (Heavy)` ❌ |
| 3 | Shoulders | Shoulders + Arms | `Shoulders — Shoulders + Arms` ❌ |
| 4 | Legs | Legs (Heavy) | `Legs — Legs (Heavy)` ❌ |
| 5 | Push | Push (Volume) | `Push — Push (Volume)` ❌ |
| 6 | Pull | Pull (Volume) + Legs Light | `Pull — Pull (Volume) + Legs Light` ❌ |

And from the 3-day template (`0035:168-191`), `body_part` and `title` are **identical** (`"Push"`/`"Push"`), so the ternary at `:59` renders `Day 1 · Push` — correct, by accident.

The 5-day template (`0035:201-231`) has genuinely complementary values (`"Push"` / `"Chest + Triceps"`), where showing both is *desirable*.

The same latent issue exists at `app/program/day.tsx:91` (`Day ${day.day_index} — ${day.body_part}`), though that screen is unreachable (Finding D).

### Diagnosis

`body_part` (a category, for grouping/filtering) and `title` (a display label) overlap in the seed data, and the view layer concatenates them with no relationship check. Two valid fixes:

- **(a) Normalize the data** — strip the redundant prefix from `title` in a migration.
- **(b) Normalize the display** — a formatter that drops `body_part` when `title` already contains it.

**Recommend (b), and only (b).** The data isn't wrong: `body_part: "Pull"` is correct metadata and is legitimately used for grouping. `title` is correct as a display label. The bug is purely in how they're combined — and (b) also protects against future templates (including the Full Body rows from #7, where `body_part: "Full Body"` and `title: "Full Body A"` would produce `Full Body — Full Body A`). A data migration would fix today's three templates and leave the next one exposed.

### Implementation guide

**Step 1 — Shared helper.** New `lib/programFormat.ts` (so `week.tsx`, `day.tsx`, and the #1 workout title all agree):

```ts
import type { ProgramDay } from '@/types/programming';

/**
 * Combine body_part and title without repeating the split name.
 * "Pull" + "Pull (Heavy)"        → "Pull (Heavy)"
 * "Push" + "Chest + Triceps"     → "Push — Chest + Triceps"
 * "Push" + "Push"                → "Push"
 * "Full Body" + "Full Body A"    → "Full Body A"
 */
export function formatProgramDayLabel(day: Pick<ProgramDay, 'body_part' | 'title'>): string {
  const part  = (day.body_part ?? '').trim();
  const title = (day.title ?? '').trim();

  if (!title) return part || 'Workout';
  if (!part)  return title;

  const p = part.toLowerCase();
  const t = title.toLowerCase();

  // Title already leads with (or equals) the body part → title alone is sufficient.
  if (t === p || t.startsWith(p)) return title;

  return `${part} — ${title}`;
}
```

`startsWith` rather than `includes`: `includes` would collapse `"Pull" + "Pull (Volume) + Legs Light"` correctly but would also mishandle a future title like `"Accessory Pull Work"`, where the body part is incidental mid-string and the prefix is genuinely informative.

**Step 2 — Apply.** `app/program/week.tsx:57-60`:

```tsx
<ThemedText style={styles.dayTitle}>
  Day {day.day_index} · {formatProgramDayLabel(day)}
</ThemedText>
```

And `app/program/day.tsx:91`:

```tsx
<ScreenHeader title={`Day ${day.day_index} — ${formatProgramDayLabel(day)}`} />
```

**Step 3 — Reuse in #1** for the workout session title, so History shows `Pull (Heavy)` and not `Pull - Pull (Heavy)`.

**Step 4 — Unit tests.** `lib/__tests__/programFormat.test.ts` (Node built-in runner, per `.claude/CLAUDE.md`) covering all six 6-day rows, the 3-day identical case, the 5-day complementary case, the Full Body case from #7, and null/empty inputs.

---

## Recommended sequencing

Ordered by dependency and risk, not by report order.

**Wave 1 — stop the bleeding (small, independent, high value)**
1. **#7 Step 1–3** — Full Body template. A user-reachable option that fails 100% of the time. Ship first.
2. **#4 Step 1** — add `temperature: 0.4` to `coach`. One line, largest single quality win.
3. **#5 Step 1** — `try/catch` in `handleDismiss`. Two lines, prevents a permanent modal lock.
4. **#12** — `formatProgramDayLabel` + tests. Self-contained.
5. **#8** — delete `RestTimerBar`, move haptic into the hook. Must precede #3.

**Wave 2 — UI correctness**
6. **#10 Step 1–3** — `formatTerm()` and the `ScreenHeader` fix. *The ScreenHeader change is app-wide — regression-check every screen using it.*
7. **#11 Step 1–4** — `FlatList`, data-derived filters, server-side filtering, pagination + cache-key bump.
8. **#2** — swipe + overflow delete.
9. **#3** — remove auto-start, add the Start Rest prompt (slots into the container from #8).
10. **#4 Step 2–4** — prompt rewrite.
11. **#9** — emoji pass.

**Wave 3 — features**
12. **#6** — split → training-days, plus the `NotificationsProvider` fix (Finding E).
13. **#1** — the full program → workout pipeline. Largest scope; depends on #12's formatter and #7's templates.

**Migrations required** (user runs `supabase db push`):
- `0049_program_day_cursor_and_workout_link.sql` — #1
- `0050_full_body_and_upper_lower_templates.sql` — #7
- `0051_profile_tutorial_completed.sql` — #5

**Edge functions to redeploy:** `programming` (#1, #7), `coach` (#4), `exercise-library` (#11), `history` (#1).

---

## Verification plan

Per `.claude/CLAUDE.md`, tests use the Node built-in runner and require a glob — `node --test "lib/__tests__/*.test.ts"`, never a bare directory. `tsconfig.json` excludes `supabase/functions/**` and `**/__tests__/**`, so `npx tsc --noEmit` covers neither; run both.

**Unit (`lib/__tests__/`)**
- `programFormat.test.ts` — all cases in #12 Step 4.
- `exerciseFormat.test.ts` — `body_weight → Bodyweight`, `hip_flexors → Hip Flexors`, `ez_barbell → EZ Bar`, `bosu_ball → BOSU Ball`, `[] → '—'`, `null → '—'`.
- `trainingSchedule.test.ts` — extend for `suggestTrainingDays`, including the `null` → Custom path.
- `restTimer.test.ts` — confirm no start path is invoked on log (guards against #3 regressing).

**Runtime checks that cannot be done statically — please confirm these**
1. **Finding C:** `SELECT count(*) FROM exercises;` (expect 1,342 = 1,324 + 18 curated), then count the array length returned by `action=list`. If it returns exactly 1,000, truncation is confirmed and #11 Step 4 is mandatory rather than precautionary.
2. **#7:** after the migration, `SELECT slug, split_type, days_per_week FROM program_templates;` should show ≥ 7 rows, and every value in `VALID_SPLIT` except `custom` must appear in `split_type`.
3. **#8:** start a rest timer from the workout tab and confirm exactly one indicator and **one** haptic pulse.
4. **#10:** open a dataset exercise (e.g. `/exercise-library/3-4-sit-up`) — Equipment should read `Bodyweight`, Primary `Abs, Hip Flexors`, and the title must not clip.
5. **#11:** tap every filter pill; none may return zero results, and `Lower Arms` (37) and `Neck` (2) must be present.

**Manual regression after the `ScreenHeader` change (#10 Step 3):** program, exercise-library, settings/*, coach, history, and nutrition screens — short titles must be unchanged, long titles must wrap to two lines rather than clip.

---

## Appendix — confidence

**Verified directly in source (high confidence):** #2, #3, #4, #7, #8, #10, #11, #12, and Findings A, B, D, E, F. Each cites a specific line whose behavior follows from the code as written.

**Verified with a caveat:** #5 — the code shows the recurrence is already largely fixed by `156c218`. If you still observe it on a build containing that commit, tell me and I'll dig further; the most likely explanation is that the report predates the fix.

**Verified as absent (feature gaps, not defects):** #1 and #6. I confirmed via grep that the relevant code paths do not exist, rather than inferring it.

**Requires runtime confirmation:** Finding C (PostgREST truncation) — the ceiling is deployment-configured and not visible in this repo.

**Not verified:** the five screenshots (macOS TCC, see the note at the top). My diagnoses for #10, #11, and #12 nonetheless reproduce the exact strings described in the written report — `Pull - Pull (Heavy)` from `0035:247` and the underscore values from the dataset seed — so I'm confident they address what the images show. Re-attach them from an accessible location if you'd like me to confirm the visual-polish specifics for #9, #10, and #11.
