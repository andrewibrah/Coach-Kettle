# Templates

## Concept
Templates = workout skeletons. Exercises without weights/reps, filled during workout.

## Files
| File | Purpose |
|------|---------|
| `lib/profile.ts` | Template CRUD functions |
| `app/settings/templates.tsx` | Manage templates |
| `components/modals/RoutineModal.tsx` | Select template |

## Types

```typescript
type WorkoutTemplate = {
  id: string;
  name: string;
  description?: string;
  display_order: number;
}

type WorkoutTemplateItem = {
  id: string;
  template_id: string;
  lift_name: string;
  target_sets?: number;
  target_reps?: number;
  display_order: number;
}
```

## Functions

```typescript
// lib/profile.ts
fetchWorkoutTemplates(userId)
createWorkoutTemplate(userId, name, description)
deleteWorkoutTemplate(templateId)
fetchTemplateItems(templateId)
addTemplateItem(templateId, item)
removeTemplateItem(itemId)
```

## Using Templates

### Start Workout with Template
```
WorkoutNameModal → select template → expandTemplateToRows(items) → skeleton rows
```

### Fill Skeleton Row
```
Input "185 x 8" → structuredGate detects fill_skeleton → fills first empty row
```

```typescript
// lib/workoutRules.ts
expandTemplateToRows(items: WorkoutTemplateItem[]): LogRow[]
// Returns rows with exercise set, weight/reps empty
```

## Creating Template
1. Settings → Templates → Create
2. Add exercises with target sets/reps
3. Save → available in WorkoutNameModal
