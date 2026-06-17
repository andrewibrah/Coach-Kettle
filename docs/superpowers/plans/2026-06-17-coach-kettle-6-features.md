# Coach Kettle — 6 Feature Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan one FEATURE at a time. Each feature is a self-contained iteration: implement fully → run `npx gitnexus analyze` → commit → `/compact`. Do NOT bleed across features in a single context window.

**Goal:** Harden six user-facing features identified in the June 17 quality scan — eliminating silent failures, invisible errors, theming inconsistencies, and missing resilience patterns across the nutrition, coaching, history, and rest-timer surfaces.

**Architecture:** Each feature is a focused, surgical hardening of one product surface. No cross-cutting refactors. Changes stay within the blast radius of the target surface. All new patterns mirror the existing code conventions (e.g. error fields mirror NutritionContext pattern, colors use `useThemeColor()`).

**Tech Stack:** Expo SDK 55, React Native 0.83.6, TypeScript, Supabase Edge Functions, AsyncStorage, expo-router, react-native-safe-area-context.

## Automation Contract (read before every iteration)

Each cron job / scheduled agent picks up the **next `[ ]` feature below**, executes it end-to-end in one context window, then:
1. Runs `npx gitnexus analyze` to re-index the graph
2. Runs `npx expo lint` and `npx tsc --noEmit` — must be clean
3. Commits with a clear message
4. Marks the feature `[x]` in this file and commits the plan update
5. Calls `/compact` to clear context before the next iteration fires

## Feature Status Tracker

- [x] **F1** — Log Food: silent failure hardening *(done 2026-06-17)*
- [x] **F2** — Nutrition Home: error banner + retry *(done 2026-06-17)*
- [x] **F3** — Coaching Context: error resilience *(done 2026-06-17)*
- [ ] **F4** — History Screen: theming + loading hardening
- [ ] **F5** — Session Review: save-path UX gap + reflection state reset
- [ ] **F6** — Rest Timer: commit WIP + notification resilience

## Global Constraints

- `@/` path aliases only — no relative imports
- `useThemeColor()` for all colors — no hardcoded hex or `Colors.*` direct access
- Mutations via Edge Functions only — never direct Supabase DB from client
- Call `commitPendingAndGet()` before any mutation that reads rows
- When adding a new AsyncStorage key, add it to `clearAllCaches()` in `AuthProvider`
- `SUPABASE_ANON_KEY` + bearer token for user-scoped calls — never service-role on client
- After every feature: `npx gitnexus analyze` then lint + typecheck must pass

---

## F3 — Coaching Context: Error Resilience

**Status:** `[ ]`
**Surface:** `contexts/CoachingContext.tsx`, `app/coach/` screens, `components/home/HomeDashboard.tsx`
**Goal:** Surface coaching load failures so the user knows why their coach feed is blank and can retry — mirrors the NutritionContext `error` field pattern added in F2.

### What currently breaks
`CoachingContext.refresh()` uses `Promise.allSettled` but never sets any error state. When `fetchTodayFeedback`, `fetchRecentFeedback`, or `fetchBehaviorState` reject, the UI silently shows `today: null` / `recent: []` with no message or retry affordance.

### Files to Change

- **Modify:** `contexts/CoachingContext.tsx` — add `error: string | null` field
- **Modify:** `app/coach/index.tsx` (or wherever coach feed renders) — consume `error`, show banner + retry
- **Modify:** `components/home/HomeDashboard.tsx` — if it renders coaching state, guard null state

### Task F3-1: Add `error` to CoachingContext

- [ ] Read `contexts/CoachingContext.tsx` fully before touching it

- [ ] Add `error: string | null` to the `CoachingContextValue` interface:
```typescript
interface CoachingContextValue {
  loading: boolean;
  error: string | null;   // ← add this
  today: DailyFeedback | null;
  recent: DailyFeedback[];
  state: BehaviorState | null;
  refresh: () => Promise<void>;
  regenerateToday: () => Promise<void>;
}
```

- [ ] Add to the default context value:
```typescript
const CoachingContext = createContext<CoachingContextValue>({
  loading: true,
  error: null,   // ← add
  today: null,
  ...
```

- [ ] Add `const [error, setError] = useState<string | null>(null);` in the provider

- [ ] In `refresh()`, clear error at start and set it on failures — mirror NutritionContext exactly:
```typescript
const refresh = useCallback(async () => {
  if (!userId) {
    if (isMounted.current) { setError(null); setToday(null); setRecent([]); setState(null); setLoading(false); }
    return;
  }
  if (isMounted.current) { setLoading(true); setError(null); }
  try {
    const [t, r, s] = await Promise.allSettled([
      fetchTodayFeedback(),
      fetchRecentFeedback(7),
      fetchBehaviorState(),
    ]);
    if (!isMounted.current) return;
    if (t.status === 'fulfilled') setToday(t.value);
    if (r.status === 'fulfilled') setRecent(r.value);
    if (s.status === 'fulfilled') setState(s.value);
    const failures = [t, r, s].filter(res => res.status === 'rejected');
    if (failures.length > 0) {
      setError('Coach data could not be fully loaded. Pull to retry.');
    }
  } catch (e) {
    console.warn('[CoachingContext] refresh error', e);
    if (isMounted.current) {
      setToday(null); setRecent([]); setState(null);
      setError('Coach data could not be loaded. Please try again.');
    }
  } finally {
    if (isMounted.current) setLoading(false);
  }
}, [userId]);
```

- [ ] Add `error` to the `useMemo` value object and dependency array

- [ ] Run `npx tsc --noEmit` — must pass before moving on

### Task F3-2: Surface error in the coach screen

- [ ] Read `app/coach/index.tsx` (or whatever file renders the daily coaching feed)

- [ ] Destructure `error` and `refresh` from `useCoaching()`

- [ ] Find the loading/empty state render path and add an error banner above or in place of the empty state. Mirror the nutrition pattern:
```tsx
{error && !loading && (
  <View style={[styles.errorBanner, { backgroundColor: dangerColor }]}>
    <ThemedText style={styles.errorText}>{error}</ThemedText>
    <Pressable onPress={refresh} style={styles.retryBtn}>
      <ThemedText style={styles.retryText}>Retry</ThemedText>
    </Pressable>
  </View>
)}
```
Use `useThemeColor({}, 'danger')` for `dangerColor`. Add styles matching the nutrition home pattern (borderRadius 10, padding 12, flex row, white text).

- [ ] Run `npx expo lint` and `npx tsc --noEmit` — must pass

### Task F3-3: Guard HomeDashboard coaching null state

- [ ] Read `components/home/HomeDashboard.tsx`

- [ ] Check: does it render `coachToday` anywhere without a null guard? If so, add one. If it already has null guards, skip.

- [ ] Commit:
```bash
git add contexts/CoachingContext.tsx app/coach/index.tsx components/home/HomeDashboard.tsx
git commit -m "feat(coaching): surface load errors with retry affordance"
```

- [ ] Run `npx gitnexus analyze`

---

## F4 — History Screen: Theming + Loading Hardening

**Status:** `[ ]`
**Surface:** `app/(tabs)/history.tsx`, `app/history/[id].tsx`
**Goal:** Replace all direct `Colors.*` access with `useThemeColor()` per project rules; add a loading spinner on initial load (currently only `refreshing` is tracked, not initial); add pull-to-refresh to the SectionList; add a proper empty state.

### What currently breaks
`history.tsx` lines 55-61 use `Colors.dark.*` / `Colors.light.*` directly — violates the project rule "useThemeColor() for all colors." Initial load has no loading indicator (spinner only shows on pull-to-refresh). If history is empty, no empty state copy exists.

### Files to Change

- **Modify:** `app/(tabs)/history.tsx`
- **Maybe modify:** `app/history/[id].tsx` (check for same theming violations)

### Task F4-1: Replace Colors.* with useThemeColor()

- [ ] Read `app/(tabs)/history.tsx` completely

- [ ] Delete all `Colors` imports and `useColorScheme` hook usage

- [ ] Replace each direct color reference with `useThemeColor({}, '<key>')`:
  - `backgroundColor` → `useThemeColor({}, 'background')`
  - `textColor` → `useThemeColor({}, 'text')`
  - `cardBg` → `useThemeColor({}, 'cardBackground')`
  - `borderColor` → `useThemeColor({}, 'border')`
  - `secondaryTextColor` → `useThemeColor({}, 'placeholder')`
  - `chevronColor` → `useThemeColor({}, 'icon')`
  - Any hardcoded hex in `getRatingColor` (keep those as-is — semantic rating colors, not theme colors)

- [ ] Run `npx tsc --noEmit` — must pass

### Task F4-2: Add initial-load spinner + loading state

- [ ] Add `const [initialLoading, setInitialLoading] = useState(true);` to the component state

- [ ] In `load()`, set `setInitialLoading(false)` in a `finally` block after the first call. For subsequent (pull-to-refresh) calls it stays false:
```typescript
const load = async (isInitial = false) => {
  try {
    setLoadError(false);
    const data = await api.getHistory();
    const sorted = [...data].sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    setItems(sorted);
  } catch {
    setLoadError(true);
  } finally {
    if (isInitial) setInitialLoading(false);
  }
};
```

- [ ] Update `useFocusEffect` to call `load(true)` on first focus, then `load()` on subsequent:
```typescript
const firstFocusRef = useRef(true);
useFocusEffect(
  useCallback(() => {
    load(firstFocusRef.current);
    firstFocusRef.current = false;
  }, [])
);
```

- [ ] Add a loading guard above the SectionList:
```tsx
if (initialLoading) {
  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator />
    </ThemedView>
  );
}
```

### Task F4-3: Pull-to-refresh on SectionList + empty state

- [ ] Add `refreshing` and `onRefresh` to the `SectionList`:
```tsx
<SectionList
  ...
  refreshing={refreshing}
  onRefresh={onRefresh}
  ListEmptyComponent={
    loadError ? (
      <View style={styles.emptyState}>
        <ThemedText style={{ color: placeholder, textAlign: 'center' }}>
          Could not load history. Pull to retry.
        </ThemedText>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <ThemedText style={{ color: placeholder, textAlign: 'center' }}>
          No workouts yet. Start your first session.
        </ThemedText>
      </View>
    )
  }
/>
```
Add `emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }` to StyleSheet.

- [ ] Commit:
```bash
git add "app/(tabs)/history.tsx"
git commit -m "fix(history): replace direct Colors usage with useThemeColor, add loading + empty state"
```

- [ ] Check `app/history/[id].tsx` for the same `Colors.*` violations — fix them with the same pattern if present

- [ ] Run `npx gitnexus analyze`

---

## F5 — Session Review: Save-Path UX Gap + Reflection State Reset

**Status:** `[ ]`
**Surface:** `app/(tabs)/index.tsx` (`handleEndWorkoutWithReview`), `components/modals/SessionReviewModal.tsx`
**Goal:** Two targeted fixes: (a) when AI review fails but workout saves successfully, immediately communicate success so the user isn't left in the null-review modal state with no explanation of what happened; (b) `reflection` and `mediaItems` state in `SessionReviewModal` is not reset between workout sessions, so a second workout shows the previous session's reflection text.

### What currently breaks

**(a) Save-without-review path:** When review generation throws but `api.saveWorkout` succeeds, `setReviewLoading(false)` is called and `sessionReview` stays null — the modal correctly shows the fallback "Could not generate review" view, but it doesn't tell the user their data WAS saved. The message currently says "Your workout has been saved" which is correct but could be clearer with a timing message.

**(b) Reflection state leak:** `SessionReviewModal` initializes `reflection = ""` and `mediaItems = []` only at component mount. Since the modal is mounted once and its `visible` prop toggles, the reflection text from workout #1 persists into workout #2's review modal. `handleDone` does call `setReflection("")` and `setMediaItems([])` — but if the user dismisses via the X button (`handleDone` is wired to xmark), it resets. The real leak is if `onClose` is called from the parent without going through `handleDone`. Currently `onClose` from the parent just calls `setReviewModalVisible(false)` without resetting modal-internal state. This is fine because `handleDone` calls `onClose` — but verify.

### Files to Change

- **Modify:** `components/modals/SessionReviewModal.tsx`
- **Maybe modify:** `app/(tabs)/index.tsx` (only if save-success message needs updating)

### Task F5-1: Verify and fix reflection state reset

- [ ] Read `components/modals/SessionReviewModal.tsx` fully

- [ ] Trace: does `handleDone` (which resets state) get called in ALL dismiss paths?
  - X button → `handleDone` ✓
  - Done button → `handleDone` ✓  
  - Close button (null-review path) → `handleDone` ✓
  - Parent `onClose` prop call — check `index.tsx`: parent calls `setReviewModalVisible(false)` then `setSessionReview(null)` — this does NOT call `handleDone`, so modal internal state (reflection, mediaItems) is NOT reset

- [ ] Fix: add a `useEffect` in `SessionReviewModal` that resets internal state when `visible` transitions from true → false:
```typescript
const prevVisible = useRef(visible);
useEffect(() => {
  if (prevVisible.current && !visible) {
    setReflection('');
    setMediaItems([]);
  }
  prevVisible.current = visible;
}, [visible]);
```

- [ ] Run `npx tsc --noEmit` — must pass

### Task F5-2: Strengthen save-success messaging in null-review path

- [ ] In `SessionReviewModal.tsx`, find the null-review error container (the `else` branch at `review ? ... : ...`):
```tsx
<ThemedText style={styles.errorText}>
  Could not generate review. Your workout has been saved.
</ThemedText>
```

- [ ] Update to be more direct and action-oriented:
```tsx
<ThemedText style={styles.errorText}>
  Workout saved. The AI review couldn't be generated — tap Close to continue.
</ThemedText>
```

- [ ] Commit:
```bash
git add components/modals/SessionReviewModal.tsx
git commit -m "fix(session-review): reset reflection state between sessions, clarify save-success message"
```

- [ ] Run `npx gitnexus analyze`

---

## F6 — Rest Timer: Commit WIP + Notification Resilience

**Status:** `[ ]`
**Surface:** `components/workout/RestTimerToast.tsx` (uncommitted WIP), `contexts/NutritionContext.tsx` (uncommitted WIP), `hooks/useRestTimer.ts`, `lib/restTimer.ts`
**Goal:** (a) Commit the two uncommitted WIP files that are currently sitting in the working tree. (b) Harden the "rest complete" notification path — currently `Haptics.notificationAsync` fires on `done` state in `RestTimerToast`, but if the app is backgrounded, no notification reaches the user at all. Wire up Expo Notifications for a local push when the timer completes in the background.

### What currently breaks

**Uncommitted WIP:** `git status` shows `components/workout/RestTimerToast.tsx` and `contexts/NutritionContext.tsx` modified but not staged. These need to be committed (the changes are correct — typed `TIMER_ROUTE`, `endsWith` pathname check, and `error` state in NutritionContext).

**Background timer:** `useRestTimer` (in `hooks/useRestTimer.ts`) ticks via a `setInterval`. When the app is backgrounded on iOS, JS execution suspends and the interval stops. The timer resumes correctly when the app foregrounds (because it's wall-clock based via `endsAt`), but the user receives no notification that rest is complete while they're away from the screen.

### Files to Change

- **Commit staged:** `components/workout/RestTimerToast.tsx`, `contexts/NutritionContext.tsx`
- **Modify:** `hooks/useRestTimer.ts` — schedule a local notification when timer starts, cancel it when timer is cancelled/skipped
- **Modify:** `lib/notifications.ts` — add `scheduleRestCompleteNotification` and `cancelRestNotification` helpers (check if file already has these; if so, update)
- **Read first:** `lib/notifications.ts`, `hooks/useRestTimer.ts`

### Task F6-1: Commit the two WIP files

- [ ] Stage and commit the existing working-tree changes:
```bash
git add components/workout/RestTimerToast.tsx contexts/NutritionContext.tsx
git commit -m "fix(rest-timer): type TIMER_ROUTE, use endsWith pathname check; feat(nutrition): expose error field in context"
```

### Task F6-2: Read existing notification infrastructure

- [ ] Read `lib/notifications.ts` fully — understand what helpers already exist

- [ ] Read `hooks/useRestTimer.ts` fully — understand the start/cancel/skip/done lifecycle

- [ ] Check `app.json` for `expo-notifications` config (needs `ios.infoPlist.NSUserNotificationsUsageDescription`)

### Task F6-3: Add schedule/cancel notification helpers

- [ ] In `lib/notifications.ts`, add two functions (import `Notifications` from `expo-notifications` if not already):
```typescript
import * as Notifications from 'expo-notifications';

const REST_NOTIF_ID_KEY = 'rest_timer_notif_id';

export async function scheduleRestCompleteNotification(inSeconds: number): Promise<void> {
  // Cancel any existing rest notification first
  await cancelRestNotification();
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: 'Time for your next set.',
        sound: true,
      },
      trigger: { seconds: Math.max(1, Math.round(inSeconds)), type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
    });
    await AsyncStorage.setItem(REST_NOTIF_ID_KEY, id);
  } catch (e) {
    console.warn('[notifications] scheduleRestCompleteNotification failed', e);
  }
}

export async function cancelRestNotification(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(REST_NOTIF_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(REST_NOTIF_ID_KEY);
    }
  } catch (e) {
    console.warn('[notifications] cancelRestNotification failed', e);
  }
}
```
Add `AsyncStorage` import from `@react-native-async-storage/async-storage` if not present.

### Task F6-4: Wire into useRestTimer lifecycle

- [ ] In `hooks/useRestTimer.ts`, import `scheduleRestCompleteNotification` and `cancelRestNotification` from `@/lib/notifications`

- [ ] After a successful `start()` call that transitions state to `running`, call:
```typescript
scheduleRestCompleteNotification(durationSec).catch(() => undefined);
```

- [ ] In `cancel()` and `skip()` handlers, call:
```typescript
cancelRestNotification().catch(() => undefined);
```

- [ ] When state transitions to `done` (inside the tick effect), call:
```typescript
cancelRestNotification().catch(() => undefined); // notification already fired, clean up the stored ID
```

- [ ] Run `npx tsc --noEmit` — must pass

### Task F6-5: Add REST_NOTIF_ID_KEY to clearAllCaches

- [ ] Open `contexts/AuthProvider.tsx`, find `clearAllCaches()`
- [ ] Add `AsyncStorage.removeItem('rest_timer_notif_id')` to the list of cache clears
- [ ] Verify `REST_NOTIF_ID_KEY` string matches exactly (`'rest_timer_notif_id'`)

- [ ] Commit:
```bash
git add hooks/useRestTimer.ts lib/notifications.ts contexts/AuthProvider.tsx
git commit -m "feat(rest-timer): schedule local notification for background completion"
```

- [ ] Run `npx gitnexus analyze`

---

## Cron Job Configuration

Six scheduled agents, one per feature. Each fires daily at 09:00 local, staggered by one day starting tomorrow. Each agent:
1. Reads this plan file to find the next `[ ]` feature
2. Executes all tasks for that feature
3. Runs `npx gitnexus analyze` + lint + typecheck
4. Marks feature `[x]` in this file and commits plan update
5. Reports completion

**Jobs registered in:** `.claude/cron-jobs.md` (created by schedule setup below)

---

## Post-Feature Checklist (every feature)

```
[ ] npx expo lint — clean
[ ] npx tsc --noEmit — clean  
[ ] npx gitnexus analyze — re-indexed
[ ] git log --oneline -3 — shows clean commit(s)
[ ] Mark feature [x] in this plan file
[ ] git add docs/superpowers/plans/2026-06-17-coach-kettle-6-features.md && git commit -m "chore(plan): mark F{N} complete"
```
