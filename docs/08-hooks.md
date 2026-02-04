# Custom Hooks

> Reusable React hooks for state and logic.

---

## Hooks Overview

| Hook | File | Purpose |
|------|------|---------|
| `useWorkoutSession` | `hooks/useWorkoutSession.ts` | Workout session state |
| `useRowActions` | `hooks/useRowActions.ts` | Row CRUD operations |
| `useCoachLogic` | `hooks/useCoachLogic.ts` | Coach modal logic |
| `useCellEditing` | `hooks/useCellEditing.ts` | Inline cell editing |
| `useThemeColor` | `hooks/use-theme-color.ts` | Theme-aware colors |
| `useColorScheme` | `hooks/use-color-scheme.ts` | System color scheme |

---

## useWorkoutSession

Manages the active workout session state.

**Location:** `hooks/useWorkoutSession.ts`

```typescript
const {
  sessionDate,        // ISO date string
  bodyParts,          // BodyPart[]
  workoutActive,      // boolean
  workoutId,          // string | null
  title,              // string
  selectedPart,       // BodyPart | null

  startWorkoutSession,  // (title, bodyParts, templateRows?) => void
  endWorkoutSession,    // () => void
  buildWorkoutToSave,   // () => WorkoutSession
  setSelectedPart,      // (part: BodyPart) => void
} = useWorkoutSession();
```

### Usage

```typescript
// Start a workout
startWorkoutSession("Push Day", ["Push", "Chest"]);

// With template
const templateRows = expandTemplateToRows(templateItems);
startWorkoutSession("Push Day", ["Push"], templateRows);

// End workout
const session = buildWorkoutToSave();
await saveWorkout(session);
endWorkoutSession();
```

### Auto-Reset

Checks every 30 seconds if the date changed. If so, resets the session.

---

## useRowActions

Handles workout row CRUD with undo support.

**Location:** `hooks/useRowActions.ts`

```typescript
const {
  deleteRow,       // (rowId: string) => void
  undoDelete,      // () => void
  duplicateRow,    // (rowId: string) => void
  moveRow,         // (rowId: string, direction: 'up' | 'down') => void
  undoState,       // { canUndo: boolean, message: string }
} = useRowActions(rows, setRows, commitPendingAndGet);
```

### Usage

```typescript
// Delete with 5s undo window
deleteRow(row.id);
// Toast shows: "Set deleted. Undo?"

// User taps undo
if (undoState.canUndo) {
  undoDelete();
}

// Duplicate row
duplicateRow(row.id);
// New row added below with incremented set number

// Reorder
moveRow(row.id, 'up');
moveRow(row.id, 'down');
```

### Undo Implementation

```typescript
const [deletedRow, setDeletedRow] = useState<LogRow | null>(null);
const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

const deleteRow = (rowId: string) => {
  const currentRows = commitPendingAndGet();
  const row = currentRows.find(r => r.id === rowId);

  if (row) {
    setDeletedRow(row);
    setRows(currentRows.filter(r => r.id !== rowId));

    // Clear after 5 seconds
    const timeout = setTimeout(() => {
      setDeletedRow(null);
    }, 5000);
    setUndoTimeout(timeout);
  }
};

const undoDelete = () => {
  if (deletedRow) {
    setRows([...rows, deletedRow]);
    setDeletedRow(null);
    if (undoTimeout) clearTimeout(undoTimeout);
  }
};
```

---

## useCoachLogic

Manages coach modal state and streaming responses.

**Location:** `hooks/useCoachLogic.ts`

```typescript
const {
  coachOpen,           // boolean
  coachQuestion,       // string
  coachAnswer,         // string
  coachLoading,        // boolean
  coachError,          // Error | null

  openCoach,           // () => void
  closeCoach,          // () => void
  submitCoachQuestion, // (question: string, rows: LogRow[]) => Promise<void>
} = useCoachLogic();
```

### Usage

```typescript
// Open coach modal
openCoach();

// Submit question (with streaming)
await submitCoachQuestion("Should I increase weight?", currentRows);
// coachAnswer updates as response streams in

// Close modal
closeCoach();
```

### Streaming Implementation

```typescript
const submitCoachQuestion = async (question: string, rows: LogRow[]) => {
  setCoachLoading(true);
  setCoachError(null);
  setCoachAnswer('');

  try {
    await askCoach(question, rows, (chunk) => {
      setCoachAnswer(prev => prev + chunk);
    });

    // Save to chat history
    await saveCoachChatQA(question, coachAnswer);

    // Haptic feedback on iOS
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch (error) {
    setCoachError(error);
  } finally {
    setCoachLoading(false);
  }
};
```

---

## useCellEditing

Handles inline cell editing with pending state.

**Location:** `hooks/useCellEditing.ts`

```typescript
const {
  editingCell,         // { rowId: string, field: string, value: string } | null
  startEditing,        // (rowId, field, currentValue) => void
  updateEditValue,     // (value: string) => void
  commitEdit,          // () => LogRow[] (returns updated rows)
  cancelEdit,          // () => void
  applyPendingEdit,    // (rows) => { nextRows, changed }
  commitPendingAndGet, // () => LogRow[]
} = useCellEditing(rows, setRows);
```

### Usage

```typescript
// Start editing a cell
startEditing(row.id, 'weightLbs', row.weightLbs);

// Update as user types
updateEditValue('195');

// Commit changes
const updatedRows = commitEdit();

// Or cancel
cancelEdit();

// Before mutations, commit any pending edits
const currentRows = commitPendingAndGet();
await saveWorkout(buildSession(currentRows));
```

---

## useThemeColor

Returns theme-aware color values.

**Location:** `hooks/use-theme-color.ts`

```typescript
const backgroundColor = useThemeColor({}, 'background');
const textColor = useThemeColor({}, 'text');
const tintColor = useThemeColor({}, 'tint');
const iconColor = useThemeColor({}, 'icon');

// With overrides
const customBg = useThemeColor(
  { light: '#fff', dark: '#000' },
  'background'
);
```

### Available Colors

From `constants/theme.ts`:
- `text` - Primary text
- `background` - Screen background
- `tint` - Accent color
- `icon` - Icon color
- `tabIconDefault` - Inactive tab icon
- `tabIconSelected` - Active tab icon

---

## useColorScheme

Returns system color scheme.

**Location:** `hooks/use-color-scheme.ts`

```typescript
const colorScheme = useColorScheme();
// Returns: 'light' | 'dark'
```

---

## Creating a New Hook

### Basic pattern

```typescript
// hooks/useMyHook.ts
import { useState, useCallback } from 'react';

interface UseMyHookReturn {
  value: string;
  setValue: (v: string) => void;
  reset: () => void;
}

export function useMyHook(initialValue: string = ''): UseMyHookReturn {
  const [value, setValue] = useState(initialValue);

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return { value, setValue, reset };
}
```

### With context dependency

```typescript
// hooks/useMyHook.ts
import { useAuth } from '@/components/AuthProvider';

export function useMyHook() {
  const { session } = useAuth();

  // Hook logic that uses session

  return { /* values */ };
}
```

### With API calls

```typescript
// hooks/useMyData.ts
import { useState, useEffect } from 'react';
import { fetchMyData } from '@/lib/api';

export function useMyData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchMyData();
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const refresh = async () => {
    setLoading(true);
    // ... reload logic
  };

  return { data, loading, error, refresh };
}
```

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - How hooks are used
- [07-components.md](./07-components.md) - Component integration
