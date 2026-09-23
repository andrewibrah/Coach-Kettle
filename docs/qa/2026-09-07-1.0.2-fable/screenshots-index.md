# FABLE 1.0.2 Simulator evidence index

Device: iPhone 17 Pro, iOS 26.0, UDID `F0340485-E7C5-418D-9989-8AEC53F14E34` (the only
booted device; `00-booted-devices.txt` is the receipt).
App: `com.coachkettle.coachkettle`, DEBUG build loading JS from Metro on :8081
(bundle has `CoachKettle.debug.dylib` + `EXDevLauncher`, no `main.jsbundle`), so the
running JS is this working tree. This is NOT the TestFlight 1.0.2 binary.
Marketing version in app.json: 1.0.2 (unchanged by FABLE).

| File | Screen | What it proves | What it does NOT prove |
|---|---|---|---|
| `01-preexisting-state-before-reload.png` | Coach / Daily feedback | State of the app as found, before FABLE reloaded it. Pre-existing session preserved. | Nothing about FABLE's changes. Captured before reload. |
| `02-after-reload.png` | Workout (09/07 Leg draft) | REPRODUCTION at the DEFAULT text size: FlatList rows paint on top of the composer — "Set 2" bleeds across the Send pill and the header title "09/07 Leg" is overpainted by the toast. Also proves the pre-existing unsaved Leg draft survived reload ("Session resumed", Squat 1-3 + Leg extension intact). | Keyboard-open behavior. |
| `03-overflow-hidden-experiment.png` | Workout, same session | FIX CONFIRMED by A/B against 02: with `overflow:'hidden'` on the list, no row paints over the composer, Send pill is clean, header title fully legible. | Keyboard-open behavior; drag-reorder visuals. |
| `04-AX5-workout-fixed.png` | Workout at accessibility-extra-extra-extra-large | Dynamic Type adaptation works: card header stacks (Squat above Set 1), weight/reps stack, decorative divider dropped, End/Send pills stack full-width, all controls reachable, composer legible. ALSO SURFACES a remaining defect outside FABLE ownership: the screen title renders as a clipped blob (`components/ui/Header.tsx` `fontSize:24` + fixed `lineHeight:32` + `numberOfLines={1}`). | That the title clipping is fixed — it is NOT; see request R2. |
| `05-default-size-restored-fixed.png` | Workout at default size, WITHOUT reload | **Discarded as evidence.** Shows cards still in the stacked/tall layout after `content_size` was restored to `large` on a live app. This is a STALE RENDER artifact of changing Dynamic Type while the app is running, not a defect and not a passing result — superseded by 06. Kept only so the record is complete. | Anything. Do not cite. |
| `06-default-size-clean-reload.png` | Workout at default size, after clean terminate+launch | Default-size layout is correct and compact (row header, row weight/reps, divider present), and the composer/header fix holds: Send pill clean, "09/07 Leg" fully legible, last card clips at the list edge instead of painting over the composer. Matches 03. | Keyboard-open behavior. |

## Setting changed and restored
`xcrun simctl ui <UDID> content_size accessibility-extra-extra-extra-large` was set for
shot 04 and restored with `content_size large` (the iOS default) before shots 05/06.
Verified by reading `xcrun simctl ui <UDID> content_size` back -> `large`.
NOTE: the prior value was not captured before the change. Shots 01-03 show default-metric
text, which is consistent with `large`, so `large` is the correct restore point — but this
is an inference, not a recorded receipt.
A live `content_size` change leaves the running app in a stale layout (shot 05); a
terminate+launch is required before trusting a post-change screenshot (shot 06).

## Residual state disclosed
The pre-existing unsaved "09/07 Leg" draft (Squat sets 1-3, Leg extension set 1) is still
present and was NOT saved, cleared or modified by FABLE. No sets were added or deleted.

## NOT RUN (no fabrication)
- Keyboard-open composer verification. `simctl` has no tap primitive and neither `idb` nor
  `cliclick` is installed; installing one is an unapproved dependency change. The
  `keyboardVerticalOffset` fix is therefore compile- and code-verified only.
  MANUAL STEP FOR ANDREW: on the workout screen, tap the "Exercise lbs reps" field at the
  default text size and again at accessibility-extra-extra-extra-large, and confirm the
  field and the End/Send pills stay fully above the keyboard.
- Drag-reorder visuals after the overflow change.
- VoiceOver traversal, physical device, iPad, contrast measurement, Reduce Motion.

## F3 attempt (deep link) — FAILED TO PRODUCE EVIDENCE
| File | What it shows |
|---|---|
| `07-F3-exercise-detail.png` | **Not the exercise detail screen.** `xcrun simctl openurl <UDID> coachkettle://exercise-library/45-side-bend` raised an iOS **"Open in \"Coach Kettle\"?"** confirmation dialog that must be tapped. No tap primitive is available, so the deep link never navigated. Do not cite as F3 evidence. |
| `08-state-restored-after-deeplink.png` | Dialog persisted through an app terminate+launch — it is owned by SpringBoard, not the app. |
| `09-state-restored-final.png` | **Clean state restored** via `launchctl kickstart -k system/com.apple.SpringBoard` (no erase, no uninstall, no data loss). Dialog gone; the pre-existing "09/07 Leg" draft is fully intact (Squat sets 1-3 + Leg extension set 1); text size still `large`; the F1 list-clipping fix still holding. |

**F3 on-device verification is therefore NOT RUN.** The F3 changes are compile- and
lint-verified only.
MANUAL STEP FOR ANDREW: open More -> Exercise Library -> any exercise, and confirm
Body part / Category / Difficulty / Equipment / Muscles render as human labels
("EZ Bar", "Bodyweight", "Hip Flexors") rather than raw slugs, that empty Cues and
Common-mistakes cards are absent, and that no muscle is listed as both primary and secondary.
