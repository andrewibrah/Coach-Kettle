# Settings Screens

> User preferences and profile management.

---

## Overview

Settings screens allow users to edit their profile, manage PR tracking, and configure workout templates after onboarding.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/settings/index.tsx` | Settings home |
| `app/settings/profile.tsx` | Edit profile |
| `app/settings/pr-tracking.tsx` | Manage tracked lifts |
| `app/settings/templates.tsx` | Manage templates |
| `app/settings/_layout.tsx` | Settings stack |

---

## Settings Home

**Location:** `app/settings/index.tsx`

Main settings menu with navigation to sub-sections.

```
┌─────────────────────────────┐
│         Settings            │
├─────────────────────────────┤
│  👤 Profile                 │ → Edit profile data
│  🏋️ PR Tracking            │ → Manage tracked lifts
│  📋 Workout Templates       │ → Create/edit templates
├─────────────────────────────┤
│  🔐 Biometric Unlock        │ [Toggle]
│  🌙 Dark Mode               │ [light/dark/system]
├─────────────────────────────┤
│  📄 Terms of Service        │
│  🚪 Sign Out                │
└─────────────────────────────┘
```

---

## Profile Screen

**Location:** `app/settings/profile.tsx`

Edit user profile data.

### Editable Fields

| Field | Type | Notes |
|-------|------|-------|
| Height | Number + Unit | ft/in or cm |
| Date of Birth | Date | Date picker |
| Current Weight | Number + Unit | lbs or kg |
| Goal Weight | Number + Unit | lbs or kg |
| Focus | Select | Fitness goal |
| AI Context | Text | Custom AI context |

### Implementation

```typescript
import { useProfile } from '@/contexts/ProfileContext';
import { updateProfile } from '@/lib/profile';

function ProfileScreen() {
  const { profile, refreshProfile } = useProfile();
  const [height, setHeight] = useState(profile?.height_value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(profile.user_id, {
        height_value: height,
        height_unit: heightUnit,
        // ... other fields
      });
      await refreshProfile();
      Alert.alert('Success', 'Profile updated');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenHeader title="Profile" />
    <ScrollView>
      <InputField label="Height" value={height} onChange={setHeight} />
      {/* ... other fields */}
      <Button title="Save" onPress={handleSave} loading={saving} />
    </ScrollView>
  );
}
```

---

## PR Tracking Screen

**Location:** `app/settings/pr-tracking.tsx`

Manage which lifts are tracked for PRs.

### Features

- View currently tracked lifts
- Add new lifts to track
- Remove lifts from tracking
- View current PR values

### Implementation

```typescript
import { fetchTrackedLifts, addTrackedLift, removeTrackedLift } from '@/lib/profile';

function PRTrackingScreen() {
  const [lifts, setLifts] = useState<TrackedLift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLifts();
  }, []);

  const loadLifts = async () => {
    const data = await fetchTrackedLifts(userId);
    setLifts(data);
    setLoading(false);
  };

  const handleAddLift = async (liftName: string) => {
    await addTrackedLift(userId, liftName);
    await loadLifts();
  };

  const handleRemoveLift = async (liftId: string) => {
    await removeTrackedLift(liftId);
    await loadLifts();
  };

  return (
    <>
      <ScreenHeader title="PR Tracking" />
      <FlatList
        data={lifts}
        renderItem={({ item }) => (
          <LiftRow
            lift={item}
            onRemove={() => handleRemoveLift(item.id)}
          />
        )}
      />
      <AddLiftButton onAdd={handleAddLift} />
    </>
  );
}
```

---

## Templates Screen

**Location:** `app/settings/templates.tsx`

Create, edit, and delete workout templates.

### Template Structure

```typescript
interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

interface WorkoutTemplateItem {
  id: string;
  template_id: string;
  lift_name: string;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  display_order: number;
  notes: string;
}
```

### Features

- List all templates
- Create new template
- Edit template name/description
- Add/remove exercises
- Reorder exercises
- Delete template

### Implementation

```typescript
import {
  fetchWorkoutTemplates,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  addTemplateItem,
  removeTemplateItem
} from '@/lib/profile';

function TemplatesScreen() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);

  const loadTemplates = async () => {
    const data = await fetchWorkoutTemplates(userId);
    setTemplates(data);
  };

  const handleCreateTemplate = async () => {
    const template = await createWorkoutTemplate(userId, 'New Template', '');
    router.push(`/settings/templates/${template.id}`);
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteWorkoutTemplate(id);
    await loadTemplates();
  };

  return (
    <>
      <ScreenHeader title="Workout Templates" />
      <FlatList
        data={templates}
        renderItem={({ item }) => (
          <TemplateCard
            template={item}
            onPress={() => router.push(`/settings/templates/${item.id}`)}
            onDelete={() => handleDeleteTemplate(item.id)}
          />
        )}
      />
      <FAB icon="plus" onPress={handleCreateTemplate} />
    </>
  );
}
```

---

## Settings Layout

**Location:** `app/settings/_layout.tsx`

Stack navigator for settings screens.

```typescript
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="pr-tracking" options={{ title: 'PR Tracking' }} />
      <Stack.Screen name="templates" options={{ title: 'Templates' }} />
    </Stack>
  );
}
```

---

## Navigation to Settings

From main menu:
```typescript
// components/modals/MenuModal.tsx
<TouchableOpacity onPress={() => {
  onClose();
  router.push('/settings');
}}>
  <ThemedText>Settings</ThemedText>
</TouchableOpacity>
```

---

## Implementing Changes

### Adding a new setting

1. **Add UI in settings home:**
```typescript
// app/settings/index.tsx
<SettingRow
  label="New Setting"
  value={settingValue}
  onPress={() => router.push('/settings/new-setting')}
/>
```

2. **Create setting screen:**
```typescript
// app/settings/new-setting.tsx
export default function NewSettingScreen() {
  // Setting implementation
}
```

3. **Add to stack:**
```typescript
// app/settings/_layout.tsx
<Stack.Screen name="new-setting" options={{ title: 'New Setting' }} />
```

### Adding a toggle setting

```typescript
// In settings/index.tsx
const [darkMode, setDarkMode] = useState(theme === 'dark');

<SettingToggle
  label="Dark Mode"
  value={darkMode}
  onToggle={async (value) => {
    setDarkMode(value);
    await setTheme(value ? 'dark' : 'light');
  }}
/>
```

---

## Related Docs
- [10-onboarding.md](./10-onboarding.md) - Initial profile setup
- [13-templates.md](./13-templates.md) - Template system details
- [12-pr-tracking.md](./12-pr-tracking.md) - PR system details
