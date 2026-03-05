# UI Components

> Reusable UI building blocks.

---

## Component Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Core Providers | `components/*.tsx` | Auth, Theme, Lock |
| UI Primitives | `components/ui/` | Basic themed components |
| Workout | `components/workout/` | Workout-specific UI |
| Modals | `components/modals/` | Dialog overlays |
| Onboarding | `components/onboarding/` | Quiz components |
| Celebration | `components/celebration/` | PR celebration |
| Media | `components/media/` | Photo/video picker, reflection input |

---

## UI Primitives (`components/ui/`)

### ThemedText
Theme-aware text with typography variants.

```typescript
// components/ui/themed-text.tsx
import { ThemedText } from '@/components/ui/themed-text';

<ThemedText type="title">Welcome</ThemedText>
<ThemedText type="subtitle">Your workout</ThemedText>
<ThemedText type="default">Regular text</ThemedText>
<ThemedText type="link">Tap here</ThemedText>
```

**Props:**
- `type`: `'default' | 'title' | 'subtitle' | 'link'`
- `lightColor`, `darkColor`: Override theme colors
- All standard Text props

---

### ThemedView
Theme-aware container.

```typescript
// components/ui/themed-view.tsx
import { ThemedView } from '@/components/ui/themed-view';

<ThemedView style={styles.container}>
  {children}
</ThemedView>
```

**Props:**
- `lightColor`, `darkColor`: Override theme colors
- All standard View props

---

### Header
Main app header with menu, clear, routine buttons.

```typescript
// components/ui/Header.tsx
import Header from '@/components/ui/Header';

<Header
  onMenuPress={() => setMenuOpen(true)}
  onClearPress={handleClear}
  onRoutinePress={() => setRoutineOpen(true)}
  showClear={rows.length > 0}
  workoutActive={workoutActive}
/>
```

**Props:**
- `onMenuPress`: Menu button handler
- `onClearPress`: Clear button handler
- `onRoutinePress`: Routine button handler
- `showClear`: Show clear button
- `workoutActive`: Is workout in progress

---

### ScreenHeader
Standard screen header with back button.

```typescript
// components/ui/screen-header.tsx
import { ScreenHeader } from '@/components/ui/screen-header';

<ScreenHeader title="Settings" />
<ScreenHeader title="Profile" onBack={customBackHandler} />
```

**Props:**
- `title`: Header text
- `onBack`: Optional custom back handler

---

### IconSymbol
SF Symbols / Material icons wrapper.

```typescript
// components/ui/icon-symbol.tsx
import { IconSymbol } from '@/components/ui/icon-symbol';

<IconSymbol name="checkmark.circle" size={24} color={tintColor} />
<IconSymbol name="trash" size={20} color="red" />
```

**Props:**
- `name`: Icon name (SF Symbol or Material)
- `size`: Icon size
- `color`: Icon color

---

### E1RMInfoTooltip
Estimated 1RM explanation tooltip.

```typescript
// components/ui/E1RMInfoTooltip.tsx
import { E1RMInfoTooltip } from '@/components/ui/E1RMInfoTooltip';

<E1RMInfoTooltip e1rm={225} weight={185} reps={8} />
```

---

### AiResponseBubble
Styled AI response display.

```typescript
// components/ui/AiResponseBubble.tsx
import { AiResponseBubble } from '@/components/ui/AiResponseBubble';

<AiResponseBubble message={aiResponse} />
```

---

## Workout Components (`components/workout/`)

### WorkoutTable
Main workout row display with swipe actions.

**Note:** Now uses FlatList instead of DraggableFlatList (drag disabled due to gesture conflicts with swipe-right menu).

```typescript
// components/workout/WorkoutTable.tsx
import WorkoutTable from '@/components/workout/WorkoutTable';

<WorkoutTable
  rows={rows}
  onRowPress={(row) => openEditModal(row)}
  onDeleteRow={(id) => deleteRow(id)}
  onDuplicateRow={(id) => duplicateRow(id)}
  editingCell={editingCell}
  onCellChange={handleCellChange}
/>
```

**Props:**
- `rows`: `LogRow[]` to display
- `onRowPress`: Row tap handler
- `onDeleteRow`: Swipe delete handler
- `onDuplicateRow`: Swipe duplicate handler
- `editingCell`: Currently editing cell
- `onCellChange`: Cell edit handler

**Features:**
- Swipe left to delete
- Swipe right to duplicate
- Tap to edit
- Inline cell editing
- Grouped by exercise

---

### WorkoutCard
Individual set card within table.

**Note:** Now uses flex-wrap layout to display cardio metrics (duration, distance, HR, calories, level) alongside standard weight/reps.

```typescript
// components/workout/WorkoutCard.tsx
import WorkoutCard from '@/components/workout/WorkoutCard';

<WorkoutCard
  row={row}
  onPress={() => openEditModal(row)}
  isEditing={editingCell?.rowId === row.id}
  editValue={editValue}
  onEditChange={setEditValue}
/>
```

---

### WorkoutBottomBar
Input bar for logging sets.

```typescript
// components/workout/WorkoutBottomBar.tsx
import WorkoutBottomBar from '@/components/workout/WorkoutBottomBar';

<WorkoutBottomBar
  value={messageInput}
  onChangeText={setMessageInput}
  onSubmit={handleSubmit}
  onEndWorkout={handleEndWorkout}
  loading={loading}
  workoutActive={workoutActive}
/>
```

**Props:**
- `value`: Input text
- `onChangeText`: Input change handler
- `onSubmit`: Submit button handler
- `onEndWorkout`: End workout handler
- `loading`: Disable during API call
- `workoutActive`: Show end button

---

## Media Components (`components/media/`)

### MediaPickerBubble
Horizontal scrolling thumbnail gallery with an add button for attaching gym photos/videos.

**Location:** `components/media/MediaPickerBubble.tsx`

```typescript
import { MediaPickerBubble } from '@/components/media/MediaPickerBubble';

<MediaPickerBubble
  media={selectedMedia}           // Array of local/remote media items
  onPickMedia={handlePickMedia}   // Opens device image picker
  onRemoveMedia={handleRemove}    // Remove a selected item
  maxItems={10}                   // Max 10 files per workout
/>
```

**Features:**
- Horizontal thumbnail scroll
- "+" button to add more
- Tap to preview
- Swipe/tap to remove
- Shows both local picks and remote URLs
- Image and video support

---

### ReflectionInput
Multiline text card for personal session notes/reflection.

**Location:** `components/media/ReflectionInput.tsx`

```typescript
import { ReflectionInput } from '@/components/media/ReflectionInput';

<ReflectionInput
  value={reflection}
  onChangeText={setReflection}
  maxLength={2000}
  placeholder="How did this session feel?"
/>
```

**Features:**
- Themed card styling
- 2000 character limit
- Character count display
- Multiline with auto-grow

---

## Creating New Components

### Basic themed component

```typescript
// components/ui/MyComponent.tsx
import { View, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ThemedText } from './themed-text';

interface MyComponentProps {
  title: string;
  onPress?: () => void;
}

export function MyComponent({ title, onPress }: MyComponentProps) {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ThemedText>{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 8,
  },
});
```

### Component with state

```typescript
// components/workout/MyWorkoutComponent.tsx
import { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';

interface Props {
  initialValue: string;
  onChange: (value: string) => void;
}

export function MyWorkoutComponent({ initialValue, onChange }: Props) {
  const [value, setValue] = useState(initialValue);

  const handlePress = () => {
    const newValue = // ... transform
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity onPress={handlePress}>
        <ThemedText>{value}</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}
```

---

## Component Patterns

### Loading states
```typescript
{loading ? (
  <ActivityIndicator size="small" color={tintColor} />
) : (
  <ThemedText>{content}</ThemedText>
)}
```

### Error states
```typescript
{error ? (
  <ThemedText style={{ color: 'red' }}>{error.message}</ThemedText>
) : (
  <Content />
)}
```

### Empty states
```typescript
{items.length === 0 ? (
  <ThemedText type="subtitle">No items yet</ThemedText>
) : (
  items.map(item => <Item key={item.id} {...item} />)
)}
```

---

## Related Docs
- [09-modals.md](./09-modals.md) - Modal components
- [14-theming.md](./14-theming.md) - Theme system
