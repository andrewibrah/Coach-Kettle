# Coach Kettle Bug Investigation and Implementation Guide

## Scope and evidence

This report covers the requested Program & Workout Flow, AI & Onboarding, Program Creation, Rest Timer, UI cleanup, Exercise Library, and program-title defects on branch `b65/66` at commit `7efd492`.

Evidence used:

- Static tracing through the React Native client, shared contexts/hooks, Supabase Edge Functions, and migrations.
- Fresh GitNexus index: 2,725 nodes, 6,652 edges, 223 flows.
- GitNexus concept queries and upstream impact analysis for the principal symbols.
- The five supplied QuickLook paths exist, but macOS TCC denied file reads from the Messages container and Preview could not expose a window. Screenshot-specific visual claims are therefore not invented; UI findings below are grounded in the code and the symptoms supplied with the screenshots.

## Executive diagnosis

The bugs are not one defect. They fall into four root-cause groups:

1. Program prescriptions are disconnected from workout sessions. Program screens can display generated days, but the Home start action still opens the generic workout modal, the workout session has no program metadata, and the `workouts` table has no program/day foreign keys.
2. Rest timer state is shared correctly, but two presenters render it on the workout route, while two message-processing branches start it automatically.
3. Several features are only partially implemented: Full Body exists in TypeScript/UI validation but has no seeded database template; tutorial completion is device-local rather than user-scoped; training-day selection is not present in program creation.
4. Raw backend values and non-virtualized rendering leak into the Exercise Library UI. The detail header also uses a shared header layout that does not constrain long titles.

Recommended implementation order:

1. Program-workout identity and persistence.
2. Program-day resolution and auto-population.
3. Rest timer behavior/UI consolidation.
4. Program creation schedules and Full Body template.
5. Tutorial persistence.
6. AI output contract.
7. History affordance, Exercise Library polish, title normalization, and emoji cleanup.

---

## 1. Auto-populate workouts when a program is started

### Status

Confirmed missing end-to-end behavior.

### Investigation and root cause

- `components/home/HomeDashboard.tsx:95-123` labels the program card as “TODAY,” but displays the program name and a count of every exercise in the current week. It does not resolve today’s program day.
- `app/(tabs)/index.tsx:1250-1261` routes the program card’s Start action to `setNameModalVisible(true)`, the same generic flow used for freestyle workouts.
- `app/(tabs)/index.tsx:457-483` can prefill rows only from user workout templates. No equivalent converts `ProgramExercise[]` into `LogRow[]`.
- `contexts/ProgramContext.tsx:49-77` loads an active program and one expanded week, but exposes no current-day resolver or completion state.
- `hooks/useWorkoutSession.ts:66-103` tracks only date, body parts, ID, and creation time. It cannot preserve `program_id`, `program_week_id`, or `program_day_id`.
- `lib/workoutStorage.ts:40-51` and `supabase/functions/history/index.ts:39-47` likewise omit program source metadata.
- `supabase/migrations/0001_initial_schema.sql:5-11` defines no association from `workouts` to programming tables.
- Program progression is manual: `supabase/functions/programming/index.ts:330-353` advances only `current_week`; there is no persisted current day or completion record.

Root cause: the programming engine is a read-only prescription subsystem. Workout logging is a separate generic subsystem, and no domain contract connects them.

### Implementation guide

1. Add a migration that extends `workouts` with nullable `program_id`, `program_week_id`, and `program_day_id`. Prefer foreign keys with `ON DELETE SET NULL` so workout history survives program archival/deletion. Add a partial unique index on `(user_id, program_day_id)` only if product rules forbid repeating a prescribed day; otherwise allow repeats and add a `program_day_attempt`/completion table.
2. Extend `WorkoutSession`, `WorkoutDraft`, the History Edge Function request/response shape, and `useWorkoutSession` with a typed source object, for example `source: { kind: 'freestyle' | 'template' | 'program'; programId?; weekId?; dayId? }`.
3. Create a pure program-day resolver in `lib/programming.ts` or a new `lib/programSchedule.ts`. Inputs should be local calendar date/timezone, selected training weekdays, program start date, current week, and completed day IDs. Output should explicitly distinguish `training_day`, `rest_day`, `completed`, and `program_complete`.
4. Add a program start date and schedule snapshot to `workout_programs`. Do not infer historical alignment from `created_at`; user-selected weekdays can change later.
5. Add a pure adapter from `ProgramExercise[]` to skeleton `LogRow[]`. Generate `target_sets` rows per exercise with empty `weightLbs` and `reps`; keep prescriptions in separate optional fields rather than writing targets as completed values.
6. Replace the program hero’s generic Start handler with `startProgramWorkout(resolvedDay)`. It should start the session using the normalized program-day title, import the skeleton rows, persist the draft immediately, and reject accidental duplicate starts while another workout is active.
7. On save, persist the program source IDs in both local history and Supabase. Mark the program-day attempt complete only after the workout save succeeds locally; sync the completion remotely with the workout to avoid a completed day with no history entry.
8. Derive week/day progress from completed program-day records. Avoid incrementing `current_week` merely because the calendar changes if the intended product behavior is completion-based progression.
9. Update History and workout detail to show “Program · Week N · Day N” when source metadata exists, with navigation back to that program day.

### Tests and verification

- Pure tests for local-time day resolution, rest days, missed days, week boundaries, changed schedules, and program completion.
- Adapter test proving all prescribed exercises/sets become empty skeleton rows and target values are not logged as completed values.
- Storage round-trip test proving source IDs survive draft save, local history save, pending sync, API save, and history fetch.
- Integration test: create program → tap Today → correct day loads → fill one set → save → History contains it → program day shows completed.
- Offline test: save program workout offline, relaunch, verify draft/history/source metadata, reconnect, and verify one remote workout and one completion record.

### Risk

High. GitNexus reports `saveWorkout` as HIGH risk: 7 impacted symbols, 2 direct callers, and 4 affected execution flows. This must be implemented behind typed migrations and regression tests, not as a Home-screen-only patch.

---

## 2. Make workout deletion visible in History

### Status

Confirmed UX defect; backend deletion already exists.

### Investigation and root cause

- `app/(tabs)/history.tsx:182-200` opens deletion only via `onLongPress`.
- The only visible trailing control is a chevron at `app/(tabs)/history.tsx:224`, which communicates navigation, not deletion.
- The confirmation modal and optimistic delete flow already exist at `app/(tabs)/history.tsx:117-139` and `:279-283`.

Root cause: the capability exists but its only pointer interaction is hidden.

### Implementation guide

- Add a visible trailing overflow button using `IconSymbol` rather than an emoji. Keep card press for detail navigation and stop propagation from the overflow control.
- Overflow should expose “Delete workout” and invoke the existing confirmation modal. A swipe action is optional, but it should not be the only discoverable affordance.
- Keep the long-press action temporarily for backward compatibility, but remove “long press to delete” from the accessibility label once the visible action ships.
- Improve delete correctness while touching this path: use the imported local `deleteWorkout()` helper rather than manually rewriting AsyncStorage, and consider a pending-deletion tombstone so an offline or failed remote delete cannot later resurrect from the server.

### Verification

- VoiceOver identifies separate “Open workout” and “Workout actions” controls.
- Cancel leaves the card untouched; confirm removes it locally and remotely; failure restores it and displays the toast.
- Reopen History after delete and confirm the item does not return.

Risk: low for the visible affordance; medium if offline deletion semantics are changed.

---

## 3. Do not automatically start the rest timer after logging a set

### Status

Confirmed in two independent logging branches.

### Investigation and root cause

- Fast/local parsed sets start the timer at `app/(tabs)/index.tsx:1091-1100`.
- AI-parsed sets start it again at `app/(tabs)/index.tsx:1182-1191`.
- Skeleton/template fills at `:929-993` do not use the same post-log behavior, so behavior is also inconsistent by input path.

Root cause: timer activation is embedded as a side effect of successful parsing rather than represented as an explicit user intent.

### Decision (updated) — make it a toggle, not a removal

User preference: don't remove auto-start outright — add a Settings switch ("Auto-start rest timer after logging a set"), off by default, so the behavior becomes opt-in rather than gone. Both parser branches keep their `startRestTimer()` call; it's just gated behind the new setting.

### Implementation guide

0. Add a boolean setting, `auto_start_rest_timer` (default `false`), with a switch row in Settings near the existing rest-timer controls.
1. Gate `startRestTimer()` in both parser branches behind that setting — do not remove the calls. When the setting is on, behavior is unchanged (immediate auto-start). When off, fall through to step 2 instead.
2. Create transient `restOffer` state containing exercise, set number, intensity hints, and prescribed rest if the row came from a program.
3. Set or replace the offer after any completed logging path: local parse, AI parse, skeleton fill, batch fill, and edit-save when appropriate — only reached when the setting is off.
4. Render one compact “Start Rest · 1:30” action near the top of the workout content. Include a dismiss button; do not use a modal. Auto-expire the offer after a short interval, but leave workout input fully usable.
5. Start the shared timer only when tapped, then clear the offer. If a timer is already active, replace the offer with “Restart rest?” or suppress it; do not silently overwrite an active timer.
6. Keep the dedicated Timer tab as the manual fallback.

### Verification

- Logging through each path never changes timer state from idle.
- The offer appears after logging, is one-tap actionable, can be dismissed/ignored, and does not block typing.
- Tapping it starts exactly one timer with the expected duration and exercise metadata.

Risk: medium because `HomeScreen` owns several logging paths. The timer state machine itself does not need modification.

---

## 4. Fix AI-generated grammar and writing quality

### Status

Confirmed prompt-governance weakness; no single prompt controls all AI output.

### Investigation and root cause

- There are four direct OpenAI Edge Function callers: `coach`, `chat`, `meal-plan`, and `nutrition-analyze`.
- `supabase/functions/coach/index.ts:33-46` contains contradictory length directions: “logically think if … over 75 words,” “under 200,” and “100-200 words.” It does not explicitly require complete, grammatical sentences or terminology consistency.
- `supabase/functions/chat/index.ts:50-56` only asks for a direct answer under 50 words; it has no writing-quality contract.
- Session reviews are generated by sending a large JSON-demanding prompt as the user question to the general streaming coach endpoint (`lib/api.ts:191-218`), then extracting the first brace block with a regex (`:225-238`). This mixes conversational and structured-output responsibilities.
- Session-review fallback copy at `lib/api.ts:235-245` is generic and includes exclamation-heavy language inconsistent with the direct product tone.
- `daily-feedback` is deterministic, not AI-generated; grammar problems there should be fixed directly rather than by changing an AI prompt.

Root cause: prompt instructions are duplicated, partially contradictory, and not backed by response validation or prompt regression tests.

### Implementation guide

1. Create a shared server-side writing contract under `supabase/functions/_shared/` defining: natural US English, complete sentences, active voice, concise wording, no fragments, no unnecessary exclamation marks, no markdown unless requested, and canonical terms such as “workout,” “set,” “rep,” “weight,” “rest,” and “program day.”
2. Compose endpoint-specific prompts from that contract instead of copy-pasting prose.
3. Resolve coach length rules to one measurable target, such as “usually 60-120 words; never exceed 180 unless safety requires it.”
4. Move session review generation to a dedicated structured endpoint or dedicated action in `coach` using JSON response format/schema. Do not inject system-like instructions as a user question and do not parse JSON with a greedy brace regex.
5. Validate output shapes and strings: trim whitespace, reject empty/fractured fields, cap array lengths, and return deterministic polished fallbacks.
6. Keep temperature low for structured tasks. Preserve streaming only for conversational coach answers.
7. Add prompt fixtures containing the actual bad outputs reported by QA and assert the corrected contract/validator catches them.

### Verification

- Golden tests for coach answer, chat answer, session review, meal description, and nutrition explanation.
- Validate terminology, sentence-ending punctuation, prohibited markdown, length limits, and JSON shape.
- Manual review matrix across short questions, sparse history, malformed model output, and unavailable AI.

Risk: medium. Deploy only the Edge Functions whose prompts change and verify response bodies before broad rollout.

---

## 5. Prevent tutorial walkthrough from repeatedly appearing

### Status

Partially fixed locally, but not robust for existing users or multi-device use.

### Investigation and root cause

- `lib/tutorialState.ts:3-15` stores one global device key, `tutorial_shown_v1`.
- `app/(tabs)/index.tsx:378-383` checks that key whenever row count or workout-active state changes, rather than once after authenticated profile hydration.
- `components/tutorial/TutorialModal.tsx:90-96` marks completion on skip/dismiss, which is correct for the current device.
- `contexts/AuthProvider.tsx:54-56` intentionally preserves the device key at sign-out.
- A returning user on a new/reinstalled device has no key, and multiple accounts on one device share the same key.
- Manual replay already exists in `app/settings/index.tsx:253-303` and `app/(tabs)/index.tsx:1328`.

Root cause: tutorial state is installation-scoped while the requirement is user-scoped, and auto-show is coupled to changing workout UI state.

### Implementation guide

- Add user-scoped profile fields such as `tutorial_version_seen` and `tutorial_dismissed_at`, or a small `user_feature_state` table keyed by user and feature.
- Gate automatic display only after auth and profile loading complete. Show when `tutorial_version_seen < CURRENT_TUTORIAL_VERSION` and product rules allow it.
- Retain a user-scoped AsyncStorage cache for fast startup/offline behavior, keyed by user ID, but treat remote state as canonical.
- Run the auto-show decision once per authenticated session. Manual Help/Tutorial replay must bypass the auto-show gate and must not reset completion.
- When dismissing, update UI immediately, persist locally, then sync remotely. Retry remote failure later without reopening during the same session.

### Verification

- Existing completed user: login repeatedly and on a second device; no auto-show.
- New user: show once after onboarding, then never again for the same version after skip or completion.
- Manual replay remains available and does not cause later auto-show.
- Account switching does not leak state between users.

Risk: low to medium. `TutorialModal` has two direct consumers; keep persistence orchestration outside the modal where possible.

---

## 6. Auto-select training days when choosing a split

### Status

Missing from program creation; schedule data exists elsewhere but is not integrated.

### Investigation and root cause

- `app/program/create.tsx:51-68` tracks goal, split, day count, weeks, and periodization only.
- Split and day count are independent controls (`:167-184`); changing one does not reconcile the other.
- `profiles.training_days` exists and the profile Edge Function accepts it, but program creation never reads or writes it.
- `lib/trainingSchedule.ts:5-12` provides generic weekday defaults by count, not split-aware schedules.
- The backend fetches a template by `split_type` only (`supabase/functions/programming/index.ts:67-73`) and then stores the independently supplied `daysPerWeek`. This can create metadata/structure mismatch; for example a 3-day PPL template can be stored as a 5-day program while still generating only three program days.

Root cause: split selection, frequency, weekday schedule, and template structure are modeled as separate values without validation or synchronization.

### Implementation guide

1. Define a typed split catalog in one client module: supported frequency/frequencies, day labels, default weekdays, and whether it is predefined or custom.
2. When the split changes, set its supported frequency and suggest weekdays. When frequency changes, choose a compatible variant or switch the split to `custom`; never retain incompatible hidden state.
3. Render seven weekday toggles. Suggestions should be editable, and edited days should mark the schedule custom without discarding the chosen workout-day labels.
4. Send `training_days` and explicit day definitions in generation input, or persist them to the program schedule snapshot. Do not rely only on the mutable profile schedule.
5. Backend validation must ensure `days_per_week`, selected weekdays, and generated `structure.days.length` agree.
6. Query predefined templates by both `split_type` and `days_per_week`, or make template slugs explicit. Avoid `.maybeSingle()` on a split that may eventually have multiple frequency variants.

### Verification

- Every predefined split selects the expected count and weekday suggestion.
- Users can alter weekdays afterward.
- Incompatible split/frequency becomes Custom instead of silently producing the wrong number of days.
- Generated week row count equals the selected frequency.

Risk: medium because profile schedules are also consumed by notifications, nutrition, and daily feedback. Program schedule should be snapshotted rather than unexpectedly rewriting all profile behavior unless the UI clearly asks permission.

---

## 7. Add missing Full Body split template

### Status

Partially declared but operationally missing.

### Investigation and root cause

- `full_body` is accepted by `types/programming.ts:11-17`, listed in `app/program/create.tsx:24-29`, labeled in `app/program/index.tsx:24-31`, and accepted by backend validation at `supabase/functions/programming/index.ts:29-30`.
- `supabase/migrations/0035_programming_engine.sql:159-281` seeds only PPL 3-day and PPSh-L 5/6-day templates.
- Generation therefore reaches `supabase/functions/programming/index.ts:73` and throws “template not found for split_type full_body.”

Root cause: UI/type/backend enums shipped without the required seed data.

### Implementation guide

- Add an idempotent migration that seeds supported Full Body frequencies. Prefer separate templates such as 2-day, 3-day, and 4-day variants if the UI allows those frequencies.
- Use balanced movement patterns each day: squat/knee-dominant, hinge, horizontal/vertical push, horizontal/vertical pull, and optional carry/core. Vary emphasis across days rather than repeating identical sessions.
- Use canonical exercise slugs verified against the imported dataset; migration 0043 showed that invalid template values can break full generation.
- Update backend template lookup to include frequency and validate structure before archiving the user’s existing program.
- Add an Edge Function test/fixture proving every exposed split/frequency resolves to exactly one template and all slugs/rest/rep constraints are valid.

Risk: low for the seed itself; medium if multiple frequencies are added without fixing template lookup first.

---

## 8. Fix duplicate/dual rest timer indicators

### Status

Confirmed architectural presentation duplication; timer state itself is already shared.

### Investigation and root cause

- One `RestTimerProvider` wraps the app in `app/_layout.tsx:47-52`, so there is already one state source.
- The global `RestTimerToast` is mounted at `app/_layout.tsx:50` and hides only on `/timer` (`components/workout/RestTimerToast.tsx:58-60`).
- The workout screen also mounts `RestTimerBar` at `app/(tabs)/index.tsx:1373`.
- On the Home/workout route, both components consume the same non-idle state and render simultaneously.
- Both components fire completion haptics (`RestTimerToast.tsx:40-49`; `RestTimerBar.tsx:24-29`), so completion feedback is duplicated too.

Root cause: one shared state machine has two active presenters and two completion side-effect owners on the same route.

### Decision (user-selected — supersedes this report's original "retain RestTimerBar" recommendation)

Keep only `RestTimerToast` (the top popup) as the automatically-shown indicator, on every route. Delete `RestTimerBar` entirely. The full-screen `/timer` tab is unaffected — it stays as the manual, opt-in detailed view the user reaches only by tapping into it; the Toast continues to exempt itself only on that one route (`RestTimerToast.tsx:58-60`).

### Implementation guide

- Delete `components/workout/RestTimerBar.tsx` and its mount at `app/(tabs)/index.tsx:1373`. `RestTimerToast` remains the single presenter everywhere except `/timer`, which keeps its own full-screen view.
- Move completion haptic/notification ownership into `useRestTimer` or one dedicated effect so presenters are pure views.
- Centralize route visibility in one coordinator/component rather than separate pathname assumptions.
- Keep all controls dispatching to `useSharedRestTimer`; do not create local countdown state in either presenter.
- Define consistent transitions: cancel → idle, skip → done then dismiss/idle according to one rule, natural completion → done, dismiss → idle.

### Verification

- At most one timer surface is visible on Home, Timer, History, Program, and modal routes.
- Pause/resume/cancel/skip updates every route after navigation.
- Completion emits one haptic and one completion UI event.
- Relaunch during a running timer restores one accurate countdown.

Risk: low. GitNexus reports both timer presenters as LOW risk with one direct consumer each.

---

## 9. Remove low-quality or unnecessary emojis

### Status

Confirmed in functional UI surfaces.

### Investigation

Examples include:

- `components/media/MediaPickerBubble.tsx:71` — camera emoji.
- `components/media/ReflectionInput.tsx:38` and `app/history/[id].tsx:408` — thought bubble emoji.
- `app/history/[id].tsx:56-61` — rating mapped to emoji.
- `app/history/[id].tsx:89` and `components/modals/SessionReviewModal.tsx:254-257` — memo emoji.
- `constants/subscription.ts:54-73` — emoji feature icons.
- `components/celebration/PRCelebration.tsx:116` — trophy emoji.

### Implementation guide

- Inventory all user-facing emoji separately from punctuation/symbols such as checkmarks and arrows.
- Replace functional emoji with `IconSymbol`/the project icon system, using semantic names, design-token colors, and accessible labels.
- Keep only deliberate celebratory emoji if product design explicitly approves them; do not mix platform-rendered emoji with line icons in ordinary cards and settings rows.
- Remove now-unused emoji font-size styles.

### Verification

- Review light/dark mode and iOS/Android because emoji glyphs vary by platform.
- Confirm every removed functional emoji has an equivalent accessible icon or text label.

Risk: low, but broad. Execute as a dedicated visual cleanup PR rather than mixing it into data-flow work.

---

## 10. Clean up the Exercise Descriptor / Exercise Detail page

### Status

Confirmed formatting and responsive-layout defects.

### Investigation and root cause

- `app/exercise-library/[slug].tsx:100-109` renders `body_part`, `category`, `difficulty`, and `equipment` directly.
- `:153-159` directly joins raw muscle identifiers. Underscores are therefore expected to leak from normalized database values.
- The title is passed unmodified to `ScreenHeader` at `:87`.
- `components/ui/screen-header.tsx:45-66` has a horizontal header, but the title wrapper has no `flex`, `flexShrink`, or width constraint; `styles.title` at `:99-102` has no line/fit policy. Long exercise names can clip or collide with a right element.

Root cause: internal identifiers and display strings are treated as the same type, and the shared header does not define long-title behavior.

### Decision (confirmed by user — supersedes this report's original "fix locally first" recommendation)

Fix `ScreenHeader` directly rather than working around it on this one page. The overflow bug is systemic to the shared component — any screen with a long title will hit it, not just Exercise Detail — and the actual fix (`flexShrink`, `numberOfLines`, `adjustsFontSizeToFit`) is additive: it changes nothing for titles that already fit on one line. The CRITICAL rating reflects consumer count, not risk of this specific change; a short visual pass over the other consuming screens after the change is sufficient.

### Implementation guide

1. Add pure display-format helpers for enum/identifier labels: replace underscores/hyphens with spaces, collapse whitespace, preserve known acronyms, and title/sentence-case according to field type.
2. Apply them to body part, category, difficulty, equipment, primary muscles, and secondary muscles on both list and detail screens.
3. Do not mutate the canonical slug or API query values; formatting is presentation-only.
4. Fix `ScreenHeader` directly: add `flexShrink: 1` to the title wrapper (`components/ui/screen-header.tsx:45-66`) and `numberOfLines={2}` + `adjustsFontSizeToFit` (minimumFontScale ~0.7) to `styles.title` (`:99-102`).
5. Regression-check the other consumers — program, settings, coach, history, nutrition — with a quick visual pass: short titles unchanged, long titles wrap to two lines instead of clipping. GitNexus's CRITICAL flag (27 impacted symbols, 26 direct consumers/flows) reflects reach, not risk, for this additive change.
6. Rebuild hierarchy: hero name, metadata chips, concise overview, then clearly separated instructions/cues/mistakes/muscles sections. Use consistent 16px horizontal rhythm, readable line height, and no raw empty sections.

### Verification

- Snapshot/data tests for `posterior_deltoid`, `body_weight`, `machine_assisted`, acronyms, and already formatted values.
- Test short and very long exercise names at narrow width and large Dynamic Type.
- Confirm no raw underscore appears in user-facing metadata.

Risk: low if localized; critical if the shared header is altered without cross-screen regression testing.

---

## 11. Finish and polish the Exercise Library page

### Status

Confirmed structural/performance problem in addition to visual polish.

### Investigation and root cause

- The imported dataset contains 1,324 rows, while `app/exercise-library/index.tsx:92-189` uses a vertical `ScrollView` and `.map()`. This eagerly renders every current result and forfeits list virtualization.
- The list endpoint returns the full trimmed catalog (`supabase/functions/exercise-library/index.ts:54-63`).
- Every query change triggers a debounced server search (`app/exercise-library/index.tsx:73-82`), including reset refetches, while the full list is already cached for 24 hours.
- Body-part filtering is exact and case-sensitive (`:84-87`) against hard-coded display labels (`:13`), increasing the chance of dataset/UI mismatch.
- Search has no visible clear action, result count, error/retry state, grouped hierarchy, or list separators distinct from cards.

Root cause: the page was built as a small prototype list, then a large dataset was imported without redesigning rendering, filtering, and information architecture.

### Implementation guide

1. Replace the outer vertical `ScrollView` and mapped cards with `FlatList` or `SectionList`. Move search/filter UI into `ListHeaderComponent`; use stable keys, memoized row components, and estimated/consistent row height where practical.
2. Normalize category/body-part filter values separately from display labels. Prefer filters derived from returned data or a shared canonical taxonomy.
3. Decide one search model: local search over the cached trimmed catalog for instant name/filter matching, or server pagination/search for scalability. Do not refetch the entire catalog when clearing a query.
4. Add search icon, clear button, result count, selected-filter state, retryable error state, and polished empty-state copy.
5. Use compact list rows rather than large repeated cards: exercise name, two metadata chips, one cue preview, and a proper trailing chevron icon.
6. Preserve scroll position when returning from detail and ensure keyboard dismissal does not fight list navigation.
7. Audit cached shape compatibility because search returns `select('*')` while list returns a trimmed projection.

### Verification

- Profile render performance with the full 1,324-row catalog; confirm only a small window of rows mounts.
- Search, clear, rapid typing, filter combinations, no-results, network failure/retry, back navigation, dark mode, and Dynamic Type.
- Accessibility order and 44pt minimum interactive targets.

Risk: low-to-medium. GitNexus reports the route component itself as LOW upstream risk, but list behavior should be performance-tested on a real device.

---

## 12. Remove duplicate workout/split names from program-day titles

### Status

Confirmed deterministic composition bug.

### Investigation and root cause

- `app/program/week.tsx:57-60` always renders `day.body_part` and appends `day.title` whenever truthy.
- Templates intentionally contain equal or overlapping values, e.g. `body_part: "Pull"` and `title: "Pull (Heavy)"` in `supabase/migrations/0035_programming_engine.sql:247-252`.
- Result: `Pull — Pull (Heavy)`.
- `app/program/day.tsx:91` ignores the variant title and displays only the body part, so week and day screens are inconsistent.

Root cause: UI concatenates semantic category and display title without normalization or ownership rules.

### Implementation guide

- Add one pure `formatProgramDayTitle(day)` helper and use it on week cards, day headers, Home’s Today card, workout session title, and History source metadata.
- Rule: if title is absent, use body part. If normalized title equals body part, use one copy. If title begins with body part plus a variant, use title alone (`Pull (Heavy)`). Otherwise use `Body Part — Title` only when both add distinct meaning.
- Normalize case, whitespace, dash variants, underscores, and punctuation for comparison while preserving the original display capitalization.
- Do not “fix” database values ad hoc; central formatting protects old and future templates.

### Verification

Table-driven cases: `Pull/Pull`, `Pull/Pull (Heavy)`, `Push/Chest + Triceps`, absent title, case differences, extra whitespace, and underscore values.

Risk: low. Keep the helper separate from `ScreenHeader`.

---

## Cross-cutting implementation plan

### Phase A — Data contract first

- Add program schedule/start metadata and workout source linkage migration.
- Update shared TypeScript shapes, History Edge Function serialization, local history, draft persistence, and API round-trip tests.
- Add program-day completion semantics before wiring UI.

### Phase B — Program execution

- Implement split/frequency/day catalog and Full Body seed variants.
- Implement current-day resolver and program-exercise skeleton adapter.
- Wire Home Today card to start the resolved program day.
- Normalize titles through one helper.

### Phase C — Workout interaction

- Remove both timer auto-start side effects.
- Add transient Start Rest offer across all logging paths.
- Route timer presentation so only one indicator is visible and completion side effects have one owner.
- Add visible History overflow/delete action.

### Phase D — Experience quality

- Move tutorial completion to user-scoped versioned persistence.
- Centralize AI writing rules and isolate structured session reviews.
- Virtualize and redesign Exercise Library; add presentation-format helpers and local detail-page title hierarchy.
- Complete icon/emoji inventory and replace functional emoji.

## Required verification before release

Run:

- `npm run lint`
- `npx tsc --noEmit`
- `node --test "lib/__tests__/*.test.ts"`
- Supabase/Deno checks for every changed Edge Function.
- Migration dry run, then verify generated PPL and Full Body programs against a test user.
- Real-device manual matrix: new user, returning user, offline workout, program workout, freestyle workout, timer active across tabs, long exercise names, large Dynamic Type, light/dark mode.

Release gates:

- No program workout can save without retaining its source IDs.
- No prescribed target is mistaken for a completed set.
- No route displays more than one active timer surface.
- Logging a set never starts rest without an explicit tap.
- Existing tutorial-complete users do not see automatic replay.
- Every exposed split/frequency resolves to a valid template or clearly becomes Custom.
- History deletion is visually discoverable and does not resurrect after refresh.
- Exercise metadata shows no raw identifier formatting.

## Blast-radius summary

- HIGH: `saveWorkout` — 7 impacted symbols, 4 affected flows. Program linkage changes require full local/remote/offline regression coverage.
- CRITICAL: shared `ScreenHeader` — 27 impacted symbols, 26 direct consumers/flows. Prefer a localized Exercise Detail heading fix.
- LOW: `useWorkoutSession`, `ProgramProvider`, `generateProgramFromTemplate`, `HistoryScreen`, `TutorialModal`, `RestTimerToast`, `RestTimerBar`, `ExerciseLibraryScreen`, `ExerciseDetailScreen`, `ProgramWeekScreen`, and `CreateProgramScreen` individually. Combined feature work is still cross-system and should be delivered in the phases above.

## Final assessment

The highest-leverage correction is not visual: establish a durable identity link between a program day and the workout created from it. Without that, auto-population, progress tracking, History association, and correct Today behavior remain fragile. The rest-timer defects are comparatively contained and can be fixed immediately afterward with one explicit-start interaction and route-aware presentation ownership.
