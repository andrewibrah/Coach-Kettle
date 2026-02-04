# Data Storage

> Local-first storage with cloud sync.

---

## Overview

The app uses a **local-first** storage strategy:
1. **Immediate:** Data saves to AsyncStorage instantly
2. **Background:** Data syncs to Supabase asynchronously
3. **Resilient:** No data loss on network failures

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/workoutStorage.ts` | Workout save/load |
| `lib/chatStorage.ts` | Chat history |
| `lib/api.ts` | Remote sync API |

---

## Storage Keys

| Key | Purpose | Type |
|-----|---------|------|
| `workout_history_v1` | Saved workouts | `WorkoutSession[]` |
| `chat_history_v1` | Chat messages | `ChatMessage[]` |
| `theme_preference` | Theme setting | `'light' \| 'dark' \| 'system'` |
| `sb-*` | Supabase session | Session data |
| `last_authenticated_at` | Auth timestamp | `number` |
| `biometric_enabled` | Biometric pref | `'true' \| 'false'` |
| `terms_accepted` | ToS acceptance | `'true' \| 'false'` |

---

## Workout Storage

### Types

```typescript
// lib/workoutStorage.ts
export interface WorkoutSession {
  id: string;
  dateISO: string;          // "2024-01-15"
  title: string;            // "Push Day"
  part: BodyPart;           // "Push"
  rows: WorkoutRow[];
  createdAt: number;
  review?: SessionReview;   // Optional AI review
}

export interface WorkoutRow {
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
}

export interface SessionReview {
  summary: string;
  highlights: string[];
  suggestions: string[];
}
```

### Operations

```typescript
import {
  listWorkouts,
  saveWorkout,
  deleteWorkout,
  clearWorkouts
} from '@/lib/workoutStorage';

// List all workouts
const workouts = await listWorkouts();
// Returns: WorkoutSession[]

// Save workout (local + remote)
await saveWorkout(session);
// 1. Saves to AsyncStorage
// 2. Syncs to Supabase (background, best-effort)

// Delete workout
await deleteWorkout(workoutId);
// Removes from AsyncStorage only

// Clear all
await clearWorkouts();
// Wipes local storage
```

### Save Flow

```
saveWorkout(session)
       │
       ▼
┌─────────────────────────────────────┐
│ 1. Load existing from AsyncStorage  │
│ 2. Add/update session               │
│ 3. Save back to AsyncStorage        │
└──────────────┬──────────────────────┘
               │ (immediate)
               ▼
       LOCAL SAVE COMPLETE
               │
               │ (async, non-blocking)
               ▼
┌─────────────────────────────────────┐
│ 4. Call api.saveWorkout(session)    │
│ 5. On failure: Log error, continue  │
│    (data safe in AsyncStorage)      │
└─────────────────────────────────────┘
```

---

## Chat Storage

### Types

```typescript
// lib/chatStorage.ts
export interface ChatMessage {
  id?: string;
  user_id?: string;
  role: 'user' | 'assistant';
  content: string;
  source: 'workout_chat' | 'coach_modal';
  created_at?: string;
}
```

### Operations

```typescript
import {
  saveChatMessages,
  fetchChatHistory,
  saveWorkoutChatQA,
  saveCoachChatQA,
  groupChatsByDate
} from '@/lib/chatStorage';

// Save after workout parsing
await saveWorkoutChatQA(userMessage, aiResponse);

// Save after coach question
await saveCoachChatQA(question, answer);

// Fetch all chat history
const messages = await fetchChatHistory();

// Fetch by source
const coachChats = await fetchChatHistory('coach_modal');

// Group for display
const grouped = groupChatsByDate(messages);
// Returns: { [dateString]: ChatMessage[] }
```

---

## AsyncStorage Best Practices

### Reading Data
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const getData = async (key: string) => {
  try {
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return null;
  }
};
```

### Writing Data
```typescript
const setData = async (key: string, value: any) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing ${key}:`, error);
    throw error;
  }
};
```

### Atomic Updates
```typescript
// Read-modify-write pattern
const updateWorkouts = async (updater: (w: WorkoutSession[]) => WorkoutSession[]) => {
  const current = await listWorkouts();
  const updated = updater(current);
  await AsyncStorage.setItem('workout_history_v1', JSON.stringify(updated));
  return updated;
};
```

---

## Cloud Sync

### Sync Strategy

| Action | Local | Remote |
|--------|-------|--------|
| Save workout | Immediate | Background |
| Delete workout | Immediate | Not synced |
| Load history | AsyncStorage first | Then fetch remote |
| Clear data | AsyncStorage | On sign out |

### API Sync Functions

```typescript
// lib/api.ts

// Save to remote
export async function saveWorkout(session: WorkoutSession): Promise<void> {
  await fetchWithAuth(`${supabaseUrl}/functions/v1/history`, {
    method: 'POST',
    body: JSON.stringify(session)
  });
}

// Get from remote
export async function getHistory(): Promise<WorkoutSession[]> {
  const response = await fetchWithAuth(`${supabaseUrl}/functions/v1/history`);
  return response.json();
}
```

---

## Cache Clearing

On sign out, all cached data is cleared:

```typescript
// components/AuthProvider.tsx
const clearAllCaches = async () => {
  await AsyncStorage.multiRemove([
    'workout_history_v1',
    'chat_history_v1',
    'theme_preference',
    'last_authenticated_at',
    'biometric_enabled',
    'terms_accepted'
  ]);
};
```

---

## Implementing Changes

### Adding a new storage key

```typescript
// 1. Define key constant
const MY_DATA_KEY = 'my_data_v1';

// 2. Create typed accessors
export async function getMyData(): Promise<MyDataType | null> {
  const json = await AsyncStorage.getItem(MY_DATA_KEY);
  return json ? JSON.parse(json) : null;
}

export async function setMyData(data: MyDataType): Promise<void> {
  await AsyncStorage.setItem(MY_DATA_KEY, JSON.stringify(data));
}

// 3. Add to clearAllCaches in AuthProvider
```

### Adding remote sync

```typescript
// 1. Create Edge Function in supabase/functions/
// 2. Add API function in lib/api.ts
// 3. Call API after local save

export async function saveMyData(data: MyDataType): Promise<void> {
  // Local first
  await setMyData(data);

  // Remote sync (background)
  try {
    await api.syncMyData(data);
  } catch (error) {
    console.error('Remote sync failed:', error);
    // Data is safe locally
  }
}
```

---

## Debugging Storage

```typescript
// Dump all storage (dev only)
const debugStorage = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const items = await AsyncStorage.multiGet(keys);
  console.log('Storage dump:', Object.fromEntries(items));
};

// Check specific key
const checkKey = async (key: string) => {
  const value = await AsyncStorage.getItem(key);
  console.log(`${key}:`, value ? JSON.parse(value) : 'null');
};
```

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - Workout save flow
- [06-api.md](./06-api.md) - Remote API
