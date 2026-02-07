# PR Tracking

## Files
| File | Purpose |
|------|---------|
| `lib/prTracking.ts` | E1RM calc, PR check |
| `contexts/PRCelebrationContext.tsx` | Celebration queue |
| `components/celebration/PRCelebration.tsx` | Confetti animation |

## E1RM Formula (Epley)
```typescript
e1rm = weight × (1 + reps / 30)

// Example: 185 lbs × 8 reps
e1rm = 185 × (1 + 8/30) = 234.3 lbs
```

## PR Detection Flow
```
Set logged → checkForPR(userId, exercise, weight, reps)
          → calculate E1RM
          → compare to stored PR
          → if higher → insert to pr_history
          → Supabase Realtime → celebration
```

## Key Functions

```typescript
// lib/prTracking.ts
calculateE1rm(weight, reps)           // Epley formula
checkForPR(userId, exercise, weight, reps)  // Check single
checkBatchForPRs(userId, sets)        // Check multiple
subscribeToPRBreakthroughs(userId, onPR)    // Realtime listener
```

## Realtime Subscription

```typescript
// app/(tabs)/index.tsx
useEffect(() => {
  const unsubscribe = subscribeToPRBreakthroughs(userId, (pr) => {
    showCelebration({
      exercise: pr.exercise,
      e1rm: pr.new_e1rm,
      previousE1rm: pr.previous_e1rm
    });
  });
  return unsubscribe;
}, [userId]);
```

## Celebration Context

```typescript
const { showCelebration } = usePRCelebration();

showCelebration({
  exercise: 'Bench Press',
  e1rm: 250,
  previousE1rm: 240
});
```

## Adding New Tracked Lift
User manages via Settings → PR Tracking. Uses `lib/profile.ts` functions.
