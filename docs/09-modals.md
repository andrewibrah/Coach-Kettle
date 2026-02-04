# Modal System

> Overlay dialogs for secondary interactions.

---

## Modal Components

| Modal | File | Purpose |
|-------|------|---------|
| EditSetModal | `components/modals/EditSetModal.tsx` | Edit exercise/weight/reps |
| WorkoutNameModal | `components/modals/WorkoutNameModal.tsx` | Name workout on start |
| RoutineModal | `components/modals/RoutineModal.tsx` | Select workout template |
| SessionReviewModal | `components/modals/SessionReviewModal.tsx` | AI session feedback |
| CoachModal | `components/modals/CoachModal.tsx` | AI coach Q&A |
| MenuModal | `components/modals/MenuModal.tsx` | Main menu |
| DeleteWorkoutModal | `components/modals/DeleteWorkoutModal.tsx` | Confirm deletion |

---

## EditSetModal

Edit an individual workout set.

**Location:** `components/modals/EditSetModal.tsx`

```typescript
import EditSetModal from '@/components/modals/EditSetModal';

const [editRow, setEditRow] = useState<LogRow | null>(null);

<EditSetModal
  visible={!!editRow}
  row={editRow}
  onClose={() => setEditRow(null)}
  onSave={(updatedRow) => {
    updateRow(updatedRow);
    setEditRow(null);
  }}
  onDelete={(rowId) => {
    deleteRow(rowId);
    setEditRow(null);
  }}
/>
```

**Features:**
- Exercise name input
- Weight input (numeric keyboard)
- Reps input (numeric keyboard)
- Notes input
- Delete button
- Save/Cancel buttons

---

## WorkoutNameModal

Shown when starting a workout to set name and optionally load a template.

**Location:** `components/modals/WorkoutNameModal.tsx`

```typescript
import WorkoutNameModal from '@/components/modals/WorkoutNameModal';

<WorkoutNameModal
  visible={showNameModal}
  onClose={() => setShowNameModal(false)}
  onSubmit={(name, bodyParts, template) => {
    if (template) {
      const rows = expandTemplateToRows(template.items);
      startWorkoutSession(name, bodyParts, rows);
    } else {
      startWorkoutSession(name, bodyParts);
    }
    setShowNameModal(false);
  }}
  templates={templates}
/>
```

**Features:**
- Workout name input
- Body part selection (multi-select)
- Template selection (optional)
- Start button

---

## RoutineModal

Browse and select from saved workout templates.

**Location:** `components/modals/RoutineModal.tsx`

```typescript
import RoutineModal from '@/components/modals/RoutineModal';

<RoutineModal
  visible={showRoutine}
  onClose={() => setShowRoutine(false)}
  onSelectTemplate={(template) => {
    const rows = expandTemplateToRows(template.items);
    setRows(rows);
    setShowRoutine(false);
  }}
/>
```

**Features:**
- List of saved templates
- Template preview (exercises)
- Create new template link
- Select to load

---

## SessionReviewModal

Displays AI-generated workout feedback after ending a workout.

**Location:** `components/modals/SessionReviewModal.tsx`

```typescript
import SessionReviewModal from '@/components/modals/SessionReviewModal';

<SessionReviewModal
  visible={showReview}
  review={sessionReview}
  onClose={() => setShowReview(false)}
  onSave={async () => {
    // Save review with workout
    await updateWorkoutWithReview(workoutId, sessionReview);
    setShowReview(false);
  }}
/>
```

**Review Content:**
```typescript
interface SessionReview {
  summary: string;       // Overall assessment
  highlights: string[];  // Good things
  suggestions: string[]; // Improvements
}
```

---

## CoachModal

Interactive AI coach for workout questions.

**Location:** `components/modals/CoachModal.tsx`

```typescript
import CoachModal from '@/components/modals/CoachModal';

const { coachOpen, coachAnswer, coachLoading, ... } = useCoachLogic();

<CoachModal
  visible={coachOpen}
  answer={coachAnswer}
  loading={coachLoading}
  onClose={closeCoach}
  onSubmit={(question) => submitCoachQuestion(question, rows)}
/>
```

**Features:**
- Question input
- Streaming AI response
- Loading state
- Chat-like interface

---

## MenuModal

Main app menu for navigation.

**Location:** `components/modals/MenuModal.tsx`

```typescript
import MenuModal from '@/components/modals/MenuModal';

<MenuModal
  visible={menuOpen}
  onClose={() => setMenuOpen(false)}
  onNavigate={(route) => {
    setMenuOpen(false);
    router.push(route);
  }}
/>
```

**Menu Items:**
- History
- Chats
- Settings
- Templates
- Coach

---

## DeleteWorkoutModal

Confirmation dialog for workout deletion.

**Location:** `components/modals/DeleteWorkoutModal.tsx`

```typescript
import DeleteWorkoutModal from '@/components/modals/DeleteWorkoutModal';

<DeleteWorkoutModal
  visible={showDeleteConfirm}
  workoutTitle={selectedWorkout?.title}
  onClose={() => setShowDeleteConfirm(false)}
  onConfirm={async () => {
    await deleteWorkout(selectedWorkout.id);
    setShowDeleteConfirm(false);
  }}
/>
```

---

## Modal Pattern

All modals follow a consistent pattern:

```typescript
// components/modals/MyModal.tsx
import { Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Modal-specific props
}

export default function MyModal({ visible, onClose, ...props }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="title">Modal Title</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <ThemedText>Close</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Modal content */}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose}>
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit}>
              <ThemedText>Save</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end', // or 'center'
  },
  content: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  body: {
    // Body styles
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});
```

---

## Creating a New Modal

1. **Create modal component:**
```typescript
// components/modals/MyNewModal.tsx
export default function MyNewModal({ visible, onClose, data, onSubmit }) {
  // ... modal implementation
}
```

2. **Add state in parent:**
```typescript
const [showMyModal, setShowMyModal] = useState(false);
const [modalData, setModalData] = useState(null);
```

3. **Wire up trigger:**
```typescript
<Button onPress={() => {
  setModalData(someData);
  setShowMyModal(true);
}} />
```

4. **Render modal:**
```typescript
<MyNewModal
  visible={showMyModal}
  data={modalData}
  onClose={() => setShowMyModal(false)}
  onSubmit={(result) => {
    handleResult(result);
    setShowMyModal(false);
  }}
/>
```

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - Modal usage in flow
- [07-components.md](./07-components.md) - UI components
