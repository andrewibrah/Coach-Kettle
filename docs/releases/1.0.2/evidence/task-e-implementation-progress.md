# Package E implementation checkpoint

Status: local implementation and full local checks complete. F14, F15 and F16 are **FIXED**. F18 is **FIXED-UNVERIFIED** until the G07 check: History reflection readback after navigation and relaunch on a real account/device. No deployment, live database, simulator or device claim was made. No Edge Function or migration changed.

## Dispositions
| ID | Disposition | Where |
|---|---|---|
| F14 | FIXED | Progress sub-screens have separate loading, error-with-Retry, successful-empty and loaded states. The plan's empty copy appears only after a successful empty read. |
| F15 | FIXED | Progress home shows "No measurements logged yet." only after a successful read. It never says "never" on error. |
| F16 | FIXED | Strength NavCard shows a visible "(Pro)" label, a `lock.shield` icon and a matching accessibility label via `can('advancedAnalytics')`. The screen gate is unchanged. |
| F18 | FIXED-UNVERIFIED | Cancel after a successful save now keeps the saved text. Device and relaunch readback are still pending (G07). |

## Changes
- `app/history/[id].tsx` and `lib/historyReflection.ts`:
  - The submitted trimmed text is captured before the PATCH.
  - A save succeeds only on `ok:true`. It then updates `workout.reflection`, the saved text and the editor.
  - A `useRef` guard blocks duplicate presses.
  - The input and Cancel are disabled while saving.
  - A late response is ignored if the route changed or the screen unmounted. The saving flag always clears.
  - Cache inspection: the detail screen always fetches live. The list cache refreshes on the next online focus.
- `app/(tabs)/progress/{body,photos,resting-hr,strength}.tsx`:
  - Each screen has a load state machine with a mount guard and a sequence guard.
  - Retry is at least 44pt tall and shows "Retrying…" while disabled.
  - Error copy is fixed text; raw error messages are no longer shown.
  - On refresh failure, previously loaded data stays visible under a stale banner.
  - On strength, a failed search for a different exercise clears the old points so they never appear under the wrong name.
- `lib/bodyMetrics.ts`: `fetchStrengthProgression` now throws RPC errors. Its only caller is `strength.tsx`.
- `lib/bodyMetricValidation.ts`: added a `parseStrictInteger` export. Resting BPM uses strict integer parsing in the range 25–220. This range matches `supabase/functions/resting-hr/index.ts` and `0036_progress_tracking.sql:100` (`CHECK (bpm BETWEEN 25 AND 220)`).
- `app/(tabs)/progress/index.tsx`:
  - Refreshes via `useFocusEffect` with a sequence guard.
  - Has loading, error-with-Retry, stale-banner and ready states.
  - Adds the `getLastLoggedLabel` and `getStrengthNavLabel` helpers.
- `constants/theme.ts`: new symmetric `dangerForeground` token for text on `danger` surfaces.

## Verification
- RED was observed before each fix: 3 reflection failures on the F18 behaviors, then progress copy/state failures. The final behavioral tests were checked by temporarily removing the `loadState` branches, which made them fail; each file was restored and its hash verified.
- Commands, all exit 0 (tree snapshot after the final fix wave):
  - `EXPO_NO_DOTENV=1 npm run lint -- --no-cache`
  - `./node_modules/.bin/tsc --noEmit --incremental false`
  - `node --test "lib/__tests__/*.test.ts"`: 483/483 pass (the baseline before Package E was 452).
  - `git diff --check`
- The new render-harness tests in `lib/__tests__/progressRelease.test.ts` depend on `react-test-renderer@19.2.0`. That dependency is an uncommitted `package.json` addition already present in the working tree.
- Graph impact and `detect_changes` were attempted: UNKNOWN, because database storage is version 43 and the runtime is version 42. There is no graph-pass claim. A grep fallback found that every edited screen is a route leaf, and the changed library functions each have a single caller.

## Open
- G07: reflection round-trip after navigation and relaunch, on an approved account and device.
- The white-on-`#EF4444` banner text is about 3.8:1 contrast at 13pt. Deferred to §G step 8.
- Deliberately not changed:
  - Home `Promise.all` is all-or-nothing.
  - A "(Pro)" flash appears while entitlements load.
  - An item deleted just before a failed reload stays visible under the stale banner.
