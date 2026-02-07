# Components

## Structure
```
components/
├── ui/           # Generic UI
├── workout/      # Workout-specific
├── modals/       # Dialogs
├── onboarding/   # Quiz components
├── celebration/  # PR confetti
└── *Provider.tsx # Context providers
```

## UI Components

| Component | File | Purpose |
|-----------|------|---------|
| ThemedText | `ui/themed-text.tsx` | Theme-aware text |
| ThemedView | `ui/themed-view.tsx` | Theme-aware container |
| Header | `ui/Header.tsx` | Top bar with menu/actions |
| IconSymbol | `ui/icon-symbol.tsx` | SF Symbols / Material icons |

### Usage
```typescript
import { ThemedText, ThemedView } from '@/components/ui';

<ThemedView>
  <ThemedText type="title">Hello</ThemedText>
</ThemedView>
```

## Workout Components

| Component | Purpose |
|-----------|---------|
| `WorkoutTable` | Display rows with swipe actions |
| `WorkoutCard` | Single row display |
| `WorkoutBottomBar` | Input bar + action buttons |

## Creating Components

```typescript
// components/ui/MyComponent.tsx
import { ThemedView, ThemedText } from '@/components/ui';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = { title: string };

export function MyComponent({ title }: Props) {
  const bg = useThemeColor({}, 'background');

  return (
    <ThemedView style={{ backgroundColor: bg }}>
      <ThemedText>{title}</ThemedText>
    </ThemedView>
  );
}
```

## Rules
- Use `@/` imports
- Use `useThemeColor()` for colors
- Use `ThemedText/View` for consistency
- Keep components focused and small
