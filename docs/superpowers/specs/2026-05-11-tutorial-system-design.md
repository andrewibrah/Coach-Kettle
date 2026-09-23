# Tutorial System Design — Coach Kettle
*Date: 2026-05-11*

---

## Summary

Add a first-time tutorial carousel shown immediately after onboarding completes, plus a persistent help button (`?`) in the main Header that lets users re-open the tutorial at any time.

Tutorial uses 5 slides: 2 static (Welcome, You're Ready) and 3 with looping MP4 video demos. Videos are generated with a standalone Remotion project and bundled as app assets.

---

## Phase Plan

| # | Phase | Description |
|---|-------|-------------|
| 1 | Spec (this doc) | Design completed |
| 2 | Remotion video project | `video/` dir, 3 slides rendered → MP4 |
| 3 | Tutorial components | `TutorialModal.tsx`, `TutorialSlide.tsx` |
| 4 | State management | `lib/tutorialState.ts` |
| 5 | Header integration | `onHelpPress` prop + `?` button |
| 6 | Trigger after onboarding | Mount check in `app/(tabs)/index.tsx` |
| 7 | Asset wiring | MP4s in `assets/tutorial/` |

---

## User Decisions

- **Style:** Slideshow / carousel (not interactive coach marks)
- **Re-access:** Help `?` button in main screen Header
- **Scope:** Start workout, Log a set, Browse history & PRs
- **First trigger:** Auto after onboarding, skippable at any time

---

## Architecture

### Two-Track Approach

**Track A — In-App Tutorial Carousel (React Native)**
- `TutorialModal.tsx`: Full-screen modal, FlatList-based horizontal pager with page dots
- `TutorialSlide.tsx`: Renders title, body, optional `expo-av` Video player
- `lib/tutorialState.ts`: AsyncStorage read/write for `tutorial_shown_v1` flag
- Trigger: `app/(tabs)/index.tsx` mounts → checks flag → opens modal if new user

**Track B — Remotion Video Project**
- Located at `video/` (not bundled in app, only the rendered output is)
- Renders 3 MP4 clips at 390×844 (portrait iPhone ratio), 30fps
- Output goes to `assets/tutorial/`
- Clips use React components that mock the Coach Kettle UI in motion

---

## Slides

| Index | Title | Subtitle | Has Video | Video File |
|-------|-------|----------|-----------|------------|
| 0 | Welcome to Coach Kettle | Your AI-powered gym companion | No | — |
| 1 | Start a Session | Pick your focus, name your workout | Yes | `start-workout.mp4` |
| 2 | Log Sets Naturally | Just type "Bench 185 x 8" | Yes | `log-set.mp4` |
| 3 | Track History & PRs | Every PR gets confetti 🎉 | Yes | `history-pr.mp4` |
| 4 | You're Ready 💪 | Hit the gym. We've got you. | No | — |

---

## File Structure

```
app/(tabs)/index.tsx          ← add tutorial trigger on mount

components/tutorial/
  TutorialModal.tsx           ← full carousel modal (5 slides)
  TutorialSlide.tsx           ← single slide with optional video

lib/tutorialState.ts          ← AsyncStorage helpers

components/ui/Header.tsx      ← add optional onHelpPress prop + ? icon

assets/tutorial/              ← pre-rendered MP4s (committed to repo)
  start-workout.mp4
  log-set.mp4
  history-pr.mp4

video/                        ← Remotion standalone project
  src/
    Root.tsx
    TutorialComposition.tsx
    slides/
      StartWorkoutSlide.tsx
      LogSetSlide.tsx
      HistoryPRSlide.tsx
  package.json
  remotion.config.ts
```

---

## Component Specs

### `lib/tutorialState.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tutorial_shown_v1';

export async function isTutorialShown(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === 'true';
}

export async function markTutorialShown(): Promise<void> {
  await AsyncStorage.setItem(KEY, 'true');
}

export async function resetTutorial(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

> NOTE: Add `tutorial_shown_v1` to the `clearAllCaches()` call in `AuthProvider.tsx`.

---

### `components/tutorial/TutorialSlide.tsx`

Props:
- `title: string`
- `subtitle: string`
- `body?: string`
- `videoSource?: AVPlaybackSource` (from expo-av)
- `isStatic?: boolean` (no video — shows gradient background instead)

Behaviour:
- Video: `shouldPlay`, `isLooping`, `resizeMode="contain"`, muted
- Static: themed gradient background with illustration emoji

---

### `components/tutorial/TutorialModal.tsx`

Props:
- `visible: boolean`
- `onDismiss: () => void`

State:
- `currentIndex: number`
- FlatList horizontal pager, `pagingEnabled`
- Page dots (5 dots, active dot highlighted)
- "Skip" button top-right on slides 0-3
- "Next →" button bottom-right on slides 0-3
- "Start Training →" button on slide 4 (calls `onDismiss`)
- On Skip or Done: calls `markTutorialShown()` then `onDismiss()`

---

### `components/ui/Header.tsx` changes

Add optional prop:
```typescript
onHelpPress?: () => void;
```

Render in `headerRight` (between routine icon and trash icon):
```tsx
{onHelpPress && (
  <Pressable onPress={onHelpPress} style={...}>
    <IconSymbol name="questionmark.circle" size={22} color={iconColor} />
  </Pressable>
)}
```

---

### `app/(tabs)/index.tsx` trigger

```typescript
const [showTutorial, setShowTutorial] = useState(false);

useEffect(() => {
  (async () => {
    const shown = await isTutorialShown();
    if (!shown) setShowTutorial(true);
  })();
}, []);
```

Pass to Header:
```tsx
<Header
  ...
  onHelpPress={() => setShowTutorial(true)}
/>
<TutorialModal
  visible={showTutorial}
  onDismiss={() => setShowTutorial(false)}
/>
```

---

## Remotion Video Project

### Setup

```bash
cd video
npm init -y
npm install remotion @remotion/bundler @remotion/renderer react react-dom
```

### Composition config

- **FPS:** 30
- **Width:** 390 (iPhone 14 logical width)
- **Height:** 844
- **Duration per clip:** ~210 frames (~7s)

### Render commands (user runs these after editing)

```bash
cd video
npx remotion render TutorialComposition --props='{"slide":"start-workout"}' ../assets/tutorial/start-workout.mp4
npx remotion render TutorialComposition --props='{"slide":"log-set"}' ../assets/tutorial/log-set.mp4
npx remotion render TutorialComposition --props='{"slide":"history-pr"}' ../assets/tutorial/history-pr.mp4
```

### What each clip shows

**start-workout.mp4**
1. App header visible (0-1s)
2. A modal appears: body part grid animates in (1-3s)
3. "Push" taps, highlights (3-4s)
4. Session name appears (4-6s)
5. Workout rows start populating (6-7s)

**log-set.mp4**
1. Empty input bar at bottom (0-1s)
2. Text types: "Bench 185 x 8" character by character (1-3s)
3. Submit → row appears in table with animation (3-5s)
4. Text types: "225 x 3" (5-6s)
5. Row appears below (6-7s)

**history-pr.mp4**
1. History tab visible with workout cards (0-2s)
2. Taps a card → detail view slides in (2-4s)
3. PR badge glows / confetti burst (4-6s)
4. Returns to history list (6-7s)

---

## Data Flow

```
App launch (post-onboarding)
    │
    ▼
index.tsx mounts
    │
    ▼
isTutorialShown() → AsyncStorage
    │
    ├── false → setShowTutorial(true)
    │              │
    │              ▼
    │         TutorialModal opens
    │              │
    │              ├── User taps Skip → markTutorialShown() → dismiss
    │              └── User taps Done → markTutorialShown() → dismiss
    │
    └── true → nothing (normal app)

Header ? button → setShowTutorial(true) (always available)
```

---

## Dependencies Required

| Package | Already in app? | Notes |
|---------|----------------|-------|
| `expo-av` | Check `package.json` | For video playback |
| `react-native-reanimated` | ✅ Yes | For slide animations |
| `remotion` (video/ only) | No | Dev only, not in app bundle |

> If `expo-av` is not present: `npx expo install expo-av`

---

## Storage Key

| Key | Value | Purpose |
|-----|-------|---------|
| `tutorial_shown_v1` | `'true'` | Has user seen tutorial |

Add to `clearAllCaches()` in `AuthProvider.tsx`:
```typescript
await AsyncStorage.removeItem('tutorial_shown_v1');
```

---

## Out of Scope

- Voice-over in the tutorial clips (can add later)
- Supabase sync of tutorial_shown flag (AsyncStorage-only for now)
- Interactive coach marks (decided against, slideshow is the approach)
- iPad layout variations

---

## Post-Deployment User Steps

1. `npx expo install expo-av` (if not installed)
2. Run Remotion render commands (in `video/`) to generate MP4s
3. Verify `assets/tutorial/*.mp4` files exist
4. Reload the app
