# Observability Artifacts

## Sources Reviewed
- Backend (`backend/main.py`, `backend/structured_gate.py`): no structured logging beyond stdout prints.
- No existing error reporting or analytics hooks found.

## Artifacts Added
- Migration `supabase/migrations/0007_observability.sql`
  - Table `public.event_logs` with columns: `id` (bigserial PK), `created_at` (timestamptz default now), `source` (text, not null), `level` (text, not null), `message` (text, not null), `context` (jsonb), `user_id` (uuid).
  - Indexes on `created_at desc`, `level`, `source`.
- Edge Function `supabase/functions/observability/index.ts`
  - POST-only; expects JSON `{ source, level, message, context?, user_id? }`.
  - Inserts into `public.event_logs` using service role key; returns `{ ok: true }` or error JSON.
  - Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function environment.

## Integration Points
- None wired yet; backend currently prints to stdout and does not call Supabase. Future work: send log events from backend or client to the Edge Function endpoint.

## UNKNOWNs
- Desired log retention, scrubbing/redaction rules, and access controls.
- Whether user_id should be enforced or optional.
- Preferred log levels and schemas beyond the minimal shape above.

## Supabase CLI
- `supabase db push` and `supabase functions deploy observability` not run in this task; earlier steps require authentication (`supabase login` / `SUPABASE_ACCESS_TOKEN`). Re-run after authenticating to apply migration 0007 and deploy the function.
