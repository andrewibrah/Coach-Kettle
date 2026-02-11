# Workout Templates

> Pre-defined workout routines for quick session starts.

---

## Overview

Templates allow users to save workout routines and quickly start sessions with pre-populated exercises. Templates are "skeletons" - exercises without weights/reps that get filled in during the workout.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/profile.ts` | Template CRUD functions |
| `lib/workoutRules.ts` | Template expansion |
| `app/settings/templates.tsx` | Template management |
| `components/modals/RoutineModal.tsx` | Template selection |
| `components/modals/WorkoutNameModal.tsx` | Template on start |

---

## Data Structures

### WorkoutTemplate

```typescript
interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;           // "Push Day"
  description: string;    // "Chest, shoulders, triceps"
  display_order: number;  // For sorting
  is_active: boolean;     // Show in selection
  created_at: string;
  updated_at: string;
}
```

### WorkoutTemplateItem

```typescript
interface WorkoutTemplateItem {
  id: string;
  template_id: string;
  user_id: string;
  lift_name: string;      // "Bench Press"
  target_sets: number;    // 3
  target_reps: number;    // 8
  target_weight: number;  // 185 (optional, for reference)
  display_order: number;  // For sorting
  notes: string;          // "Focus on form"
}
```

---

## Template Flow

```
┌─────────────────────────────────────┐
│ User taps "Start Workout"           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ WorkoutNameModal                    │
│ - Enter workout name                │
│ - Select body parts                 │
│ - (Optional) Select template        │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
  No Template     Template Selected
       │               │
       ▼               ▼
  Empty rows      expandTemplateToRows()
       │               │
       └───────┬───────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Skeleton rows displayed             │
│ - Exercise names shown              │
│ - Weight/reps empty                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ User fills in weights/reps          │
│ "185 8" → fills first skeleton      │
└─────────────────────────────────────┘
```

---

## Template CRUD

**Location:** `lib/profile.ts`

### Fetch Templates

```typescript
export async function fetchWorkoutTemplates(
  userId: string
): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('display_order');

  if (error) throw error;
  return data || [];
}
```

### Create Template

```typescript
export async function createWorkoutTemplate(
  userId: string,
  name: string,
  description: string
): Promise<WorkoutTemplate> {
  const { data, error } = await supabase
    .from('workout_templates')
    .insert({
      user_id: userId,
      name,
      description,
      display_order: 0,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### Delete Template

```typescript
export async function deleteWorkoutTemplate(
  templateId: string
): Promise<void> {
  // Delete items first
  await supabase
    .from('workout_template_items')
    .delete()
    .eq('template_id', templateId);

  // Then delete template
  await supabase
    .from('workout_templates')
    .delete()
    .eq('id', templateId);
}
```

### Fetch Template Items

```typescript
export async function fetchTemplateItems(
  templateId: string
): Promise<WorkoutTemplateItem[]> {
  const { data, error } = await supabase
    .from('workout_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order');

  if (error) throw error;
  return data || [];
}
```

### Add Template Item

```typescript
export async function addTemplateItem(
  templateId: string,
  item: Omit<WorkoutTemplateItem, 'id' | 'template_id' | 'user_id'>
): Promise<WorkoutTemplateItem> {
  const { data, error } = await supabase
    .from('workout_template_items')
    .insert({
      template_id: templateId,
      ...item
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

---

## Template Expansion

**Location:** `lib/workoutRules.ts`

Convert template items to skeleton LogRows:

```typescript
export function expandTemplateToRows(
  items: WorkoutTemplateItem[]
): LogRow[] {
  const rows: LogRow[] = [];

  for (const item of items) {
    // Create rows for each target set
    for (let set = 1; set <= item.target_sets; set++) {
      rows.push({
        id: makeId(),
        exercise: item.lift_name,
        set,
        weightLbs: '',  // Empty - skeleton
        reps: '',       // Empty - skeleton
        notes: set === 1 ? item.notes : '',
        timestamp: Date.now(),
        isSkeleton: true  // Flag for UI
      });
    }
  }

  return rows;
}
```

### Example

```typescript
// Template items:
[
  { lift_name: 'Bench Press', target_sets: 3, target_reps: 8 },
  { lift_name: 'Incline DB Press', target_sets: 3, target_reps: 10 }
]

// Expanded to rows:
[
  { exercise: 'Bench Press', set: 1, weightLbs: '', reps: '', isSkeleton: true },
  { exercise: 'Bench Press', set: 2, weightLbs: '', reps: '', isSkeleton: true },
  { exercise: 'Bench Press', set: 3, weightLbs: '', reps: '', isSkeleton: true },
  { exercise: 'Incline DB Press', set: 1, weightLbs: '', reps: '', isSkeleton: true },
  { exercise: 'Incline DB Press', set: 2, weightLbs: '', reps: '', isSkeleton: true },
  { exercise: 'Incline DB Press', set: 3, weightLbs: '', reps: '', isSkeleton: true },
]
```

---

## Skeleton Filling

When templates are loaded, the `structuredGate` handles filling skeletons:

**Location:** `lib/structuredGate.ts`

```typescript
function decideAndParse(message: string, context: ParseContext): GateDecision {
  // Check for skeleton rows first
  const firstSkeleton = context.rows.find(r => r.isSkeleton && !r.weightLbs);

  if (firstSkeleton) {
    // Try to parse as weight/reps only
    const simpleMatch = message.match(/^(\d+(?:\.\d+)?)\s+(\d+)$/);

    if (simpleMatch) {
      return {
        kind: 'fill_skeleton',
        reason: 'filling_template_row',
        weight: simpleMatch[1],
        reps: simpleMatch[2],
        targetRowIndex: context.rows.indexOf(firstSkeleton)
      };
    }
  }

  // ... rest of parsing logic
}
```

### Handling fill_skeleton

```typescript
// In HomeScreen
if (decision.kind === 'fill_skeleton') {
  setRows(rows.map((row, idx) => {
    if (idx === decision.targetRowIndex) {
      return {
        ...row,
        weightLbs: decision.weight,
        reps: decision.reps || row.reps,
        isSkeleton: false  // No longer a skeleton
      };
    }
    return row;
  }));
}
```

---

## UI Components

### RoutineModal

Quick template selection during workout:

```typescript
<RoutineModal
  visible={showRoutine}
  onClose={() => setShowRoutine(false)}
  onSelectTemplate={(template) => {
    const items = await fetchTemplateItems(template.id);
    const rows = expandTemplateToRows(items);
    setRows(rows);
    setShowRoutine(false);
  }}
/>
```

### WorkoutNameModal

Template selection on workout start:

```typescript
<WorkoutNameModal
  visible={showNameModal}
  templates={templates}
  onSubmit={(name, bodyParts, template) => {
    if (template) {
      const items = await fetchTemplateItems(template.id);
      const rows = expandTemplateToRows(items);
      startWorkoutSession(name, bodyParts, rows);
    } else {
      startWorkoutSession(name, bodyParts);
    }
  }}
/>
```

---

## Implementing Changes

### Adding template metadata

1. **Update type:**
```typescript
interface WorkoutTemplate {
  // ... existing fields
  estimated_duration: number;  // New field
}
```

2. **Update database:**
Add column to `workout_templates` table.

3. **Update CRUD:**
Include in fetch/create/update functions.

### Creating template from workout

```typescript
const createTemplateFromWorkout = async (session: WorkoutSession) => {
  // Create template
  const template = await createWorkoutTemplate(
    userId,
    session.title,
    `Created from ${session.dateISO}`
  );

  // Add items from rows
  const exercises = groupBy(session.rows, 'exercise');

  for (const [exercise, rows] of Object.entries(exercises)) {
    await addTemplateItem(template.id, {
      lift_name: exercise,
      target_sets: rows.length,
      target_reps: parseInt(rows[0].reps) || 0,
      target_weight: parseInt(rows[0].weightLbs) || 0,
      display_order: 0,
      notes: ''
    });
  }
};
```

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - Template usage in flow
- [04-parsing.md](./04-parsing.md) - Skeleton filling
- [11-settings.md](./11-settings.md) - Template management UI
