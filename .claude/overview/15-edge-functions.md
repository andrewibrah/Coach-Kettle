# Supabase Edge Functions

> Serverless API endpoints for all backend operations.

---

## Overview

All backend logic runs as **Supabase Edge Functions** - Deno-based serverless functions. The client never accesses the database directly.

**Location:** `supabase/functions/`

---

## Function List

| Function | Purpose | Method(s) |
|----------|---------|-----------|
| `/chat` | AI workout parsing | POST |
| `/coach` | Streaming AI Q&A | POST |
| `/parse` | Fast workout parsing | POST |
| `/history` | Workout CRUD | GET, POST, PATCH, DELETE |
| `/log-set` | Log individual set | POST |
| `/terms-acceptance` | ToS status | GET, POST |
| `/chat-history` | Chat messages | GET, POST, DELETE |
| `/chats` | Chat sessions | GET |
| `/profile` | User profile | GET, POST |
| `/pr-tracking` | PR tracked lifts | GET, POST |
| `/workout-templates` | Templates CRUD | GET, POST, DELETE |
| `/health` | Health check | GET |
| `/observability` | Analytics | POST |

**Note:** `/history` POST also inserts rows into the `workout_log` table, which triggers PR detection via database triggers/realtime.

---

## Function Structure

Each function follows this pattern:

```
supabase/functions/
├── function-name/
│   └── index.ts
└── deno.json       # Shared config
```

### Basic Function Template

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user from JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle request based on method
    switch (req.method) {
      case 'GET':
        return handleGet(supabaseClient, user);
      case 'POST':
        const body = await req.json();
        return handlePost(supabaseClient, user, body);
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleGet(supabase: any, user: any) {
  // GET logic
  const { data, error } = await supabase
    .from('my_table')
    .select('*')
    .eq('user_id', user.id);

  if (error) throw error;

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePost(supabase: any, user: any, body: any) {
  // POST logic
  const { data, error } = await supabase
    .from('my_table')
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) throw error;

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## Key Functions Deep Dive

### /chat - AI Workout Parsing

```typescript
// POST /functions/v1/chat
// Body: { message: string, rows: LogRow[], context?: string }
// Returns: { response: string, rows?: ParsedRow[] }

serve(async (req) => {
  const { message, rows, context } = await req.json();

  // Build prompt with context
  const systemPrompt = `You are a workout tracking assistant.
    Current workout: ${JSON.stringify(rows)}
    User context: ${context}`;

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]
  });

  // Parse response for workout data
  const response = completion.choices[0].message.content;
  const parsedRows = extractWorkoutRows(response);

  return new Response(
    JSON.stringify({ response, rows: parsedRows }),
    { headers: corsHeaders }
  );
});
```

### /coach - Streaming AI Q&A

```typescript
// POST /functions/v1/coach
// Body: { question: string, rows: LogRow[] }
// Returns: Streaming text response

serve(async (req) => {
  const { question, rows } = await req.json();

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a fitness coach...' },
      { role: 'user', content: question }
    ],
    stream: true
  });

  // Return streaming response
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    }
  });

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream'
    }
  });
});
```

### /history - Workout CRUD

```typescript
serve(async (req) => {
  const supabase = createAuthClient(req);
  const user = await getUser(supabase);

  switch (req.method) {
    case 'GET':
      // Fetch all user workouts
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return jsonResponse(data);

    case 'POST':
      // Save new workout (upsert to workouts table)
      const workout = await req.json();
      const { data: saved } = await supabase
        .from('workouts')
        .upsert({ ...workout, user_id: user.id })
        .select()
        .single();

      // Also insert rows into workout_log table.
      // This triggers PR detection via database triggers/realtime.
      if (workout.rows?.length) {
        await supabase
          .from('workout_log')
          .insert(workout.rows.map((row: any) => ({
            ...row,
            workout_id: saved.id,
            user_id: user.id,
          })));
      }

      return jsonResponse(saved);

    case 'PATCH':
      // Update workout metadata (reflection, etc.)
      // URL: /history/{workoutId}
      const url = new URL(req.url);
      const workoutId = url.pathname.split('/').pop();
      const updates = await req.json();
      const { data: patched } = await supabase
        .from('workouts')
        .update(updates)
        .eq('id', workoutId)
        .eq('user_id', user.id)
        .select()
        .single();
      return jsonResponse(patched);

    case 'DELETE':
      // Delete workout
      const { id } = await req.json();
      await supabase
        .from('workouts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      return jsonResponse({ success: true });
  }
});
```

---

## Deployment

### Deploy single function

```bash
supabase functions deploy function-name
```

### Deploy all functions

```bash
supabase functions deploy
```

### Local development

```bash
supabase functions serve function-name --env-file .env.local
```

---

## Environment Variables

Functions access these via `Deno.env.get()`:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin access key |
| `OPENAI_API_KEY` | OpenAI API key |

---

## Error Handling

### Standard error response

```typescript
function errorResponse(message: string, status: number = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
```

### Common error patterns

```typescript
try {
  // ... function logic
} catch (error) {
  console.error('Function error:', error);

  if (error.code === 'PGRST116') {
    return errorResponse('Not found', 404);
  }

  if (error.code === '23505') {
    return errorResponse('Duplicate entry', 409);
  }

  return errorResponse('Internal server error', 500);
}
```

---

## Creating a New Function

1. **Create directory:**
```bash
mkdir supabase/functions/my-new-function
```

2. **Create index.ts:**
```typescript
// supabase/functions/my-new-function/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// ... implementation
```

3. **Test locally:**
```bash
supabase functions serve my-new-function
```

4. **Deploy:**
```bash
supabase functions deploy my-new-function
```

5. **Add API function:**
```typescript
// lib/api.ts
export async function myNewFunction(params: Params): Promise<Result> {
  const headers = await getJsonAuthHeaders();
  const response = await fetch(`${supabaseUrl}/functions/v1/my-new-function`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });
  return response.json();
}
```

---

## Security Best Practices

1. **Always verify JWT** - Never skip auth verification
2. **Use RLS policies** - Even with Edge Functions, enable RLS
3. **Validate input** - Check request body before use
4. **Scope queries to user** - Always filter by `user_id`
5. **Don't expose service key** - Keep admin operations server-side
6. **Rate limit** - Implement rate limiting for expensive operations

---

## Related Docs
- [06-api.md](./06-api.md) - Client API layer
- [01-auth.md](./01-auth.md) - Authentication flow
- [16-media-reflection.md](./16-media-reflection.md) - Media & reflection (uses PATCH /history)
