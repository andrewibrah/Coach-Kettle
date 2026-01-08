# API Parity Checklist

- `/history` (GET) — Returns workout sessions ordered by `createdAt` desc; includes rows array.
- `/history` (POST) — Upserts workout session by `id`; persists `dateISO`, `part`, `createdAt`, `rows`.
- `/history/{id}` (DELETE) — Deletes workout session by `id`.
- `/chat` — UNKNOWN: AI parsing via OpenAI; not migrated to Supabase.
- `/coach` — UNKNOWN: AI coaching via OpenAI; not migrated to Supabase.
- `/parse`, `/parse/fast` — UNKNOWN: parsing logic; not migrated to Supabase.
- `/log` — Not migrated; no persistent side effects.
- Edge Function `observability` — Inserts log events into `event_logs`; expects POST `{ source, level, message, context?, user_id? }`.
