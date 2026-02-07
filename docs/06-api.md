# API

## File
`lib/api.ts` — Edge Function client

## Base URL
```typescript
const base = `${supabaseUrl}/functions/v1`
```

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat` | POST | Parse workout + AI response |
| `/coach` | POST | Streaming AI coach Q&A |
| `/parse` | POST | Fast workout parsing |
| `/history` | GET/POST/DELETE | Workout CRUD |
| `/log-set` | POST | Log individual set |
| `/terms-acceptance` | GET/POST | ToS status |
| `/profile` | GET/POST | User profile |
| `/pr-tracking` | GET/POST | PR lifts |
| `/workout-templates` | GET/POST/DELETE | Templates |

## Auth Headers
```typescript
// lib/auth.ts
async function getAuthHeaders() {
  const session = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': supabaseAnonKey
  };
}
```

Auto-refresh on 401 (5 min before expiry).

## Key Functions

```typescript
// lib/api.ts
chat(message, rows)          // Parse + AI
askCoach(question, rows)     // Streaming response
parse(message, lastExercise) // Fast parse
saveWorkout(session)         // POST /history
getHistory()                 // GET /history
deleteWorkout(id)            // DELETE /history
generateSessionReview(rows)  // AI workout summary
```

## Usage
```typescript
import { chat, saveWorkout } from '@/lib/api';

const result = await chat('Bench 185 x 8', rows);
await saveWorkout(session);
```

## Adding New Endpoint
1. Create Edge Function in `supabase/functions/`
2. Add function in `lib/api.ts`
3. Use `fetchWithAuth()` for auto-retry
