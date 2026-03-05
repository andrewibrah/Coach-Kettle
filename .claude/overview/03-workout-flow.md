# Workout Flow

> The core workout logging experience - from start to finish.

---

## Overview

The main workout flow happens on the **Home Screen** (`app/(tabs)/index.tsx`). Users:
1. Start a workout (optionally from a template)
2. Log sets via natural language input
3. Edit/delete/reorder sets inline
4. End workout to save

---

## Key Files

| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Main workout screen |
| `hooks/useWorkoutSession.ts` | Session state management |
| `hooks/useRowActions.ts` | Row CRUD operations |
| `lib/structuredGate.ts` | Input parsing |
| `lib/workoutStorage.ts` | Save/load workouts |
| `lib/mediaUpload.ts` | Media upload pipeline |
| `lib/workoutDraft.ts` | Draft persistence |
| `components/workout/WorkoutTable.tsx` | Row display |
| `components/workout/WorkoutBottomBar.tsx` | Input bar |
| `components/media/MediaPickerBubble.tsx` | Photo/video picker |
| `components/media/ReflectionInput.tsx` | Reflection text input |
| `types/workout.ts` | LogRow type |

---

## Workout State

### LogRow Type
```typescript
// types/workout.ts
export type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
  // Cardio fields (v1.0.0+)
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
}
```

### Session State (useWorkoutSession)
```typescript
interface WorkoutSession {
  sessionDate: string;      // ISO date
  bodyParts: BodyPart[];    // Selected body parts
  workoutActive: boolean;   // Is workout in progress
  workoutId: string | null; // Current workout ID
  title: string;            // Workout name
}
```

---

## Workout Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    WORKOUT START                         │
│  1. User taps "Start Workout"                           │
│  2. WorkoutNameModal shows (name + optional template)   │
│  3. startWorkoutSession() called                        │
│  4. If template selected → rows pre-filled              │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    LOGGING SETS                          │
│  User types: "Bench 185 x 8"                            │
│       │                                                  │
│       ▼                                                  │
│  structuredGate.decideAndParse()                        │
│       │                                                  │
│       ├── FAST: Regex match → LogRow created            │
│       └── AI: Send to /chat → LogRow from response      │
│       │                                                  │
│       ▼                                                  │
│  Row added to `rows` state                              │
│  checkForPR() called for PR detection                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    EDITING ROWS                          │
│  - Tap row → EditSetModal                               │
│  - Swipe left → Delete (with 5s undo)                   │
│  - Swipe right → Duplicate                              │
│  - Long press → Reorder                                 │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    WORKOUT END                           │
│  1. User taps "End Workout"                             │
│  2. buildWorkoutToSave() creates WorkoutSession         │
│  3. saveWorkout() saves locally + remote                │
│     (/history POST which also inserts workout_log       │
│      rows for PR detection)                             │
│  4. generateSessionReview(rows, bodyParts) →            │
│     AI generates structured review                      │
│  5. SessionReviewModal shows with:                      │
│     - AI rating (1-10) with strengths/weakness/         │
│       nextSessionNote                                   │
│     - MediaPickerBubble for attaching gym               │
│       photos/videos (up to 10)                          │
│     - ReflectionInput for personal notes                │
│       (2000 char max)                                   │
│  6. On save: uploads media → records in DB →            │
│     saves review_json + reflection via /history PATCH   │
│  7. Draft persistence via workoutDraft.ts               │
│     (restored on same-day relaunch)                     │
│  8. endWorkoutSession() resets state                    │
└─────────────────────────────────────────────────────────┘
```

---

## Input Parsing Flow

**Location:** `lib/structuredGate.ts`

```typescript
// Decision types
type GateDecision =
  | { kind: "fast", reason: "success", rows: ParsedRow[] }
  | { kind: "ai", reason: string }
  | { kind: "end_workout", reason: "end_workout_intent" }
  | { kind: "fill_skeleton", reason: string, weight, reps, targetRowIndex }

// Usage in HomeScreen
const decision = decideAndParse(message, {
  rows,
  lastExercise: getLastExerciseFromRows(rows),
  selectedPart
});

switch (decision.kind) {
  case 'fast':
    // Add rows directly
    const newRows = decision.rows.map(toLogRow);
    setRows([...rows, ...newRows]);
    break;

  case 'ai':
    // Send to AI endpoint
    const response = await chat(message, rows);
    // Parse response and add rows
    break;

  case 'end_workout':
    // Trigger end workout flow
    handleEndWorkout();
    break;

  case 'fill_skeleton':
    // Fill template placeholder
    fillSkeletonRow(decision.targetRowIndex, decision.weight, decision.reps);
    break;
}
```

### Supported Input Patterns

| Pattern | Example | Parsed As |
|---------|---------|-----------|
| Single set | "Bench 185 x 8" | 1 row |
| Multi-set | "Bench 185 3x8" | 3 rows |
| Shorthand | "185 8" (after bench) | Uses last exercise |
| Drop set | "185, 165, 145 x 8" | 3 rows, drop set |
| Superset | "Bench 185 + Rows 135" | 2 rows, superset |
| Cardio | "Run 30 min 3 miles" | Cardio with duration + distance |
| Cardio (full) | "Treadmill 30 min 3 miles 300 cal hr 140 level 5" | Full cardio metrics |
| Warmup | "Warmup bench 95 x 10" | 1 row, warmup note |

Note: Cardio metric parsing is order-independent.

---

## Row Actions (useRowActions)

**Location:** `hooks/useRowActions.ts`

```typescript
const {
  deleteRow,      // Delete with 5s undo
  undoDelete,     // Restore deleted row
  duplicateRow,   // Copy row
  moveRow,        // Move up/down
  undoState       // { canUndo, message }
} = useRowActions(rows, setRows, commitPendingAndGet);
```

### Delete with Undo
```typescript
// User swipes left to delete
deleteRow(rowId);
// Shows toast: "Set deleted. Undo?"
// After 5 seconds, deletion is permanent
// User can tap "Undo" to restore
```

### Duplicate
```typescript
// User swipes right to duplicate
duplicateRow(rowId);
// New row added below original with incremented set number
```

---

## Pending Edit Pattern

When inline editing cells, changes are "pending" until committed:

```typescript
const { commitPendingAndGet, applyPendingEdit } = useCellEditing();

// Before any mutation that reads rows:
const currentRows = commitPendingAndGet();

// Or apply pending without committing:
const { nextRows, changed } = applyPendingEdit(rows);
```

**Why?** Prevents race conditions when user is editing a cell and triggers another action.

---

## Starting a Workout

```typescript
// useWorkoutSession.ts
const startWorkoutSession = (
  title: string,
  bodyParts: BodyPart[],
  templateRows?: LogRow[]
) => {
  setWorkoutActive(true);
  setWorkoutId(makeId());
  setTitle(title);
  setBodyParts(bodyParts);
  setSessionDate(todayISO());

  if (templateRows) {
    setRows(templateRows);
  }
};
```

---

## Ending a Workout

```typescript
// useWorkoutSession.ts
const buildWorkoutToSave = (): WorkoutSession => ({
  id: workoutId,
  dateISO: sessionDate,
  title,
  part: bodyParts[0] || 'Push',
  rows: rows.map(r => ({
    exercise: r.exercise,
    set: r.set,
    weightLbs: r.weightLbs,
    reps: r.reps,
    notes: r.notes
  })),
  createdAt: Date.now()
});

// In HomeScreen
const handleEndWorkout = async () => {
  const session = buildWorkoutToSave();
  await saveWorkout(session);

  // Optional AI review
  const review = await generateSessionReview(rows, bodyParts[0]);
  if (review) {
    setSessionReview(review);
    setShowReviewModal(true);
  }

  endWorkoutSession(); // Reset state
};
```

---

## Implementing Changes

### Adding a new input pattern

Edit `lib/structuredGate.ts`:
```typescript
// Add new regex pattern
const NEW_PATTERN = /^(\w+)\s+new-syntax$/i;

// Add case in decideAndParse
if (NEW_PATTERN.test(message)) {
  const match = message.match(NEW_PATTERN);
  return {
    kind: 'fast',
    reason: 'success',
    rows: [{ exercise: match[1], ... }]
  };
}
```

### Adding a new row action

Edit `hooks/useRowActions.ts`:
```typescript
const newAction = (rowId: string) => {
  const currentRows = commitPendingAndGet();
  const updatedRows = // ... transform rows
  setRows(updatedRows);
};

return { ...existingActions, newAction };
```

### Adding workout metadata

1. Update `WorkoutSession` type in `lib/workoutStorage.ts`
2. Update `buildWorkoutToSave()` in `hooks/useWorkoutSession.ts`
3. Update save/load functions in `workoutStorage.ts`

---

## Related Docs
- [04-parsing.md](./04-parsing.md) - Detailed parsing logic
- [05-storage.md](./05-storage.md) - Data storage
- [08-hooks.md](./08-hooks.md) - Hook details
- [09-modals.md](./09-modals.md) - Modal dialogs
