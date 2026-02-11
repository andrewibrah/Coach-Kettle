# Onboarding Flow

> New user setup wizard.

---

## Overview

New users go through an 11-step onboarding flow to set up their profile before accessing the main app.

**Redirect Logic:** Tab layout redirects to `/onboarding` if `isOnboardingComplete === false`.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/onboarding/*.tsx` | Onboarding screens |
| `components/onboarding/*.tsx` | Quiz UI components |
| `lib/profile.ts` | Profile API |
| `contexts/ProfileContext.tsx` | Profile state |

---

## Onboarding Steps

| Step | Screen | Data Collected |
|------|--------|---------------|
| 1 | `/onboarding` | Welcome, get started |
| 2 | `/onboarding/age` | Date of birth |
| 3 | `/onboarding/height` | Height (ft/in or cm) |
| 4 | `/onboarding/current-weight` | Current weight |
| 5 | `/onboarding/goal-weight` | Goal weight |
| 6 | `/onboarding/focus` | Fitness focus |
| 7 | `/onboarding/pr-lifts` | Which lifts to track PRs |
| 8 | `/onboarding/pr-values` | Current PR values |
| 9 | `/onboarding/workout-setup` | Setup confirmation |
| 10 | `/onboarding/complete` | Completion screen |

---

## Flow Diagram

```
App Launch
    │
    ▼
Tab Layout checks isOnboardingComplete
    │
    ├── true → Main App
    │
    └── false → /onboarding
                    │
                    ▼
            ┌───────────────────┐
            │   Welcome Screen  │
            │   "Get Started"   │
            └─────────┬─────────┘
                      │
            ┌─────────┴─────────┐
            │   Profile Setup   │
            │ (age, height, etc)│
            └─────────┬─────────┘
                      │
            ┌─────────┴─────────┐
            │   PR Tracking     │
            │ (lifts, values)   │
            └─────────┬─────────┘
                      │
            ┌─────────┴─────────┐
            │   Complete        │
            │ completeOnboarding│
            └─────────┬─────────┘
                      │
                      ▼
                Main App
```

---

## Profile Context

**Location:** `contexts/ProfileContext.tsx`

```typescript
interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  isOnboardingComplete: boolean;
  currentOnboardingStep: number;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}
```

### Usage in Onboarding

```typescript
import { useProfile } from '@/contexts/ProfileContext';

function AgeScreen() {
  const { profile, updateProfile } = useProfile();
  const router = useRouter();

  const handleNext = async () => {
    await updateProfile({
      dob: selectedDate,
      onboarding_step: 3  // Move to next step
    });
    router.push('/onboarding/height');
  };

  return (
    <QuizContainer>
      <QuizQuestion text="What's your date of birth?" />
      <DatePicker value={selectedDate} onChange={setSelectedDate} />
      <QuizButtons onNext={handleNext} />
    </QuizContainer>
  );
}
```

---

## Onboarding Components

### QuizContainer
Wrapper with consistent styling.

```typescript
import { QuizContainer } from '@/components/onboarding';

<QuizContainer>
  {children}
</QuizContainer>
```

### QuizQuestion
Question display.

```typescript
<QuizQuestion text="What's your fitness goal?" />
```

### QuizInput
Text/number input.

```typescript
<QuizInput
  value={value}
  onChangeText={setValue}
  placeholder="Enter value"
  keyboardType="numeric"
/>
```

### QuizButtons
Navigation buttons.

```typescript
<QuizButtons
  onBack={() => router.back()}
  onNext={handleNext}
  nextDisabled={!isValid}
/>
```

### QuizProgress
Progress indicator.

```typescript
<QuizProgress current={3} total={10} />
```

### QuizOptionList
Multi-select options.

```typescript
<QuizOptionList
  options={['Build Muscle', 'Lose Fat', 'Get Stronger']}
  selected={selected}
  onToggle={(option) => toggleSelection(option)}
/>
```

### QuizLiftList
Lift selection for PR tracking.

```typescript
<QuizLiftList
  lifts={availableLifts}
  selected={selectedLifts}
  onToggle={(lift) => toggleLift(lift)}
/>
```

---

## Completing Onboarding

**Location:** `lib/profile.ts`

```typescript
export async function completeOnboarding(userId: string): Promise<void> {
  await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      onboarding_step: 10,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
}
```

### In Complete Screen

```typescript
// app/onboarding/complete.tsx
import { completeOnboarding } from '@/lib/profile';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';

function CompleteScreen() {
  const { session } = useAuth();
  const { refreshProfile } = useProfile();
  const router = useRouter();

  const handleComplete = async () => {
    await completeOnboarding(session.user.id);
    await refreshProfile();  // Updates isOnboardingComplete
    router.replace('/(tabs)');  // Go to main app
  };

  return (
    <QuizContainer>
      <ThemedText type="title">You're all set!</ThemedText>
      <Button title="Start Training" onPress={handleComplete} />
    </QuizContainer>
  );
}
```

---

## Resume Onboarding

If user closes app mid-onboarding, they resume from their last step:

```typescript
// app/onboarding/index.tsx
function OnboardingIndex() {
  const { currentOnboardingStep } = useProfile();
  const router = useRouter();

  useEffect(() => {
    // Resume from saved step
    if (currentOnboardingStep > 1) {
      const routes = [
        'age', 'height', 'current-weight', 'goal-weight',
        'focus', 'pr-lifts', 'pr-values', 'workout-setup', 'complete'
      ];
      const route = routes[currentOnboardingStep - 2];
      if (route) router.replace(`/onboarding/${route}`);
    }
  }, [currentOnboardingStep]);

  return <WelcomeScreen />;
}
```

---

## Implementing Changes

### Adding a new onboarding step

1. **Create screen:**
```typescript
// app/onboarding/new-step.tsx
export default function NewStep() {
  const { updateProfile } = useProfile();
  const router = useRouter();

  const handleNext = async () => {
    await updateProfile({
      new_field: value,
      onboarding_step: NEW_STEP_NUMBER + 1
    });
    router.push('/onboarding/next-step');
  };

  return (
    <QuizContainer>
      {/* Step content */}
    </QuizContainer>
  );
}
```

2. **Update step count:**
Edit `lib/profile.ts` to update total step count.

3. **Update navigation:**
Add to route sequence in relevant screens.

### Modifying existing step

Edit the corresponding file in `app/onboarding/`.

### Skipping steps

```typescript
const handleSkip = async () => {
  await updateProfile({
    onboarding_step: currentStep + 1
  });
  router.push('/onboarding/next-step');
};
```

---

## Related Docs
- [02-providers.md](./02-providers.md) - ProfileContext
- [11-settings.md](./11-settings.md) - Profile editing post-onboarding
