# Edge Functions

## Location
`supabase/functions/`

## Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `/chat` | POST | Parse workout + AI |
| `/coach` | POST | Streaming AI Q&A |
| `/parse` | POST | Fast parsing |
| `/history` | GET/POST/DELETE | Workout CRUD |
| `/log-set` | POST | Log set |
| `/profile` | GET/POST | User profile |
| `/pr-tracking` | GET/POST | PR lifts |
| `/workout-templates` | GET/POST/DELETE | Templates |
| `/terms-acceptance` | GET/POST | ToS |
| `/health` | GET | Health check |

## Structure
```
supabase/functions/
├── chat/index.ts
├── coach/index.ts
├── history/index.ts
└── deno.json
```

## Template

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Your logic here
  const { data } = await supabase.from('table').select('*').eq('user_id', user.id);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
```

## Deploy
```bash
supabase functions deploy my-function
supabase functions deploy  # all functions
```

## Local Dev
```bash
supabase functions serve my-function --env-file .env.local
```

## Adding Function
1. Create `supabase/functions/my-function/index.ts`
2. Add to `lib/api.ts`
3. Deploy with `supabase functions deploy`
