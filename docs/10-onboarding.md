# Onboarding

## Flow
10-step wizard for new users. Redirected from tab layout if `isOnboardingComplete === false`.

## Screens
```
/onboarding
├── index.tsx       → Welcome
├── age.tsx         → DOB
├── height.tsx      → Height
├── current-weight.tsx → Current weight
├── goal-weight.tsx → Goal weight
├── focus.tsx       → Fitness focus
├── pr-lifts.tsx    → Which lifts to track
├── pr-values.tsx   → Current PR values
├── workout-setup.tsx → Confirm
└── complete.tsx    → Done → main app
```

## Components
`components/onboarding/`
- `QuizContainer` — Wrapper
- `QuizQuestion` — Question text
- `QuizInput` — Text/number input
- `QuizButtons` — Back/Next buttons
- `QuizProgress` — Progress bar
- `QuizOptionList` — Multi-select
- `QuizLiftList` — Lift selection

## Profile Context

```typescript
const { profile, updateProfile, isOnboardingComplete } = useProfile();

// Update profile and advance step
await updateProfile({
  dob: selectedDate,
  onboarding_step: 3
});
router.push('/onboarding/height');
```

## Complete Onboarding

```typescript
// app/onboarding/complete.tsx
import { completeOnboarding } from '@/lib/profile';

const handleComplete = async () => {
  await completeOnboarding(session.user.id);
  await refreshProfile();
  router.replace('/(tabs)');
};
```

## Adding a Step
1. Create screen in `app/onboarding/`
2. Update profile with new field + `onboarding_step`
3. Update navigation in adjacent screens
