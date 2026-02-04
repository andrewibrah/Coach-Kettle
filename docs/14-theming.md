# Theme System

> Light, dark, and system theme support.

---

## Overview

The app supports three theme modes:
- **Light** - Light background, dark text
- **Dark** - Dark background, light text
- **System** - Follows device setting

Theme preference persists to AsyncStorage.

---

## Key Files

| File | Purpose |
|------|---------|
| `components/ThemeProvider.tsx` | Theme context |
| `constants/theme.ts` | Color definitions |
| `hooks/use-theme-color.ts` | Theme-aware colors |
| `hooks/use-color-scheme.ts` | System scheme |

---

## ThemeProvider

**Location:** `components/ThemeProvider.tsx`

```typescript
interface ThemeContextValue {
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';  // Resolved value
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
}
```

### Implementation

```typescript
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    const load = async () => {
      const saved = await AsyncStorage.getItem('theme_preference');
      if (saved) setThemeState(saved as any);
      setLoaded(true);
    };
    load();
  }, []);

  // Compute effective theme
  const effectiveTheme = theme === 'system' ? systemScheme : theme;

  const setTheme = async (newTheme: 'light' | 'dark' | 'system') => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('theme_preference', newTheme);
  };

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be within ThemeProvider');
  return context;
}
```

---

## Color Definitions

**Location:** `constants/theme.ts`

```typescript
export const Colors = {
  light: {
    text: '#11181C',
    background: '#FFFFFF',
    tint: '#0A7EA4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0A7EA4',
    border: '#E6E6E6',
    card: '#F5F5F5',
    error: '#DC2626',
    success: '#16A34A',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#4DA6FF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#4DA6FF',
    border: '#2D2D2D',
    card: '#1E1E1E',
    error: '#EF4444',
    success: '#22C55E',
  },
};
```

---

## useThemeColor Hook

**Location:** `hooks/use-theme-color.ts`

Get theme-aware color values:

```typescript
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light
) {
  const { effectiveTheme } = useTheme();

  const colorFromProps = props[effectiveTheme];

  if (colorFromProps) {
    return colorFromProps;
  }

  return Colors[effectiveTheme][colorName];
}
```

### Usage

```typescript
// Get theme color
const backgroundColor = useThemeColor({}, 'background');
const textColor = useThemeColor({}, 'text');
const tintColor = useThemeColor({}, 'tint');

// With overrides
const customColor = useThemeColor(
  { light: '#FF0000', dark: '#00FF00' },
  'tint'  // Fallback
);
```

---

## Themed Components

### ThemedText

```typescript
// components/ui/themed-text.tsx
import { Text, TextProps, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

interface ThemedTextProps extends TextProps {
  type?: 'default' | 'title' | 'subtitle' | 'link';
  lightColor?: string;
  darkColor?: string;
}

export function ThemedText({
  style,
  type = 'default',
  lightColor,
  darkColor,
  ...props
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        styles[type],
        style
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  default: { fontSize: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 18, fontWeight: '600' },
  link: { fontSize: 16, color: '#0A7EA4' },
});
```

### ThemedView

```typescript
// components/ui/themed-view.tsx
import { View, ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

interface ThemedViewProps extends ViewProps {
  lightColor?: string;
  darkColor?: string;
}

export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...props
}: ThemedViewProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    'background'
  );

  return <View style={[{ backgroundColor }, style]} {...props} />;
}
```

---

## Navigation Theme

React Navigation theme is synced with app theme:

```typescript
// app/_layout.tsx
import { ThemeProvider as NavigationThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';

function RootLayout() {
  const { effectiveTheme } = useTheme();

  const navigationTheme = effectiveTheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack />
    </NavigationThemeProvider>
  );
}
```

---

## Theme Switcher

Example settings toggle:

```typescript
function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <View>
      <TouchableOpacity onPress={() => setTheme('light')}>
        <ThemedText>Light {theme === 'light' && '✓'}</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setTheme('dark')}>
        <ThemedText>Dark {theme === 'dark' && '✓'}</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setTheme('system')}>
        <ThemedText>System {theme === 'system' && '✓'}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}
```

---

## Implementing Changes

### Adding a new color

1. **Add to constants:**
```typescript
// constants/theme.ts
export const Colors = {
  light: {
    // ... existing
    newColor: '#123456',
  },
  dark: {
    // ... existing
    newColor: '#654321',
  },
};
```

2. **Use in component:**
```typescript
const newColor = useThemeColor({}, 'newColor');
```

### Creating themed component

```typescript
// components/ui/themed-card.tsx
import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

export function ThemedCard({ style, children, ...props }: ViewProps) {
  const backgroundColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor, borderColor },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});
```

### Conditional styling

```typescript
function MyComponent() {
  const { effectiveTheme } = useTheme();

  return (
    <View style={[
      styles.base,
      effectiveTheme === 'dark' && styles.darkMode
    ]}>
      {/* content */}
    </View>
  );
}
```

---

## Best Practices

1. **Always use `useThemeColor`** for colors that should adapt
2. **Use `effectiveTheme`** when you need the resolved theme
3. **Don't hardcode colors** in component styles
4. **Test both themes** when making UI changes
5. **Use semantic color names** like 'card', 'border', not 'gray'

---

## Related Docs
- [02-providers.md](./02-providers.md) - ThemeProvider in hierarchy
- [07-components.md](./07-components.md) - Themed components
