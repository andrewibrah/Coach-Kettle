# Hooks

## Overview

| Hook | File | Purpose |
|------|------|---------|
| `useWorkoutSession` | `hooks/useWorkoutSession.ts` | Session state |
| `useRowActions` | `hooks/useRowActions.ts` | Row CRUD + undo |
| `useCoachLogic` | `hooks/useCoachLogic.ts` | AI coach modal |
| `useCellEditing` | `hooks/useCellEditing.ts` | Inline editing |
| `useThemeColor` | `hooks/use-theme-color.ts` | Theme colors |

## useWorkoutSession

```typescript
const {
  sessionDate,      // 'YYYY-MM-DD'
  bodyParts,        // BodyPart[]
  workoutActive,    // boolean
  workoutId,        // string | null
  title,            // string
  startWorkoutSession,
  endWorkoutSession,
  buildWorkoutToSave
} = useWorkoutSession();
```

Auto-resets on date change (30s interval).

## useRowActions

```typescript
const {
  deleteRow,    // (id) => void, 5s undo window
  undoDelete,   // () => void
  duplicateRow, // (id) => void
  moveRow,      // (id, direction) => void
  undoState     // { canUndo, deletedRow }
} = useRowActions(rows, setRows);
```

## useCoachLogic

```typescript
const {
  coachOpen,
  coachQuestion,
  coachAnswer,    // Streaming text
  coachLoading,
  submitCoachQuestion,
  openCoach,
  closeCoach
} = useCoachLogic(rows);
```

## useThemeColor

```typescript
const bg = useThemeColor({}, 'background');
const text = useThemeColor({}, 'text');
const tint = useThemeColor({}, 'tint');
```

## Creating Hooks

```typescript
// hooks/useMyHook.ts
import { useState, useCallback } from 'react';

export function useMyHook(initial: string) {
  const [value, setValue] = useState(initial);

  const update = useCallback((newVal: string) => {
    setValue(newVal);
  }, []);

  return { value, update };
}
```
