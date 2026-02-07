# Modals

## Location
`components/modals/`

## Available Modals

| Modal | Purpose | Trigger |
|-------|---------|---------|
| `EditSetModal` | Edit exercise/weight/reps | Tap row |
| `WorkoutNameModal` | Name workout, select template | Start workout |
| `RoutineModal` | Browse templates | Menu |
| `SessionReviewModal` | AI workout summary | End workout |
| `CoachModal` | AI Q&A | Menu → Coach |
| `MenuModal` | Main menu | Header menu button |
| `DeleteWorkoutModal` | Confirm delete | Swipe delete |

## Usage Pattern

```typescript
const [visible, setVisible] = useState(false);

<MyModal
  visible={visible}
  onClose={() => setVisible(false)}
  onConfirm={handleConfirm}
/>
```

## EditSetModal

```typescript
<EditSetModal
  visible={editModalVisible}
  row={selectedRow}
  onClose={() => setEditModalVisible(false)}
  onSave={(updated) => {
    setRows(rows.map(r => r.id === updated.id ? updated : r));
  }}
/>
```

## CoachModal

```typescript
const { coachOpen, closeCoach, submitCoachQuestion } = useCoachLogic(rows);

<CoachModal
  visible={coachOpen}
  onClose={closeCoach}
  onSubmit={submitCoachQuestion}
/>
```

## Creating Modals

```typescript
// components/modals/MyModal.tsx
import { Modal, View } from 'react-native';
import { ThemedView, ThemedText } from '@/components/ui';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function MyModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <ThemedView style={styles.container}>
        <ThemedText>Content</ThemedText>
        <Button title="Close" onPress={onClose} />
      </ThemedView>
    </Modal>
  );
}
```
