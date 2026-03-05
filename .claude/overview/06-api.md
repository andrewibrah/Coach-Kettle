# API Layer

> All communication with Supabase Edge Functions.

---

## Overview

All API calls go through **Supabase Edge Functions**. No direct database access from the client.

**Base URL:** `${supabaseUrl}/functions/v1/`

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/api.ts` | API client functions |
| `lib/auth.ts` | JWT utilities |
| `lib/supabase.ts` | Supabase client |
| `supabase/functions/*` | Edge Functions |

---

## Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat` | POST | Parse workout + AI response |
| `/coach` | POST | Streaming AI coach Q&A |
| `/parse` | POST | Fast workout parsing |
| `/history` | GET | Fetch all workouts |
| `/history` | POST | Save workout (also inserts into `workout_log` for PR triggers) |
| `/history` | DELETE | Delete workout |
| `/history/{id}` | PATCH | Update workout metadata (reflection) |
| `/log-set` | POST | Log individual set |
| `/terms-acceptance` | GET | Check ToS status |
| `/terms-acceptance` | POST | Record ToS acceptance |
| `/chat-history` | GET | Fetch chat messages |
| `/chat-history` | POST | Save chat message |
| `/profile` | GET/POST | User profile CRUD |
| `/pr-tracking` | GET/POST | PR tracked lifts |
| `/workout-templates` | GET/POST | Templates CRUD |
| `/health` | GET | Health check |

---

## Authentication

All requests include auth headers:

```typescript
// lib/auth.ts
export async function getAuthHeaders(): Promise<Headers> {
  const { data: { session } } = await supabase.auth.getSession();

  // Proactive refresh if expiring soon
  if (session) {
    const expiresAt = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt - now < 5 * 60) {
      await supabase.auth.refreshSession();
    }
  }

  return new Headers({
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey': supabaseAnonKey
  });
}

export async function getJsonAuthHeaders(): Promise<Headers> {
  const headers = await getAuthHeaders();
  headers.set('Content-Type', 'application/json');
  return headers;
}
```

---

## API Client Functions

### chat()
Parse workout input with AI enhancement.

```typescript
export async function chat(
  message: string,
  rows: LogRow[]
): Promise<{ response: string; rows?: ParsedRow[] }> {
  const headers = await getJsonAuthHeaders();
  const context = await buildPersonalizedContext();

  const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, rows, context })
  });

  return response.json();
}
```

### askCoach()
Streaming AI coach response. Fetches user profile context server-side and accepts a `chatHistory` parameter for conversation continuity.

```typescript
export async function askCoach(
  question: string,
  rows: LogRow[],
  onChunk: (text: string) => void,
  chatHistory?: ChatMessage[]
): Promise<void> {
  const headers = await getJsonAuthHeaders();

  const response = await fetch(`${supabaseUrl}/functions/v1/coach`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question, rows, chatHistory })
  });

  // Stream response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value));
  }
}
```

### generateSessionReview()
Generate an AI-powered review for a completed workout session.

```typescript
export async function generateSessionReview(
  rows: LogRow[],
  workoutPart: string
): Promise<SessionReview | null> {
  // Calls /chat with review prompt
  // AI generates structured review with rating formula:
  //   base 5 + bonuses (intensity, rep range, volume, compounds) - penalties
  // Returns: { rating, strengths[], weakness, nextSessionNote }
}
```

### updateWorkoutMeta()
Update workout-level metadata such as reflection notes.

```typescript
export async function updateWorkoutMeta(
  workoutId: string,
  updates: { reflection?: string }
): Promise<void> {
  // PATCH /history/{id}
  // Updates workout-level metadata (currently just reflection)
}
```

### saveWorkout()
Save workout to remote storage.

```typescript
export async function saveWorkout(session: WorkoutSession): Promise<void> {
  const headers = await getJsonAuthHeaders();

  await fetch(`${supabaseUrl}/functions/v1/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify(session)
  });
}
```

### getHistory()
Fetch all saved workouts.

```typescript
export async function getHistory(): Promise<WorkoutSession[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${supabaseUrl}/functions/v1/history`, {
    method: 'GET',
    headers
  });

  return response.json();
}
```

### deleteWorkout()
Delete a workout by ID.

```typescript
export async function deleteWorkout(id: string): Promise<void> {
  const headers = await getJsonAuthHeaders();

  await fetch(`${supabaseUrl}/functions/v1/history`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ id })
  });
}
```

---

## Personalized Context

The API builds personalized context for AI calls:

```typescript
// lib/api.ts
async function buildPersonalizedContext(): Promise<string> {
  const profile = await getCachedProfile();

  if (!profile) return '';

  const parts = [];

  if (profile.focus) {
    parts.push(`User's fitness focus: ${profile.focus}`);
  }

  if (profile.current_weight && profile.goal_weight) {
    parts.push(`Current weight: ${profile.current_weight}, Goal: ${profile.goal_weight}`);
  }

  if (profile.ai_context) {
    parts.push(profile.ai_context);
  }

  return parts.join('. ');
}
```

---

## Profile Caching

Profiles are cached for 1 minute:

```typescript
// lib/api.ts
let profileCache: { data: UserProfile | null; timestamp: number } | null = null;
const PROFILE_CACHE_TTL = 60 * 1000; // 1 minute

async function getCachedProfile(): Promise<UserProfile | null> {
  if (profileCache && Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL) {
    return profileCache.data;
  }

  const profile = await fetchProfile();
  profileCache = { data: profile, timestamp: Date.now() };
  return profile;
}
```

---

## Error Handling

### Auto-retry on 401

```typescript
// lib/auth.ts
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retries = 1
): Promise<Response> {
  const headers = await getAuthHeaders();

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && retries > 0) {
    // Refresh session and retry
    await supabase.auth.refreshSession();
    return fetchWithAuth(url, options, retries - 1);
  }

  return response;
}
```

### Error handling pattern

```typescript
try {
  const result = await api.someFunction();
  // Handle success
} catch (error) {
  if (error instanceof AuthError) {
    // Handle auth error - maybe redirect to login
  } else {
    // Show user-friendly error
    Alert.alert('Error', 'Something went wrong');
  }
}
```

---

## Implementing Changes

### Adding a new endpoint

1. **Create Edge Function:**
```typescript
// supabase/functions/my-endpoint/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  // Verify auth, handle request

  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

2. **Add API function:**
```typescript
// lib/api.ts
export async function myNewFunction(params: MyParams): Promise<MyResult> {
  const headers = await getJsonAuthHeaders();

  const response = await fetch(`${supabaseUrl}/functions/v1/my-endpoint`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

3. **Use in component:**
```typescript
import { myNewFunction } from '@/lib/api';

const handleAction = async () => {
  try {
    setLoading(true);
    const result = await myNewFunction({ param: value });
    // Handle result
  } catch (error) {
    Alert.alert('Error', error.message);
  } finally {
    setLoading(false);
  }
};
```

---

## Related Docs
- [01-auth.md](./01-auth.md) - Authentication
- [15-edge-functions.md](./15-edge-functions.md) - Edge Function details
