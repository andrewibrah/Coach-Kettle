# Storage

## Strategy
Local-first: AsyncStorage (immediate) + Supabase (background sync)

## Files
| File | Purpose |
|------|---------|
| `lib/workoutStorage.ts` | Workout CRUD |
| `lib/chatStorage.ts` | Chat history |

## Workout Storage

```typescript
// lib/workoutStorage.ts
type WorkoutSession = {
  id: string;
  dateISO: string;
  part: BodyPart[];
  rows: LogRow[];
  createdAt: number;
  review?: SessionReview;
}

// Functions
listWorkouts()        // Get all from AsyncStorage
saveWorkout(session)  // Local + remote sync
deleteWorkout(id)     // Remove from AsyncStorage
clearWorkouts()       // Wipe all
```

## Save Flow
```
saveWorkout(session)
    ├── AsyncStorage.setItem('workout_history_v1', [...])  // immediate
    └── api.saveWorkout(session)  // background, best-effort
```

## Chat Storage

```typescript
// lib/chatStorage.ts
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  source: 'workout_chat' | 'coach_modal';
  created_at: string;
}

// Functions
saveChatMessages(messages)
fetchChatHistory(source?)
saveWorkoutChatQA(q, a)
saveCoachChatQA(q, a)
```

## Storage Keys
```
workout_history_v1    // All workouts
theme_preference      // light/dark/system
biometric_enabled     // true/false
last_authenticated_at // timestamp
terms_accepted_*      // legal consent
```

## Adding New Storage
1. Create functions in `lib/`
2. Use `AsyncStorage.getItem/setItem`
3. Add sync to Supabase if needed
