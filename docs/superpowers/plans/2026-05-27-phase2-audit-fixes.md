# Phase 2 Shell Coherence Audit — 23 Findings Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch all 22 identified bugs and warnings from the Phase 2 shell coherence audit across 9 files — no new features, pure correctness.

**Architecture:** Changes are grouped into two prerequisite tasks (theme tokens, storage key export) that unblock file-level patches. Remaining tasks are self-contained per file. The largest file (`index.tsx`) is split into 4 sequential tasks to keep diffs reviewable. All changes must pass `npm run lint` and `npx tsc --noEmit`.

**Tech Stack:** Expo SDK 55 / React Native 0.83.6, Expo Router v3 (typed routes enabled), Supabase, TypeScript strict.

---

## File Map

| Task | File(s) | Findings Fixed |
|------|---------|----------------|
| 1 | `constants/theme.ts` | W3, W4 (prerequisite: adds `success`/`warning` tokens) |
| 2 | `lib/workoutStorage.ts` | W15 (prerequisite: exports storage key) |
| 3 | `more.tsx` | BUG 1, W7 |
| 4 | `screen-header.tsx` | W12, W13 |
| 5 | `app/(tabs)/_layout.tsx` | W1 |
| 6 | `app/(tabs)/nutrition/index.tsx` | BUG 3, BUG 6 |
| 7 | `app/(tabs)/progress/_layout.tsx` | W5 |
| 8 | `app/(tabs)/progress/index.tsx` | BUG 5, W4, W14, W15 |
| 9 | `components/home/HomeDashboard.tsx` | W3, W6 |
| 10 | `components/tutorial/TutorialModal.tsx` | W8, W9 |
| 11 | `app/(tabs)/index.tsx` — Dead state + memoization | BUG 7, W10, W11 |
| 12 | `app/(tabs)/index.tsx` — Fast-path set number | BUG 4 |
| 13 | `app/(tabs)/index.tsx` — Cold-launch draft race | BUG 2 |
| 14 | `app/(tabs)/index.tsx` — Type-escape router calls | W2 |

---

## Task 1: Add `success` and `warning` semantic color tokens

**Files:**
- Modify: `constants/theme.ts`

These tokens are missing from the theme system but referenced in four places with raw hex. Adding them here unblocks Tasks 8 and 9.

- [ ] **Step 1: Edit `constants/theme.ts`** — add `success` and `warning` to both `light` and `dark` color maps

Open `constants/theme.ts`. The `Colors` export currently ends each theme object with `danger: '#EF4444'`. Add two entries after it:

```typescript
// constants/theme.ts  (both light and dark objects)
export const Colors = {
  light: {
    // ... existing ...
    danger: '#EF4444',
    success: '#10B981',   // ← ADD
    warning: '#F59E0B',   // ← ADD
  },
  dark: {
    // ... existing ...
    danger: '#EF4444',
    success: '#10B981',   // ← ADD
    warning: '#F59E0B',   // ← ADD
  },
};
```

- [ ] **Step 2: Verify TypeScript accepts new tokens**

```bash
cd /Users/me/Desktop/partner/11_Codebases/Coach-Kettle
npx tsc --noEmit 2>&1 | grep "theme\|success\|warning" | head -20
```

Expected: no errors related to these tokens. (Other pre-existing errors unrelated to this task are OK for now — they'll be resolved by later tasks.)

- [ ] **Step 3: Commit**

```bash
git add constants/theme.ts
git commit -m "feat(theme): add success and warning semantic color tokens

Adds #10B981 (success) and #F59E0B (warning) to both light and dark
palettes, resolving W3 and W4 hardcoded hex audit findings.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Export `WORKOUT_HISTORY_KEY` from workoutStorage

**Files:**
- Modify: `lib/workoutStorage.ts`

`const KEY = "workout_history_v1"` is currently file-private. `progress/index.tsx` reads the same key via a raw magic string. Exporting it here creates a single source of truth.

- [ ] **Step 1: Edit `lib/workoutStorage.ts`** — change `const KEY` to `export const WORKOUT_HISTORY_KEY`

Find this line near the top of the file:

```typescript
const KEY = "workout_history_v1";
```

Replace with:

```typescript
export const WORKOUT_HISTORY_KEY = "workout_history_v1";
```

Then update every reference inside the same file from `KEY` → `WORKOUT_HISTORY_KEY`:

```typescript
// Every usage inside workoutStorage.ts: replace KEY with WORKOUT_HISTORY_KEY
const raw = await AsyncStorage.getItem(WORKOUT_HISTORY_KEY);
await AsyncStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
await AsyncStorage.removeItem(WORKOUT_HISTORY_KEY);
```

- [ ] **Step 2: Verify no compile errors**

```bash
npx tsc --noEmit 2>&1 | grep "workoutStorage\|WORKOUT_HISTORY" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/workoutStorage.ts
git commit -m "refactor(storage): export WORKOUT_HISTORY_KEY constant

Replaces file-private KEY with an exported constant so consumers
do not repeat the magic string. Resolves W15.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Fix `more.tsx` — BUG 1 (no top safe area) + W7 (duplicate icon)

**Files:**
- Modify: `app/(tabs)/more.tsx`

BUG 1: `MoreScreen` renders a bare `ThemedText` title with no top safe-area padding. On any iPhone with a notch or Dynamic Island the title is partially or fully hidden under the status bar. The fix is to use `ScreenHeader` (which already handles `insets.top + 12`) for the title, matching `NutritionHomeScreen` and `ProgressHomeScreen`.

W7: `doc.text.fill` is used for both "Exercise Library" (line 97) and "Templates" (line 127). They look identical in the list. "Exercise Library" should use `books.vertical.fill`.

- [ ] **Step 1: Open `app/(tabs)/more.tsx`** and make the following changes

**a) Add `ScreenHeader` import** (it's already in the project: `components/ui/screen-header.tsx`)

Add to the top of the import section:

```typescript
import { ScreenHeader } from '@/components/ui/screen-header';
```

**b) Remove the raw title `ThemedText` and replace with `ScreenHeader`**

Remove:
```typescript
<ThemedText style={styles.screenTitle}>More</ThemedText>
```

Replace with:
```typescript
<ScreenHeader title="More" showBack={false} />
```

**c) Remove `styles.screenTitle`** from the `StyleSheet.create` call (it's no longer needed):

```typescript
// DELETE this entry from StyleSheet:
screenTitle: {
  fontSize: 28,
  fontWeight: '700',
  marginBottom: 20,
  marginTop: 8,
},
```

**d) Remove `styles.scroll` paddingTop** — the ScreenHeader now provides the top spacing, so also remove `paddingTop: 8` from `styles.scroll`:

```typescript
scroll: { paddingHorizontal: 16 },  // was: { paddingHorizontal: 16, paddingTop: 8 }
```

**e) Change Exercise Library icon** from `doc.text.fill` to `books.vertical.fill`:

Find the NavItem for Exercise Library (around line 97):
```typescript
<NavItem
  icon="doc.text.fill"    // ← CHANGE
  label="Exercise Library"
```
Replace with:
```typescript
<NavItem
  icon="books.vertical.fill"
  label="Exercise Library"
```

**f) Verify `useSafeAreaInsets` is still imported** (needed for `insets.bottom`). If it's still used for `paddingBottom`, keep the import. If the ScrollView `contentContainerStyle` references `insets.bottom + 24`, keep it. If after ScreenHeader is in place the only remaining use of `insets` is `insets.bottom` in `contentContainerStyle`, that's correct — keep it.

**g) Check that `ThemedText` import is still needed** — it's used by `NavItem`, so keep it.

- [ ] **Step 2: Run lint**

```bash
npx expo lint 2>&1 | grep "more.tsx" | head -10
```

Expected: no errors.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "more.tsx" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/more.tsx
git commit -m "fix(more): add top safe-area via ScreenHeader, fix duplicate icon

BUG 1: replaces raw ThemedText title with ScreenHeader which injects
insets.top + 12, fixing clip under Dynamic Island / notch.
W7: Exercise Library icon changed from doc.text.fill to
books.vertical.fill to differentiate from Templates.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Fix `screen-header.tsx` — W12 (bare Text) + W13 (prop documentation)

**Files:**
- Modify: `components/ui/screen-header.tsx`

W12: The `title` and `subtitle` use bare RN `Text` with manual `{ color: textColor }` — inconsistent with the rest of the codebase that uses `ThemedText`.

W13: The `skipSafeArea` prop defaults to `false` (adds top padding) which is correct behavior, but the semantics are confusing (double-negative). Add a JSDoc comment clarifying the default and when to override.

- [ ] **Step 1: Edit `components/ui/screen-header.tsx`**

**a) Remove the bare `Text` import from react-native** (keep `Pressable`, `StyleSheet`, `View`, `ViewStyle`):

```typescript
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
```

**b) Add `ThemedText` import**:

```typescript
import { ThemedText } from "@/components/ui/themed-text";
```

**c) Replace the two `<Text ...>` elements** with `<ThemedText ...>`. The `ThemedText` component handles theming internally, so drop the `style={{ color: textColor }}` prop and let the component's `type` prop handle sizing:

Replace:
```typescript
<Text style={[styles.title, { color: textColor }]}>{title}</Text>
{subtitle && (
    <Text style={[styles.subtitle, { color: subtitleColor }]}>
        {subtitle}
    </Text>
)}
```

With:
```typescript
<ThemedText style={styles.title}>{title}</ThemedText>
{subtitle && (
    <ThemedText style={[styles.subtitle, { color: subtitleColor }]}>
        {subtitle}
    </ThemedText>
)}
```

Note: `ThemedText` uses `useThemeColor({}, 'text')` internally, so the `textColor` constant can be removed from this component if it's no longer used elsewhere. Check — if `textColor` was only used by `<Text>`, remove the line `const textColor = useThemeColor({}, "text");`.

**d) Add JSDoc to the `skipSafeArea` prop** in the `Props` type:

```typescript
type Props = {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    rightElement?: React.ReactNode;
    style?: ViewStyle;
    /**
     * When true, skips adding `insets.top` padding at the top.
     * Only pass `true` when a parent layout (e.g. a SafeAreaView) already
     * handles top safe area. Default is false — the header IS the safe area source.
     */
    skipSafeArea?: boolean;
    /** If false, hides the back button (use on tab root screens) */
    showBack?: boolean;
};
```

- [ ] **Step 2: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "screen-header" | head -10
npx tsc --noEmit 2>&1 | grep "screen-header" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/screen-header.tsx
git commit -m "fix(screen-header): use ThemedText, document skipSafeArea

W12: replaces bare RN Text with ThemedText for consistency.
W13: adds JSDoc to skipSafeArea clarifying default behavior.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Fix `app/(tabs)/_layout.tsx` — W1 (as any on Redirect hrefs)

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

With `typedRoutes: true` in `app.json`, Expo Router generates typed route literals. The three `as any` casts on `Redirect href` are unnecessary — the paths are valid typed routes.

- [ ] **Step 1: Edit `app/(tabs)/_layout.tsx`** — remove `as any` casts

Replace:
```typescript
return <Redirect href={"/auth/sign-in" as any} />;
```
With:
```typescript
return <Redirect href="/auth/sign-in" />;
```

Replace:
```typescript
return <Redirect href={"/onboarding" as any} />;
```
With:
```typescript
return <Redirect href="/onboarding" />;
```

Replace:
```typescript
return <Redirect href={"/paywall" as any} />;
```
With:
```typescript
return <Redirect href="/paywall" />;
```

- [ ] **Step 2: Verify TypeScript compiles cleanly for this file**

```bash
npx tsc --noEmit 2>&1 | grep "_layout\|Redirect" | head -20
```

Expected: no errors for `app/(tabs)/_layout.tsx`. If Expo Router's typed routes complain about any of these paths, check `app.json` has `"experiments": { "typedRoutes": true }` and that the route files exist on disk.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/_layout.tsx
git commit -m "fix(tabs/layout): remove as-any casts from typed Redirect hrefs

W1: typedRoutes=true makes these paths statically typed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Fix `app/(tabs)/nutrition/index.tsx` — BUG 3 (getUTCDay) + BUG 6 (hardcoded danger color)

**Files:**
- Modify: `app/(tabs)/nutrition/index.tsx`

BUG 3: `new Date().getUTCDay()` returns the UTC weekday. For users west of UTC (all US time zones) training in the evening, this reports the next calendar day — showing rest-day macros on a training day and vice versa.

BUG 6: `Colors.light.danger` hardcodes the light-theme danger red on the trash icon regardless of color scheme.

- [ ] **Step 1: Fix BUG 3 — `getUTCDay()` → `getDay()`**

In `app/(tabs)/nutrition/index.tsx`, find:

```typescript
const dow = new Date().getUTCDay();
```

Replace with:

```typescript
const dow = new Date().getDay(); // local day-of-week, not UTC
```

- [ ] **Step 2: Fix BUG 6 — use themed danger color**

At the top of the component function, add:

```typescript
const dangerColor = useThemeColor({}, 'danger');
```

Then find the trash icon (search for `Colors.light.danger`):

```typescript
<IconSymbol name="trash.fill" size={18} color={Colors.light.danger} />
```

Replace with:

```typescript
<IconSymbol name="trash.fill" size={18} color={dangerColor} />
```

Now remove the `Colors` import if it's no longer used elsewhere in the file. Check: the only other use of `Colors` in nutrition/index.tsx is this icon. If so:

```typescript
// Remove this import line:
import { Colors } from '@/constants/theme';
```

- [ ] **Step 3: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "nutrition/index" | head -10
npx tsc --noEmit 2>&1 | grep "nutrition/index" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/nutrition/index.tsx
git commit -m "fix(nutrition): correct getDay() timezone bug, use themed danger color

BUG 3: getUTCDay() → getDay() — fixes training/rest day misidentification
for all users west of UTC (all Americas) in the evening.
BUG 6: trash icon uses useThemeColor('danger') instead of
Colors.light.danger, fixing dark-mode color mismatch.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Fix `app/(tabs)/progress/_layout.tsx` — W5 (hardcoded hex in screenOptions)

**Files:**
- Modify: `app/(tabs)/progress/_layout.tsx`

`screenOptions` is a plain object literal — hooks cannot be called inside it. The current pattern (`useColorScheme()` + ternary on `'#000'`/`'#fff'`) is the only available Expo Router workaround. The fix is to document this clearly so future developers don't mistake it for a missing refactor.

- [ ] **Step 1: Edit `app/(tabs)/progress/_layout.tsx`** — add explanatory comment

Find:

```typescript
contentStyle: {
  backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
},
```

Replace with:

```typescript
contentStyle: {
  // Hooks (useThemeColor) cannot be called inside screenOptions (plain object),
  // so useColorScheme() + ternary on literal hex is the standard Expo Router
  // workaround. Update both values if the app's base palette changes.
  backgroundColor: colorScheme === 'dark' ? '#151718' : '#fff',
},
```

Note the dark value is corrected to `#151718` to match `Colors.dark.background` from `constants/theme.ts` (previously was `#000` which is pure black, not the app's actual dark background).

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit 2>&1 | grep "progress/_layout" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/progress/_layout.tsx
git commit -m "fix(progress/layout): match actual dark background, document hex workaround

W5: corrects #000 to #151718 (Colors.dark.background), adds comment
explaining why useThemeColor cannot be used in screenOptions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Fix `app/(tabs)/progress/index.tsx` — BUG 5 + W4 + W14 + W15

**Files:**
- Modify: `app/(tabs)/progress/index.tsx`

Four findings in one file:
- BUG 5: `recentMetrics[0]` shows oldest entry, not newest (no guaranteed sort order from API)
- W4: `'#EF4444'` and `'#10B981'` hardcoded — use `useThemeColor({}, 'danger')` and `useThemeColor({}, 'success')` instead
- W14: The `useEffect` fire-and-forgets with no cleanup → `setState` on unmounted component
- W15: `AsyncStorage.getItem('workout_history_v1')` magic string → import `WORKOUT_HISTORY_KEY`

- [ ] **Step 1: Add imports**

Add `WORKOUT_HISTORY_KEY` import:

```typescript
import { fetchLatestBodyMetric, fetchRestingHRSummary, fetchBodyMetrics } from '@/lib/bodyMetrics';
import { WORKOUT_HISTORY_KEY } from '@/lib/workoutStorage';  // ← ADD
```

- [ ] **Step 2: Fix W4 — use themed colors**

In the component body, replace the hardcoded color logic for RHR trend:

Find:
```typescript
const rhrColor = rhrDelta > 0 ? '#EF4444' : rhrDelta < 0 ? '#10B981' : placeholder;
```

Replace with:
```typescript
const dangerColor = useThemeColor({}, 'danger');
const successColor = useThemeColor({}, 'success');
const rhrColor = rhrDelta > 0 ? dangerColor : rhrDelta < 0 ? successColor : placeholder;
```

- [ ] **Step 3: Fix W14 — add mounted guard to useEffect**

Replace the entire `useEffect`:

```typescript
useEffect(() => {
  fetchLatestBodyMetric().then(setLatest).catch(() => {});
  fetchRestingHRSummary(30).then(setRhrSummary).catch(() => {});
  fetchBodyMetrics(60).then(setRecentMetrics).catch(() => {});
  // Count workouts in the last 7 days from local storage
  AsyncStorage.getItem('workout_history_v1').then((raw) => {
    ...
  }).catch(() => setWorkouts7d(0));
}, []);
```

With:

```typescript
useEffect(() => {
  let mounted = true;

  fetchLatestBodyMetric()
    .then((v) => { if (mounted) setLatest(v); })
    .catch(() => {});
  fetchRestingHRSummary(30)
    .then((v) => { if (mounted) setRhrSummary(v); })
    .catch(() => {});
  fetchBodyMetrics(60)
    .then((v) => {
      if (!mounted) return;
      // Sort newest-first so recentMetrics[0] is the latest entry (BUG 5)
      const sorted = [...v].sort((a, b) =>
        b.measured_date.localeCompare(a.measured_date)
      );
      setRecentMetrics(sorted);
    })
    .catch(() => {});

  // Count workouts in the last 7 days from local storage (W15: use key constant)
  AsyncStorage.getItem(WORKOUT_HISTORY_KEY)
    .then((raw) => {
      if (!mounted) return;
      if (!raw) { setWorkouts7d(0); return; }
      try {
        const sessions = JSON.parse(raw);
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setWorkouts7d(
          sessions.filter((s: { createdAt: number }) => s.createdAt >= cutoff).length
        );
      } catch {
        setWorkouts7d(0);
      }
    })
    .catch(() => setWorkouts7d(0));

  return () => { mounted = false; };
}, []);
```

- [ ] **Step 4: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "progress/index" | head -10
npx tsc --noEmit 2>&1 | grep "progress/index" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/progress/index.tsx
git commit -m "fix(progress): sort metrics newest-first, themed colors, cleanup, key constant

BUG 5: sort recentMetrics descending so [0] is the latest entry.
W4: replace hardcoded #EF4444/#10B981 with useThemeColor danger/success.
W14: add mounted guard to useEffect preventing setState-on-unmount.
W15: replace magic string with WORKOUT_HISTORY_KEY import.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Fix `components/home/HomeDashboard.tsx` — W3 (hex colors) + W6 (loading blank)

**Files:**
- Modify: `components/home/HomeDashboard.tsx`

W3: `'#10B981'` (success green) and `'#F59E0B'` (warning amber) are hardcoded throughout. Use `useThemeColor({}, 'success')` and `useThemeColor({}, 'warning')` now that Task 1 has added these tokens.

W6: When `programLoading` is true and `program` is null, the program hero section renders nothing — blank space. Show a subtle loading placeholder card instead.

- [ ] **Step 1: Add themed color variables**

At the top of the `HomeDashboard` function body, below the existing `useThemeColor` calls:

```typescript
const successColor = useThemeColor({}, 'success');
const warningColor = useThemeColor({}, 'warning');
```

- [ ] **Step 2: Replace all hardcoded hex in the component body**

**Coach color logic** — replace:
```typescript
const coachColor =
    coachToday?.overall_color === 'green'
      ? '#10B981'
      : coachToday?.overall_color === 'red'
      ? dangerColor
      : coachToday?.overall_color === 'yellow'
      ? '#F59E0B'
      : tintColor;
```

With:
```typescript
const coachColor =
    coachToday?.overall_color === 'green'
      ? successColor
      : coachToday?.overall_color === 'red'
      ? dangerColor
      : coachToday?.overall_color === 'yellow'
      ? warningColor
      : tintColor;
```

**Nutrition bar fill** — find:
```typescript
backgroundColor: calorieRatio >= 0.9 ? '#10B981' : tintColor,
```

Replace with:
```typescript
backgroundColor: calorieRatio >= 0.9 ? successColor : tintColor,
```

- [ ] **Step 3: Add loading placeholder for program hero (W6)**

Find the program hero section:

```typescript
{program ? (
  <Pressable ...>...</Pressable>
) : !programLoading ? (
  <Pressable ...>...</Pressable>
) : null}
```

Replace the final `: null` with a skeleton placeholder card:

```typescript
{program ? (
  <Pressable
    onPress={onStartWorkout}
    style={({ pressed }) => [
      styles.card,
      { backgroundColor: cardBackground },
      pressed && styles.cardPressed,
    ]}
  >
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.eyebrow, { color: tintColor }]}>TODAY</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
          {program.name}
        </ThemedText>
        <ThemedText style={[styles.cardSub, { color: placeholder }]}>
          Week {program.current_week} of {program.weeks_total}
          {exerciseCount > 0 ? ` · ${exerciseCount} exercises` : ''}
        </ThemedText>
      </View>
      <View style={[styles.startBtn, { backgroundColor: tintColor }]}>
        <ThemedText style={styles.startBtnText}>Start</ThemedText>
      </View>
    </View>
  </Pressable>
) : !programLoading ? (
  <Pressable
    onPress={onNavigateProgram}
    style={({ pressed }) => [
      styles.card,
      { backgroundColor: cardBackground },
      pressed && styles.cardPressed,
    ]}
  >
    <ThemedText style={[styles.eyebrow, { color: placeholder }]}>PROGRAM</ThemedText>
    <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
      Build your program
    </ThemedText>
    <ThemedText style={[styles.cardSub, { color: tintColor }]}>
      Create a personalized multi-week plan →
    </ThemedText>
  </Pressable>
) : (
  /* programLoading — show skeleton so no blank space appears */
  <View style={[styles.card, { backgroundColor: cardBackground }]}>
    <ThemedText style={[styles.eyebrow, { color: placeholder }]}>PROGRAM</ThemedText>
    <ThemedText type="defaultSemiBold" style={[styles.cardTitle, { color: placeholder }]}>
      Loading…
    </ThemedText>
  </View>
)}
```

- [ ] **Step 4: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "HomeDashboard" | head -10
npx tsc --noEmit 2>&1 | grep "HomeDashboard" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/home/HomeDashboard.tsx
git commit -m "fix(dashboard): themed success/warning colors, program loading skeleton

W3: replace hardcoded #10B981/#F59E0B with useThemeColor success/warning
tokens now that theme.ts exposes them.
W6: show 'Loading…' skeleton card while programLoading=true instead
of blank space.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Fix `components/tutorial/TutorialModal.tsx` — W8 (double cast) + W9 (state reset order)

**Files:**
- Modify: `components/tutorial/TutorialModal.tsx`

W8: `SLIDES as unknown as typeof SLIDES[number][]` uses a double cast to suppress a `readonly` tuple vs mutable array incompatibility. Spreading the array removes the `readonly` constraint cleanly.

W9: `handleDismiss` calls `onDismiss()` before `setCurrentIndex(0)`. If the parent immediately removes the modal from the tree, the `setCurrentIndex` call is a no-op on an unmounted component. Reorder so state resets before the parent callback fires.

- [ ] **Step 1: Fix W8 — replace double cast with spread**

Find:

```typescript
data={SLIDES as unknown as typeof SLIDES[number][]}
```

Replace with:

```typescript
data={[...SLIDES]}
```

- [ ] **Step 2: Fix W9 — reset state before calling onDismiss**

Find `handleDismiss`:

```typescript
const handleDismiss = async () => {
  await markTutorialShown();
  onDismiss();
  // Reset state after dismiss
  setCurrentIndex(0);
};
```

Replace with:

```typescript
const handleDismiss = async () => {
  await markTutorialShown();
  // Reset slide index BEFORE calling onDismiss so state is clean
  // if the parent re-opens the modal quickly (e.g. help button).
  setCurrentIndex(0);
  onDismiss();
};
```

- [ ] **Step 3: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "TutorialModal" | head -10
npx tsc --noEmit 2>&1 | grep "TutorialModal" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/tutorial/TutorialModal.tsx
git commit -m "fix(tutorial): spread SLIDES for FlatList, fix dismiss state order

W8: replace 'as unknown as' double cast with [...SLIDES] spread —
removes readonly constraint cleanly without suppressing type safety.
W9: reset currentIndex before calling onDismiss so re-opening the
tutorial via the help button always starts on slide 0.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Fix `app/(tabs)/index.tsx` — Dead state + memoization (BUG 7, W10, W11)

**Files:**
- Modify: `app/(tabs)/index.tsx`

BUG 7: `const [, setError]` is dead state — the value is never rendered or consumed. All error paths silently no-op. The fix removes the dead state; actual user-facing error messaging goes through the `aiBubbleText` path.

W10: `buildRowsFromApi` and `toApiRows` are defined inside the component body without `useCallback`. They have zero dependencies on component state or refs — move them outside the component to make them stable module-level functions.

W11: `openCoach` and `closeCoach` are bare arrow functions recreated every render. Wrap them in `useCallback`.

- [ ] **Step 1: Remove dead `[, setError]` state and its call sites**

Find and **delete** this line:

```typescript
const [, setError] = useState<{ message: string; reason?: string } | null>(null);
```

Then find every call to `setError(...)` in the file and determine the appropriate replacement:

- In `onResetForNewDay` callback: `setError(null);` → **delete the line** (reset is not needed since the state is gone)
- In `confirmStartWorkout`: `setError(null);` → **delete the line**
- In `handleSelectTemplateForStart`: `setError(null);` → **delete the line**
- In `sendMessage` (fast path, line ~873): `setError(null);` → **delete the line**

After removal, check if the `useState` import is still needed (it will be — many other state vars use it). Keep the import.

- [ ] **Step 2: Move `buildRowsFromApi` and `toApiRows` outside the component**

These two functions reference only their arguments — no component state, context, or refs. Move them to just above the `export default function HomeScreen()` declaration:

```typescript
// ── Pure helpers (no component dependencies) ──────────────────────────────
function buildRowsFromApi(apiRows: ApiWorkoutRow[]): LogRow[] {
  return apiRows
    .filter((row) => row.exercise && row.exercise.trim())
    .map((row) => ({
      id: `${Date.now()}-${Math.random()}`,
      exercise: row.exercise.trim(),
      set: Number.isFinite(row.set) ? row.set : 1,
      weightLbs: String(row.weightLbs ?? "").trim(),
      reps: String(row.reps ?? "").trim(),
      notes: String(row.notes ?? "").trim(),
      timestamp: Date.now(),
      status: "committed" as const,
    }));
}

const toApiRows = (sourceRows: LogRow[]): ApiWorkoutRow[] =>
  sourceRows.map((row) => ({
    exercise: row.exercise,
    set: row.set,
    weightLbs: row.weightLbs,
    reps: row.reps,
    notes: row.notes,
  }));

export default function HomeScreen() {
  // ... (remove the two functions from inside the component body)
```

Delete their original definitions inside the component body.

- [ ] **Step 3: Wrap `openCoach` and `closeCoach` in `useCallback`**

Find:

```typescript
const openCoach = () => {
  commitPendingAndGet();
  setCoachError(null);
  setCoachOpen(true);
};

const closeCoach = () => {
  setCoachOpen(false);
};
```

Replace with:

```typescript
const openCoach = useCallback(() => {
  commitPendingAndGet();
  setCoachError(null);
  setCoachOpen(true);
}, [commitPendingAndGet]);

const closeCoach = useCallback(() => {
  setCoachOpen(false);
}, []);
```

Note: `commitPendingAndGet` is a regular function (not yet memoized). This is fine — `openCoach` captures it by reference. If `commitPendingAndGet` later gains a `useCallback`, update the dep array.

- [ ] **Step 4: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "tabs\)/index" | head -20
npx tsc --noEmit 2>&1 | grep "tabs\)/index" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "fix(home): remove dead error state, move helpers out, memoize coach callbacks

BUG 7: remove unused [,setError] state — all 4 setError() call sites
deleted. Errors route through aiBubbleText path already.
W10: buildRowsFromApi and toApiRows moved to module level (no deps)
so they are stable across renders.
W11: openCoach/closeCoach wrapped in useCallback to prevent
CoachModal from re-rendering on unrelated state changes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Fix `app/(tabs)/index.tsx` — Fast-path API sends wrong set number (BUG 4)

**Files:**
- Modify: `app/(tabs)/index.tsx`

BUG 4: In the `"fast"` gate decision path, `api.logSet({ set: 1, // approximate })` fires for all parsed rows. The `log-set` edge function uses the client's `set` value directly (`set_number: set || 1`). For multi-set input like "Bench 185 3x8", the backend records three rows all with `set_number: 1` instead of 1/2/3.

The fix: after `addOrFillRow` builds `next` (the updated rows array), collect the newly appended rows and use their computed `set` values for the API calls.

- [ ] **Step 1: Capture the pre-loop length, then compute newly-added rows**

In the `gateDecision.kind === "fast"` block, find the section that starts `addOrFillRow`:

```typescript
// BEFORE your change, the code looks like this:
parsedRows.forEach((row) => addOrFillRow(row));
setRows(next);
setMessageInput("");
setLoading(false);

// Sync log to backend
parsedRows.forEach(row => {
  api.logSet({
    exercise: row.exercise,
    set: 1, // approximate
    weightLbs: row.weightLbs,
    ...
  }).catch(err => console.error("Failed to sync row", err));
});
```

Replace with:

```typescript
const prevLength = next.length; // snapshot before loop
parsedRows.forEach((row) => addOrFillRow(row));
setRows(next);
setMessageInput("");
setLoading(false);

// Sync log to backend — use actual set numbers from the newly-added rows
const addedRows = next.slice(prevLength);
addedRows.forEach(row => {
  api.logSet({
    exercise: row.exercise,
    set: row.set,           // ← real set number, not 1
    weightLbs: row.weightLbs,
    reps: row.reps,
    notes: row.notes,
    isCardio: row.isCardio,
    durationMins: row.durationMins,
    distance: row.distance,
    distanceUnit: row.distanceUnit,
    heartRate: row.heartRate,
    calories: row.calories,
    level: row.level,
  }).catch(err => console.error("Failed to sync row", err));
});
```

Important: `addOrFillRow` can also *fill* an existing skeleton row (mutating an element of `next` in place) rather than appending a new one. In the fill case no new row is appended, so `next.slice(prevLength)` correctly returns an empty array and no API call fires — which is correct because `syncSkeletonFilledRow` handles the fill case separately.

Also update the PR check loop to iterate over `addedRows` instead of `parsedRows` for consistency (non-added rows are fills, which are also handled by the skeleton sync path):

```typescript
// Client-side PR check fallback (skip cardio entries)
const prUserId = session?.user?.id;
if (prUserId) {
  addedRows.forEach(row => {   // ← was parsedRows
    if (row.isCardio) return;
    const w = parseFloat(row.weightLbs);
    const r = parseInt(row.reps, 10);
    if (!row.weightLbs || !row.reps || isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return;
    checkForPR(prUserId, row.exercise, w, r)
      .then(result => {
        if (result && result.isPR) {
          const dedupKey = `${result.liftName}-${result.weight}-${result.reps}`;
          if (lastCelebratedRef.current === dedupKey) return;
          lastCelebratedRef.current = dedupKey;
          showCelebration(result);
        }
      })
      .catch(err => console.error('[PR] Client-side check failed:', err));
  });
}
```

- [ ] **Step 2: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "tabs\)/index" | head -20
npx tsc --noEmit 2>&1 | grep "tabs\)/index" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "fix(home): fast-path logSet now sends correct set numbers

BUG 4: api.logSet was always sending set: 1 for all parsed rows.
The log-set Edge Function uses the client value directly, so multi-set
input (e.g. 'Bench 185 3x8') corrupted backend records with
set_number=1 for all three inserts.

Fix: capture pre-loop length, slice the newly-added rows post-loop,
and use row.set (computed by nextSetNumberForExercise) for each call.
Fill-path rows (skeleton updates) are correctly excluded — they have
their own syncSkeletonFilledRow path.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Fix `app/(tabs)/index.tsx` — Cold-launch draft race (BUG 2)

**Files:**
- Modify: `app/(tabs)/index.tsx`

BUG 2: On cold launch with a same-day draft, `workoutActive` is `false` until the async draft restore completes. During that window, `HomeDashboard` renders (not `WorkoutTable`) and the tab badge is absent. Critically, if the user taps "Start Workout" during this window, a new session is started while a draft exists — orphaning the draft.

The fix adds a `draftChecked` state boolean that starts `false` and flips to `true` when the draft check promise resolves. `onStartWorkout` is gated on it.

- [ ] **Step 1: Add `draftChecked` state**

Near the other `useState` declarations at the top of the component (around line 108):

```typescript
const [draftChecked, setDraftChecked] = useState(false);
```

- [ ] **Step 2: Set `draftChecked` to `true` after the draft restore promise resolves**

Find the draft restore `useEffect`:

```typescript
getWorkoutDraft().then((draft) => {
  if (!draft) return;
  if (draft.dateISO === todayISO()) {
    setRows(draft.rows);
    restoreWorkoutSession(...);
    console.log('[WorkoutDraft] Restored draft with', draft.rows.length, 'rows');
  } else {
    clearWorkoutDraft();
    console.log('[WorkoutDraft] Cleared stale draft from', draft.dateISO);
  }
});
```

Replace with:

```typescript
getWorkoutDraft().then((draft) => {
  if (draft && draft.dateISO === todayISO()) {
    setRows(draft.rows);
    restoreWorkoutSession(
      draft.bodyParts,
      draft.workoutId,
      draft.createdAt,
      draft.dateISO
    );
    console.log('[WorkoutDraft] Restored draft with', draft.rows.length, 'rows');
  } else if (draft) {
    clearWorkoutDraft();
    console.log('[WorkoutDraft] Cleared stale draft from', draft.dateISO);
  }
}).finally(() => {
  setDraftChecked(true);
});
```

- [ ] **Step 3: Gate `onStartWorkout` on `draftChecked`**

Find:

```typescript
const onStartWorkout = () => {
  if (workoutActive) {
    Alert.alert("Workout already started", "End the current workout to start a new one.");
    return;
  }
  setNameModalVisible(true);
};
```

Replace with:

```typescript
const onStartWorkout = () => {
  // Guard: do not allow starting a new session until the draft check resolves.
  // If tapped before restore completes, a draft could be silently orphaned.
  if (!draftChecked) return;
  if (workoutActive) {
    Alert.alert("Workout already started", "End the current workout to start a new one.");
    return;
  }
  setNameModalVisible(true);
};
```

- [ ] **Step 4: Run lint + tsc**

```bash
npx expo lint 2>&1 | grep "tabs\)/index" | head -20
npx tsc --noEmit 2>&1 | grep "tabs\)/index" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "fix(home): gate onStartWorkout until draft restore resolves

BUG 2: on cold launch with a same-day draft, workoutActive is false
until the async AsyncStorage read completes. If the user tapped
'Start Workout' in that window, a new session would orphan the draft.

Fix: draftChecked state (starts false, set in .finally()) prevents
onStartWorkout from firing before the restore check completes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 14: Fix `app/(tabs)/index.tsx` — Remove `as never` router casts (W2)

**Files:**
- Modify: `app/(tabs)/index.tsx`

W2: Eight `router.push('...' as never)` calls. With `typedRoutes: true` and valid route files on disk, these paths are statically typed. `as never` is the strongest possible type suppression and makes the type system treat these branches as unreachable.

- [ ] **Step 1: Remove `as never` casts**

Find and replace all occurrences. Use a global search for `as never`:

```typescript
// HomeDashboard callbacks (lines ~1210-1212):
onNavigateProgram={() => router.push('/program' as never)}
→ onNavigateProgram={() => router.push('/program')}

onNavigateCoach={() => router.push('/coach' as never)}
→ onNavigateCoach={() => router.push('/coach')}

onNavigateNutrition={() => router.push('/nutrition' as never)}
→ onNavigateNutrition={() => router.push('/nutrition')}

// MenuModal callbacks (lines ~1264-1268):
onNavigateNutrition={() => router.push("/nutrition" as never)}
→ onNavigateNutrition={() => router.push("/nutrition")}

onNavigateCoachReport={() => router.push("/coach" as never)}
→ onNavigateCoachReport={() => router.push("/coach")}

onNavigateProgress={() => router.push("/progress" as never)}
→ onNavigateProgress={() => router.push("/progress")}

onNavigateProgram={() => router.push("/program" as never)}
→ onNavigateProgram={() => router.push("/program")}

onNavigateExerciseLibrary={() => router.push("/exercise-library" as never)}
→ onNavigateExerciseLibrary={() => router.push("/exercise-library")}
```

That's 8 replacements total.

- [ ] **Step 2: Verify TypeScript accepts all routes without casts**

```bash
npx tsc --noEmit 2>&1 | grep "tabs\)/index\|never\|router.push" | head -20
```

Expected: no errors. If any path is rejected, verify the corresponding route file exists under `app/`. All of `/program`, `/coach`, `/nutrition`, `/progress`, `/exercise-library` have `app/<name>/index.tsx` files confirmed in the audit.

- [ ] **Step 3: Full final check**

```bash
npx expo lint && npx tsc --noEmit
```

Expected: clean pass on both.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "fix(home): remove as-never casts from router.push calls

W2: with typedRoutes=true all 8 paths resolve to valid typed routes.
as-never tells TypeScript these branches are unreachable, hiding
any future route renames from the type checker.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

After all 14 tasks are complete:

- [ ] **Run full lint + tsc**

```bash
cd /Users/me/Desktop/partner/11_Codebases/Coach-Kettle
npx expo lint && npx tsc --noEmit
```

Expected: zero errors introduced by these changes.

- [ ] **Reload the app** and manually verify:
  1. `More` tab — title is not clipped under notch/Dynamic Island
  2. Cold-launch with an in-progress draft — `WorkoutTable` appears (not HomeDashboard), green badge present from first render
  3. Nutrition tab — training/rest day label is correct for local time
  4. Progress tab — "Last logged" shows the most recent date
  5. Log a multi-set via natural language (e.g. "Bench 185 3x8") and verify backend receives correct set numbers 1/2/3

- [ ] **User runs deploy** (cannot be automated):
  ```bash
  supabase db push        # if any migration is pending
  supabase functions deploy
  ```

---

## Findings Coverage Summary

| ID | Finding | Task |
|----|---------|------|
| BUG 1 | more.tsx no top safe area | 3 |
| BUG 2 | Cold-launch draft race | 13 |
| BUG 3 | getUTCDay() timezone | 6 |
| BUG 4 | Fast-path set: 1 always | 12 |
| BUG 5 | recentMetrics ordering | 8 |
| BUG 6 | Colors.light.danger | 6 |
| BUG 7 | Dead error state | 11 |
| W1 | _layout Redirect as any | 5 |
| W2 | index.tsx as never (×8) | 14 |
| W3 | HomeDashboard hex colors | 9 |
| W4 | progress/index hex colors | 8 |
| W5 | progress/_layout hex | 7 |
| W6 | HomeDashboard loading blank | 9 |
| W7 | more.tsx duplicate icon | 3 |
| W8 | TutorialModal as unknown as | 10 |
| W9 | TutorialModal dismiss order | 10 |
| W10 | buildRowsFromApi/toApiRows inside component | 11 |
| W11 | openCoach/closeCoach not memoized | 11 |
| W12 | screen-header bare Text | 4 |
| W13 | screen-header skipSafeArea footgun | 4 |
| W14 | progress/index no effect cleanup | 8 |
| W15 | progress/index magic string | 8 |
| W16 | more.tsx go() as any → typed Href | 3 (see note) |

> W16 note: The `go = (path: string) => () => router.push(path as any)` helper in `more.tsx` is improved in Task 3 by switching to typed `Href`. Change `const go = (path: string) =>` to `import { type Href } from 'expo-router'` and `const go = (path: Href) => () => router.push(path)` so the cast is dropped entirely.
