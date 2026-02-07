# Settings

## Screens
```
/settings
├── index.tsx        → Settings home
├── profile.tsx      → Edit profile
├── pr-tracking.tsx  → Manage tracked lifts
└── templates.tsx    → Workout templates
```

## Settings Home
Menu with links to sub-screens + sign out.

## Profile Screen
Edit: height, DOB, weight, goal weight, focus.

```typescript
// app/settings/profile.tsx
const { profile, updateProfile } = useProfile();

const handleSave = async () => {
  await updateProfile({
    height_value: height,
    current_weight: weight,
    focus: selectedFocus
  });
};
```

## PR Tracking Screen
Add/remove tracked lifts.

```typescript
// Functions from lib/profile.ts
fetchTrackedLifts(userId)
addTrackedLift(userId, lift)
removeTrackedLift(userId, lift)
```

## Templates Screen
CRUD for workout templates.

```typescript
// lib/profile.ts
fetchWorkoutTemplates(userId)
createWorkoutTemplate(userId, name, description)
deleteWorkoutTemplate(templateId)
addTemplateItem(templateId, item)
removeTemplateItem(itemId)
```

## Adding Settings Screen
1. Create `app/settings/my-screen.tsx`
2. Add link in `app/settings/index.tsx`
3. Use `useProfile()` or create new lib functions
