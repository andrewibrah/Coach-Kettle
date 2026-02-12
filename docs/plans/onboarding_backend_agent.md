# Coach Kettle — 5-Issue Debug & Enhancement Plan

---

## 1) EXECUTIVE SUMMARY

- **Issue 1 (History):** Every color in `app/(tabs)/history.tsx` is hardcoded to light-mode hex values (`#F7F7F8`, `#FFFFFF`, `#111827`); the screen never calls `useThemeColor()` or reads `isDark`. Fix: replace all hardcoded colors with theme-aware values.
- **Issue 2 (PR Celebration):** The celebration pipeline is architecturally sound (DB trigger → `pr_history` INSERT → Supabase Realtime → `showCelebration`) but the trigger function uses `LOWER(TRIM(lift_name))` for comparison while the `log-set` edge function passes raw `weightLbs`/`reps` as **strings** — the DB trigger may silently skip non-numeric values. Additionally, the `log-set` call in `index.tsx` fires-and-forgets with `set: 1` hardcoded and no error surface, so failures are invisible.
- **Issue 3 (Face ID):** Face ID / biometric logic spans 7+ files (`AuthLockProvider.tsx`, `LockScreen.tsx`, `lib/authLock.ts`, `lib/biometrics.ts`, `app/settings/index.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`). All must be stripped, with the provider hierarchy simplified to remove `AuthLockProvider`.
- **Issue 4 (Coach):** The coach edge function receives only the current session's rows and a profile snippet appended to the question string — it never queries the `workouts` or `workout_log` table for historical data. The system prompt caps responses at 60 words. Fix: have the edge function fetch the last N workouts from the DB and inject them + profile as structured context.
- **Issue 5 (Templates):** 5A: Exercise count shows `?` because `items.length` is `0` until the user expands (items are lazy-loaded). Fix: fetch item counts alongside the template list query. 5B: No edit/reorder UX exists — only an X-delete button. Fix: add edit mode with inline editing, swipe-to-delete, and drag-to-reorder using `react-native-gesture-handler` + `react-native-reanimated` (both already installed).

---

## 2) ROOT-CAUSE ANALYSIS (BY ISSUE)

### Issue 1 — History Screen Stuck in Light Mode

**Symptom:** History screen renders with white/light background regardless of system or app dark mode setting.

**Root Cause (Confirmed):**
`app/(tabs)/history.tsx` uses zero theme hooks. Every color is hardcoded in the `StyleSheet.create` block:
- `backgroundColor: "#F7F7F8"` (screen) — line 195
- `backgroundColor: "#FFFFFF"` (card, metaChip) — lines 210, 243
- `color: "#111827"` (cardTitle, metaChipText) — lines 228, 248
- `color: "#6B7280"` / `"#9CA3AF"` (sectionHeaderText, chevron, emptyHint) — lines 279, 267, 299
- `borderColor: "#E5E7EB"` — lines 207, 239

The screen imports `ScreenHeader` (which does use `useThemeColor`) but wraps everything in a plain `View` instead of `ThemedView` and applies no dynamic colors.

**Evidence:** Compare with `app/settings/index.tsx` which correctly uses `useThemeColor({}, 'background')`, `isDark`, and conditional color variables like `cardBg = isDark ? Colors.dark.cardBackground : '#F2F2F7'`.

**Reproduction:** Open app → toggle to dark mode in Settings → navigate to History tab → observe white screen.

**Fix Strategy:** Import `useThemeColor`, `useTheme` (or `useColorScheme`), and `Colors`. Replace every hardcoded color with theme-aware equivalents using the same pattern as `settings/index.tsx` and `history/[id].tsx` (which already has `isDark` conditionals).

**Risk/Side Effects:** Low — purely visual change, no logic changes.

**Regression Checks:** Toggle dark/light mode and verify all elements (screen bg, cards, text, chips, section headers, empty state) adapt correctly.

---

### Issue 2 — PR Celebration Never Triggers

**Symptom:** PR tracking lifts are managed in settings, but the visual celebration animation never appears when a new PR is achieved during a workout.

**Root Causes (Ranked):**

1. **Primary: `log-set` sends `weightLbs` and `reps` as strings.** The `workout_log` table columns `weight_lbs` and `reps` appear to be text columns. The DB trigger `update_pr_from_workout_log()` casts them with `NEW.weight_lbs::NUMERIC` and `NEW.reps::INTEGER` inside exception blocks — if the cast fails, it silently `RETURN NEW` without inserting into `pr_history`. If the values arrive as strings like `"185"`, the cast succeeds, but any non-numeric content (units, etc.) would cause silent failure.

2. **Secondary: Case-sensitivity mismatch.** The trigger uses `LOWER(TRIM(lift_name))` against `pr_tracked_lifts`, but the `lift_name` in `pr_tracked_lifts` may have been stored with different casing from the `exercise` field logged. The trigger does normalize both sides, so this is likely OK.

3. **Tertiary: Realtime subscription may not be receiving events.** The `pr_history` table is added to `supabase_realtime` in migration 0024, but Supabase Realtime requires that the table's RLS policies allow the subscribing user to SELECT the row. The RLS policy `pr_history_select_own` uses `(SELECT auth.uid()) = user_id`, which should work with the client's auth token. However, the INSERT in the trigger runs as `SECURITY DEFINER` — the inserted row has `user_id` set correctly. This should be fine.

4. **Quaternary: The `showCelebration` function in the Realtime callback depends on `showCelebration` being stable.** It's listed in the `useEffect` deps at line 176 of `index.tsx`. The `showCelebration` from `usePRCelebration` uses `useCallback` with `[celebrationData]` as dependency — this means the reference changes every time `celebrationData` changes, causing the Realtime subscription to remount. This could cause missed events during re-subscription.

**Evidence:**
- `app/(tabs)/index.tsx` lines 129–176: Realtime subscription with `showCelebration` in deps
- `contexts/PRCelebrationContext.tsx` line 20: `useCallback` depends on `[celebrationData]`
- `supabase/functions/log-set/index.ts` line 97–109: Inserts into `workout_log`
- `supabase/migrations/0022` lines 150–242: `update_pr_from_workout_log()` trigger function
- `checkForPR` / `checkBatchForPRs` in `lib/prTracking.ts` are defined but **never called** from `index.tsx` — the client-side PR check is completely unused

**Reproduction:** Log into app → ensure a lift is tracked in Settings → log a set that exceeds current PR → observe no celebration.

**Fix Strategy:**
1. Stabilize the `showCelebration` callback to not depend on `celebrationData` (use ref pattern)
2. Add client-side PR checking as a fallback after each set is logged (call `checkForPR` after `api.logSet`)
3. Ensure `log-set` edge function inserts clean numeric values into `workout_log`
4. Add console logging to trace the full pipeline

**Risk/Side Effects:** Medium — touching the Realtime subscription and adding client-side PR checks introduces potential for duplicate celebrations. Deduplicate by PR name + timestamp.

**Regression Checks:** Log a set for a tracked lift that exceeds current PR → celebration should fire. Log a set that doesn't beat the PR → no celebration.

---

### Issue 3 — Remove All Face ID / Biometric References

**Symptom:** Face ID/biometric settings exist in the app but need to be completely removed.

**Root Cause:** Feature was built but is being deprecated.

**Files Affected (Exhaustive):**

| File | What to change |
|------|---------------|
| `components/AuthLockProvider.tsx` | Remove biometric state, `unlockWithBiometrics`, `initBiometrics`, `handleSetBiometricEnabled`. Keep terms acceptance + TTL refresh logic. |
| `components/LockScreen.tsx` | Delete entire file |
| `lib/authLock.ts` | Remove `getBiometricEnabled`, `setBiometricEnabled`, related functions. Keep TTL + terms functions. |
| `lib/biometrics.ts` | Delete entire file |
| `app/settings/index.tsx` | Remove biometric toggle section, `handleBiometricToggle`, `getBiometricDisplayName` import, `biometricStatus`/`biometricEnabled` from `useAuthLock` |
| `app/_layout.tsx` | Remove `LockScreen` rendering, `AuthLockProvider` if now empty, or simplify |
| `app/(tabs)/_layout.tsx` | Remove any `isLocked` checks |
| `app/auth/sign-in.tsx` | Remove biometric references |
| `app/auth/sign-up.tsx` | Remove biometric references |
| `app/auth/callback.tsx` | Remove biometric references |
| `constants/legal.ts` | Check for biometric mentions |
| `app.json` | Remove `expo-local-authentication` plugin if present |
| `package.json` | Remove `expo-local-authentication` dependency |
| Docs: `01-auth.md`, `02-providers.md`, `05-storage.md`, etc. | Update references |

**Reproduction:** Open Settings → observe Face ID toggle.

**Fix Strategy:** Systematically remove all biometric code while preserving the terms acceptance flow and TTL session management (which are separate concerns bundled in `AuthLockProvider`).

**Risk/Side Effects:** Medium — `AuthLockProvider` handles both biometric lock AND terms acceptance. Must carefully preserve terms logic while removing biometric logic. The provider hierarchy `ThemeProvider → AuthProvider → ProfileProvider → PRCelebrationProvider → AuthLockProvider` will be simplified.

**Regression Checks:**
- App launches without crash after removal
- Settings screen renders without biometric section
- Terms acceptance still works
- No dangling imports or references

---

### Issue 4 — Coach AI Lacks Context

**Symptom:** Coach gives vague, generic advice that doesn't reference user's actual workout history or personal goals.

**Root Causes (Ranked):**

1. **Primary: No workout history is sent to the coach.** The `api.askCoach()` function (line 102 of `lib/api.ts`) sends only `question` (with appended profile snippet) and `rows` (current session's rows). No historical data is fetched or sent.

2. **Secondary: The coach edge function doesn't query the database.** Despite having a `supabaseAdmin` client available, the `coach/index.ts` function simply passes the `rows` and `question` straight to OpenAI without querying `workouts`, `workout_log`, `pr_lifts`, or `profiles`.

3. **Tertiary: The system prompt is too restrictive.** `SYSTEM_PROMPT` says "Keep answers under 60 words" — this severely limits the coach's ability to provide detailed, contextual advice.

4. **Quaternary: Profile context is appended as a raw string to the user's question**, not as structured context in the system prompt where it belongs.

**Evidence:**
- `lib/api.ts` lines 102–110: `askCoach` sends `{ question: enhancedQuestion, rows }`
- `supabase/functions/coach/index.ts` lines 30–35: System prompt with 60-word limit
- `supabase/functions/coach/index.ts` lines 113–116: Only `{ question, rows }` used as context
- No DB query in the coach function

**Reproduction:** Open coach → ask "How should I improve my bench press?" → observe generic answer with no reference to user's actual bench history.

**Fix Strategy:**
1. In the `coach` edge function: query the user's last 10 workouts from the `workouts` table, their `profiles.ai_context`, and their `pr_lifts` data
2. Restructure the system prompt to include this historical context and remove the 60-word limit (increase to 200+)
3. Pass profile and history as structured system context, not appended to the user question
4. Remove client-side profile fetching from `api.askCoach()` since the edge function will handle it

**Risk/Side Effects:** Low-medium — increases token usage per coach call. May need to limit history to last 5-10 sessions to control costs. Coach responses will be longer.

**Regression Checks:** Ask coach about a specific lift → should reference actual history. Ask for advice → should align with user's goals from profile.

---

### Issue 5A — Template Exercise Count Shows "?"

**Symptom:** Collapsed templates show "? exercises" instead of actual count.

**Root Cause (Confirmed):**
`app/settings/templates.tsx` line 315: `{items.length || '?'}` — `items` comes from `expandedItems[template.id]` which is only populated when the user expands the template (lazy loading in `handleExpand`, line 82). When collapsed, `items` is `[]` (empty array from `expandedItems[template.id] || []`), so `items.length` is `0`, which is falsy, so `'?'` is displayed.

**Evidence:**
- Line 294: `const items = expandedItems[template.id] || [];`
- Line 315: `{items.length || '?'} exercises`
- `handleExpand` (line 82) is the only place items are fetched

**Fix Strategy:**
Option A (Backend): Modify the `workout-templates` edge function's `list` action to include an item count using a Postgres subquery or join: `select("*, workout_template_items(count)")`.
**Recommended: Option A** — most efficient. Add `item_count` to the template list response.

**Risk/Side Effects:** Low — requires edge function update + frontend display update.

---

### Issue 5B — No Edit/Reorder/Advanced Delete for Template Exercises

**Symptom:** Users can only delete exercises via X button. No way to edit sets/reps/weight, reorder exercises, or manage exercises without accidentally deleting.

**Root Cause:** Feature was never built — only CRUD basics (add/remove) were implemented.

**Evidence:**
- `app/settings/templates.tsx`: Only `handleRemoveExercise` exists (line 177), no update function
- `lib/profile.ts`: No `updateTemplateItem` function exists
- `supabase/functions/workout-templates/index.ts`: No `update_item` action exists
- `react-native-gesture-handler` and `react-native-reanimated` are both available in `package.json`

**Fix Strategy (per user requirements):**
1. Replace the X delete button with a 3-line drag handle (☰) for reorder
2. Add a pencil/edit button next to the drag handle
3. Edit mode: inline editing of exercise name, sets, reps, weight + save button
4. Delete: available inside edit mode AND via swipe-left gesture
5. Add `update_item` and `reorder_items` actions to the edge function
6. Add `updateTemplateItem` and `reorderTemplateItems` to `lib/profile.ts`

**Risk/Side Effects:** Medium — significant UI addition. Must handle optimistic updates and error rollback.

**Regression Checks:** Edit exercise values → save → collapse/expand → values persist. Drag to reorder → order persists. Swipe to delete → exercise removed. Add new exercise → still works.

---

## 3) IMPLEMENTATION PLAN

### Issue 1: History Dark Mode Fix

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 1.1 | bugfix | `app/(tabs)/history.tsx` | Import `useThemeColor`, `useColorScheme`, `Colors` from theme system; add `ThemedText` and `ThemedView` imports | Need theme hooks | Compile check |
| 1.2 | bugfix | `app/(tabs)/history.tsx` | Add `isDark`, `backgroundColor`, `textColor`, `cardBg`, `borderColor`, `secondaryTextColor` variables using `useThemeColor`/`isDark` ternaries | Dynamic colors | Toggle dark mode |
| 1.3 | bugfix | `app/(tabs)/history.tsx` | Replace root `<View>` with `<ThemedView>`, apply `{ backgroundColor }` dynamically | Screen bg follows theme | Visual check |
| 1.4 | bugfix | `app/(tabs)/history.tsx` | Replace all `<Text>` with `<ThemedText>` or apply `{ color: textColor }` inline | Text adapts to theme | Visual check |
| 1.5 | bugfix | `app/(tabs)/history.tsx` | Update StyleSheet: remove all hardcoded colors, use dynamic styles inline | No hardcoded colors remain | Grep for hex codes |

### Issue 2: PR Celebration Fix

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 2.1 | bugfix | `contexts/PRCelebrationContext.tsx` | Change `showCelebration` `useCallback` to use a ref for `celebrationData` instead of depending on it | Stabilize callback reference, prevent Realtime remounts | Celebration fires |
| 2.2 | bugfix | `app/(tabs)/index.tsx` | After `api.logSet()` calls (line 911-919), add client-side PR check using `checkForPR()` as fallback | Ensures PR detection even if Realtime misses | Log tracked lift PR |
| 2.3 | bugfix | `app/(tabs)/index.tsx` | Import `checkForPR` from `@/lib/prTracking` and `useAuth` session for userId | Need userId for PR check | Compile check |
| 2.4 | feature | `app/(tabs)/index.tsx` | Add deduplication: track last celebrated PR by lift+timestamp to avoid double celebrations from both Realtime and client-side check | Prevent duplicate celebrations | Log same PR twice |

### Issue 3: Remove Face ID

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 3.1 | cleanup | `lib/biometrics.ts` | Delete file | No longer needed | No import errors |
| 3.2 | cleanup | `components/LockScreen.tsx` | Delete file | No longer needed | No import errors |
| 3.3 | refactor | `lib/authLock.ts` | Remove `getBiometricEnabled`, `setBiometricEnabled` exports. Keep `getLastAuthenticatedAt`, `setLastAuthenticatedAt`, `isSessionExpired`, `clearLastAuthenticatedAt`, terms functions | Preserve TTL + terms, remove biometric | Compile check |
| 3.4 | refactor | `components/AuthLockProvider.tsx` | Remove all biometric state, `initBiometrics`, `unlockWithBiometrics`, `handleSetBiometricEnabled`. Remove `isLocked` state. Keep terms acceptance logic. Update context type. | Strip biometric feature | App loads |
| 3.5 | refactor | `app/settings/index.tsx` | Remove biometric toggle UI section, `handleBiometricToggle`, `getBiometricDisplayName` import, destructured biometric values from `useAuthLock` | Clean settings UI | Settings renders |
| 3.6 | refactor | `app/_layout.tsx` | Remove `LockScreen` import and conditional rendering | No lock screen | App navigates normally |
| 3.7 | cleanup | `app/(tabs)/_layout.tsx` | Remove any `isLocked` guard if present | Clean nav | Tab nav works |
| 3.8 | cleanup | `app/auth/*.tsx` | Remove biometric references in sign-in, sign-up, callback | Clean auth flow | Auth works |
| 3.9 | cleanup | `package.json` | Remove `expo-local-authentication` if present | Clean deps | `npm install` succeeds |

### Issue 4: Coach Context Enhancement

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 4.1 | feature | `supabase/functions/coach/index.ts` | After auth, query `workouts` table for user's last 10 sessions (exercise, weight, reps); query `profiles` for `ai_context`; query `pr_lifts` for current PRs | Provide real history to AI | Console log data |
| 4.2 | feature | `supabase/functions/coach/index.ts` | Restructure the system prompt: include user profile, PR records, and recent workout summaries as structured context. Increase word limit to 200. | AI has full context | Ask about specific lift |
| 4.3 | refactor | `supabase/functions/coach/index.ts` | Move profile context from user message to system message | Better prompt engineering | Response quality |
| 4.4 | refactor | `lib/api.ts` | Remove client-side `getCachedProfile` + `buildAIContextString` from `askCoach` — the edge function now handles this | Avoid duplicating context logic | Coach still works |
| 4.5 | refactor | `lib/api.ts` | Send raw `question` without appended profile string | Clean separation | No double profile |

### Issue 5A: Template Exercise Count

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 5A.1 | feature | `supabase/functions/workout-templates/index.ts` | In the `list` action, change `select("*")` to `select("*, workout_template_items(count)")` to include item count | Count available without expand | API returns count |
| 5A.2 | bugfix | `app/settings/templates.tsx` | Use `template.workout_template_items[0].count` (or equivalent) from the list response instead of `items.length` | Show real count when collapsed | Count shows correctly |
| 5A.3 | bugfix | `app/settings/templates.tsx` | Update the display: `{itemCount} exercise{itemCount !== 1 ? 's' : ''}` | Proper pluralization | Visual check |

### Issue 5B: Template Edit/Reorder/Delete UX

| Step | Type | Target | Change | Why | Verify |
|------|------|--------|--------|-----|--------|
| 5B.1 | feature | `supabase/functions/workout-templates/index.ts` | Add `update_item` action (update lift_name, target_sets, target_reps, target_weight) and `reorder_items` action (batch update display_order) | Backend support for edit/reorder | API test |
| 5B.2 | feature | `lib/profile.ts` | Add `updateTemplateItem()` and `reorderTemplateItems()` functions | Frontend API layer | Compile check |
| 5B.3 | feature | `app/settings/templates.tsx` | Replace X delete button with drag handle (☰) icon + pencil edit icon | New exercise row layout | Visual check |
| 5B.4 | feature | `app/settings/templates.tsx` | Add edit mode state per exercise: when pencil tapped, show inline TextInputs for name/sets/reps/weight with Save/Cancel | Edit functionality | Edit and save |
| 5B.5 | feature | `app/settings/templates.tsx` | Add swipe-to-delete using `Swipeable` from `react-native-gesture-handler` | Swipe delete gesture | Swipe works |
| 5B.6 | feature | `app/settings/templates.tsx` | Add drag-to-reorder using long-press + pan gesture, reorder state management, persist to backend | Reorder functionality | Drag and persist |
| 5B.7 | feature | `app/settings/templates.tsx` | Move delete button inside edit mode as a red "Delete Exercise" action | Delete accessible in edit | Delete from edit |

---

## 4) PATCH LIST

### Files to Edit
- `app/(tabs)/history.tsx` — theme-aware colors (Issue 1)
- `app/(tabs)/index.tsx` — client-side PR check fallback (Issue 2)
- `contexts/PRCelebrationContext.tsx` — stabilize showCelebration callback (Issue 2)
- `components/AuthLockProvider.tsx` — strip biometric, keep terms (Issue 3)
- `lib/authLock.ts` — remove biometric functions (Issue 3)
- `app/settings/index.tsx` — remove Face ID section (Issue 3)
- `app/_layout.tsx` — remove LockScreen (Issue 3)
- `app/(tabs)/_layout.tsx` — remove isLocked guard (Issue 3)
- `app/auth/sign-in.tsx` — remove biometric refs (Issue 3)
- `app/auth/sign-up.tsx` — remove biometric refs (Issue 3)
- `app/auth/callback.tsx` — remove biometric refs (Issue 3)
- `supabase/functions/coach/index.ts` — add history/profile DB queries (Issue 4)
- `lib/api.ts` — simplify askCoach, remove client-side profile append (Issue 4)
- `supabase/functions/workout-templates/index.ts` — add count, update_item, reorder (Issue 5)
- `lib/profile.ts` — add updateTemplateItem, reorderTemplateItems (Issue 5)
- `app/settings/templates.tsx` — fix count, add edit/reorder/swipe-delete UX (Issue 5)
- `package.json` — remove expo-local-authentication (Issue 3)

### Files to Delete
- `lib/biometrics.ts` (Issue 3)
- `components/LockScreen.tsx` (Issue 3)

### New Files
- None required

### Migrations
- None required (all DB schema already supports the changes; edge function updates are deployed, not migrated)

### Deployments Required (User runs manually)
- `supabase functions deploy coach` (Issue 4)
- `supabase functions deploy workout-templates` (Issue 5)

---

## 5) DONE CRITERIA (ACCEPTANCE CHECKLIST)

- [ ] **Issue 1:** History screen renders with dark background, dark-adapted cards, and light text when app is in dark mode; renders with light theme in light mode. Zero hardcoded color hex values remain in `history.tsx`.
- [ ] **Issue 2:** Logging a set that beats a tracked lift's PR triggers the confetti celebration animation. Both Realtime and client-side fallback paths are functional. No duplicate celebrations fire.
- [ ] **Issue 3:** No mention of "Face ID", "biometric", or "LockScreen" exists in any `.tsx`/`.ts` source file (excluding docs/changelogs). `expo-local-authentication` is removed from `package.json`. `lib/biometrics.ts` and `components/LockScreen.tsx` are deleted. App launches and navigates without crash. Terms acceptance still works.
- [ ] **Issue 4:** Asking the coach about a specific lift returns an answer referencing the user's actual workout history for that lift. The coach references user goals from their profile. Response length is 100-200 words (not capped at 60).
- [ ] **Issue 5A:** Collapsed templates show the correct exercise count (e.g., "4 exercises") without requiring expansion. Newly created templates with 0 exercises show "0 exercises".
- [ ] **Issue 5B:** Each exercise row shows a drag handle (☰) and edit (pencil) icon. Tapping edit enables inline editing of name/sets/reps/weight with Save/Cancel. Swiping left reveals a delete action. Dragging reorders exercises and persists to the backend. All changes survive collapse/expand and app reload.
