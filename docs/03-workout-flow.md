# Workout Flow

## Files
| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Main workout screen |
| `hooks/useWorkoutSession.ts` | Session state |
| `hooks/useRowActions.ts` | Row CRUD |
| `components/workout/WorkoutTable.tsx` | Display rows |
| `components/workout/WorkoutBottomBar.tsx` | Input bar |

## State
```typescript
// app/(tabs)/index.tsx
const [rows, setRows] = useState<LogRow[]>([]);
const [messageInput, setMessageInput] = useState('');

// hooks/useWorkoutSession.ts
const {
  workoutActive,
  sessionDate,
  startWorkoutSession,
  endWorkoutSession,
  buildWorkoutToSave
} = useWorkoutSession();
```

## LogRow Type
```typescript
type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
}
```

## Flow

### Start Workout
```
User opens app → WorkoutNameModal → select body parts → startWorkoutSession()
```

### Log Set
```
Input "Bench 185 x 8" → structuredGate → LogRow → setRows([...rows, newRow])
```

### Edit Set
```
Tap row → EditSetModal → update fields → setRows(updated)
```

### End Workout
```
Tap "End" → buildWorkoutToSave() → saveWorkout() → AsyncStorage + API
          → generateSessionReview() → SessionReviewModal
```

## Key Functions

```typescript
// hooks/useRowActions.ts
const { deleteRow, undoDelete, duplicateRow, moveRow } = useRowActions(rows, setRows);

// Pending edit pattern - commit before API calls
const currentRows = commitPendingAndGet();
await saveWorkout(buildWorkoutToSave(currentRows));
```

## Adding New Row Type
1. Update `LogRow` type in `types/workout.ts`
2. Handle in `structuredGate.ts` parsing
3. Display in `WorkoutCard.tsx`
