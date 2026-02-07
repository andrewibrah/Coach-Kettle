# Theming

## Modes
- `light` — Light background, dark text
- `dark` — Dark background, light text
- `system` — Follow device setting

## Files
| File | Purpose |
|------|---------|
| `constants/theme.ts` | Color definitions |
| `components/ThemeProvider.tsx` | Theme context |
| `hooks/use-theme-color.ts` | Get themed colors |

## Colors

```typescript
// constants/theme.ts
export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#0a7ea4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0a7ea4',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#fff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#fff',
  },
};
```

## useThemeColor

```typescript
import { useThemeColor } from '@/hooks/use-theme-color';

const bg = useThemeColor({}, 'background');
const text = useThemeColor({}, 'text');
const tint = useThemeColor({}, 'tint');

// With overrides
const color = useThemeColor(
  { light: '#000', dark: '#fff' },
  'text'
);
```

## ThemeProvider

```typescript
const { theme, setTheme } = useTheme();

// Change theme
setTheme('dark');
setTheme('light');
setTheme('system');
```

Persists to AsyncStorage key `theme_preference`.

## Using in Components

```typescript
import { ThemedView, ThemedText } from '@/components/ui';

<ThemedView>
  <ThemedText type="title">Hello</ThemedText>
</ThemedView>
```

## Adding New Color
1. Add to both `light` and `dark` in `constants/theme.ts`
2. Use via `useThemeColor({}, 'newColor')`
