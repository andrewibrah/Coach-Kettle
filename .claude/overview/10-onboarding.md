# Onboarding Flow

> New user setup wizard.

---

## Overview

New users go through a 10-step onboarding flow to set up their profile before accessing the main app. All answers are saved in a single batch API call on the complete screen.

**Redirect Logic:** Tab layout redirects to `/onboarding` if `isOnboardingComplete === false`.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/onboarding/*.tsx` | Onboarding screens |
| `components/onboarding/*.tsx` | Quiz UI components |
| `lib/profile.ts` | Profile API |
| `contexts/ProfileContext.tsx` | Profile state |
| `lib/onboardingDraft.ts` | Local draft backup |

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
            │ batch save + done │
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

Each onboarding screen stores answers in local state (ProfileContext) without making API calls. Navigation between steps only updates local state:

```typescript
import { useProfile } from '@/contexts/ProfileContext';

function AgeScreen() {
  const { profile, updateProfile } = useProfile();
  const router = useRouter();

  const handleNext = async () => {
    await updateProfile({
      dob: selectedDate,
      onboarding_step: 3  // Move to next step (local state only)
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

**Location:** `app/onboarding/complete.tsx`

The complete screen gathers all accumulated profile data from ProfileContext and submits everything in a single batch API call:

```typescript
// app/onboarding/complete.tsx
import { completeOnboarding } from '@/lib/profile';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';

function CompleteScreen() {
  const { session } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const router = useRouter();

  const handleComplete = async () => {
    // Batch save: profile data + PR lifts + PR values in one call
    await completeOnboarding(session.user.id, {
      ...profile,             // All accumulated onboarding answers
      onboarding_completed: true,
      onboarding_step: 10,
    });
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

## Batch Onboarding Save

As of v1.0.0, onboarding uses a **single batch API call** on the complete screen instead of saving each step individually.

### How it works
1. Each onboarding screen stores answers in local state (ProfileContext)
2. On the complete screen, ALL profile data + PR lifts + PR values are submitted in one API call
3. A local draft backup (`lib/onboardingDraft.ts`) saves answers before submission
4. On failure, the draft can be restored and retried

### Benefits
- Faster onboarding (no API latency between steps)
- Atomic save (all-or-nothing)
- Offline-friendly (answers stored locally until submit)
- Draft backup prevents data loss on crash

### Known Fix
Previous versions had a bug where skipping onboarding could leave users in a redirect loop. This was fixed by ensuring `onboarding_completed: true` is always set even on skip.

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
