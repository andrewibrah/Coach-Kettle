# PR Tracking System

> Personal Record detection, storage, and celebration.

---

## Overview

The PR system tracks personal records for user-selected lifts, detects new PRs in real-time, and displays celebration animations.

**E1RM Formula:** Epley formula `weight × (1 + reps/30)`

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/prTracking.ts` | PR detection logic |
| `contexts/PRCelebrationContext.tsx` | Celebration state |
| `components/celebration/PRCelebration.tsx` | Celebration UI |
| `app/settings/pr-tracking.tsx` | Manage tracked lifts |
| `app/onboarding/pr-lifts.tsx` | Initial lift selection |
| `app/onboarding/pr-values.tsx` | Initial PR values |

---

## PR Detection Flow

```
User logs set: "Bench 185 x 8"
       │
       ▼
┌─────────────────────────────┐
│ checkForPR()                │
│ lib/prTracking.ts           │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────────┐
│ 1. Is "Bench" tracked?      │
│    → Check tracked_lifts    │
└───────────┬─────────────────┘
            │ yes
            ▼
┌─────────────────────────────┐
│ 2. Calculate new E1RM       │
│    185 × (1 + 8/30) = 234   │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────────┐
│ 3. Fetch current PR         │
│    → pr_history table       │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────────┐
│ 4. newE1RM > currentE1RM?   │
│    234 > 230? → YES!        │
└───────────┬─────────────────┘
            │ yes
            ▼
┌─────────────────────────────┐
│ 5. Insert new PR            │
│    → pr_history table       │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────────┐
│ 6. Supabase Realtime        │
│    triggers INSERT event    │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────────┐
│ 7. PRCelebration overlay    │
│    shows animation          │
└─────────────────────────────┘
```

---

## E1RM Calculation

**Location:** `lib/prTracking.ts`

```typescript
/**
 * Calculate Estimated 1 Rep Max using Epley formula
 */
export function calculateE1rm(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps <= 0 || weight <= 0) return 0;

  // Epley formula: weight × (1 + reps/30)
  return Math.round(weight * (1 + reps / 30));
}

// Examples:
// 185 lbs × 8 reps → 234 lbs E1RM
// 225 lbs × 5 reps → 263 lbs E1RM
// 315 lbs × 1 rep  → 315 lbs E1RM
```

---

## PR Check Functions

**Location:** `lib/prTracking.ts`

### Single Set Check

```typescript
export async function checkForPR(
  userId: string,
  exercise: string,
  weight: number,
  reps: number
): Promise<PRCheckResult | null> {
  // 1. Check if exercise is tracked
  const isTracked = await isLiftTracked(userId, exercise);
  if (!isTracked) return null;

  // 2. Calculate new E1RM
  const newE1rm = calculateE1rm(weight, reps);

  // 3. Get current PR
  const currentPR = await getCurrentPR(userId, exercise);
  const currentE1rm = currentPR?.e1rm || 0;

  // 4. Check if new PR
  if (newE1rm > currentE1rm) {
    // 5. Save new PR
    await savePR(userId, exercise, weight, reps, newE1rm);

    return {
      exercise,
      newE1rm,
      previousE1rm: currentE1rm,
      improvement: newE1rm - currentE1rm
    };
  }

  return null;
}
```

### Batch Check

```typescript
export async function checkBatchForPRs(
  userId: string,
  sets: Array<{ exercise: string; weight: number; reps: number }>
): Promise<PRCheckResult[]> {
  const results: PRCheckResult[] = [];

  for (const set of sets) {
    const pr = await checkForPR(userId, set.exercise, set.weight, set.reps);
    if (pr) results.push(pr);
  }

  return results;
}
```

---

## Realtime Subscription

**Location:** `lib/prTracking.ts`

Subscribe to PR breakthrough events:

```typescript
export function subscribeToPRBreakthroughs(
  userId: string,
  onPR: (pr: PRBreakthrough) => void
): () => void {
  const channel = supabase
    .channel('pr-breakthroughs')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pr_history',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        onPR(payload.new as PRBreakthrough);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}
```

### Usage in HomeScreen

```typescript
// app/(tabs)/index.tsx
import { subscribeToPRBreakthroughs } from '@/lib/prTracking';
import { usePRCelebration } from '@/contexts/PRCelebrationContext';

function HomeScreen() {
  const { showCelebration } = usePRCelebration();
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) return;

    const unsubscribe = subscribeToPRBreakthroughs(
      session.user.id,
      (pr) => {
        showCelebration({
          exercise: pr.exercise,
          newE1rm: pr.e1rm,
          previousE1rm: pr.previous_e1rm,
          improvement: pr.improvement
        });
      }
    );

    return unsubscribe;
  }, [session?.user?.id]);

  // ...
}
```

---

## PRCelebrationContext

**Location:** `contexts/PRCelebrationContext.tsx`

```typescript
interface PRCelebrationContextValue {
  showCelebration: (pr: PRBreakthrough) => void;
  currentCelebration: PRBreakthrough | null;
  dismissCelebration: () => void;
}

// Queue system for multiple PRs
const [celebrationQueue, setCelebrationQueue] = useState<PRBreakthrough[]>([]);
const [currentCelebration, setCurrentCelebration] = useState<PRBreakthrough | null>(null);

const showCelebration = (pr: PRBreakthrough) => {
  setCelebrationQueue(prev => [...prev, pr]);
};

// Process queue
useEffect(() => {
  if (!currentCelebration && celebrationQueue.length > 0) {
    const [next, ...rest] = celebrationQueue;
    setCurrentCelebration(next);
    setCelebrationQueue(rest);
  }
}, [currentCelebration, celebrationQueue]);

const dismissCelebration = () => {
  setCurrentCelebration(null);
};
```

---

## PRCelebration Component

**Location:** `components/celebration/PRCelebration.tsx`

Animated overlay with confetti.

```typescript
import ConfettiCannon from 'react-native-confetti-cannon';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

function PRCelebration({ pr, onDismiss }) {
  const confettiRef = useRef<ConfettiCannon>(null);

  useEffect(() => {
    // Fire confetti on mount
    confettiRef.current?.start();

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.overlay}>
      <ConfettiCannon ref={confettiRef} count={100} origin={{ x: -10, y: 0 }} />

      <Animated.View style={[styles.card, animatedStyle]}>
        <ThemedText type="title">NEW PR!</ThemedText>
        <ThemedText>{pr.exercise}</ThemedText>
        <ThemedText type="subtitle">{pr.newE1rm} lbs E1RM</ThemedText>
        <ThemedText>+{pr.improvement} lbs improvement!</ThemedText>
      </Animated.View>
    </View>
  );
}
```

---

## Database Schema

### tracked_lifts
```sql
CREATE TABLE tracked_lifts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  lift_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### pr_history
```sql
CREATE TABLE pr_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  exercise TEXT NOT NULL,
  weight NUMERIC NOT NULL,
  reps INTEGER NOT NULL,
  e1rm NUMERIC NOT NULL,
  previous_e1rm NUMERIC,
  improvement NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Implementing Changes

### Adding a new PR metric

1. **Update calculation:**
```typescript
// lib/prTracking.ts
export function calculateNewMetric(weight: number, reps: number): number {
  // New formula
}
```

2. **Update check logic:**
Add comparison for new metric in `checkForPR`.

3. **Update database:**
Add column to `pr_history` table.

### Customizing celebration

Edit `components/celebration/PRCelebration.tsx`:
- Change confetti settings
- Modify animation
- Update display content

### Adding tracked lift programmatically

```typescript
import { addTrackedLift } from '@/lib/profile';

await addTrackedLift(userId, 'Deadlift');
```

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - Where PR checks happen
- [11-settings.md](./11-settings.md) - Managing tracked lifts
- [02-providers.md](./02-providers.md) - PRCelebrationProvider
