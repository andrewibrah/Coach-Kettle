# Backend Logic Mapping

## Sources Reviewed
- Backend handlers: `backend/main.py` (FastAPI endpoints), `backend/structured_gate.py`.
- No auth/role middleware found; endpoints are unauthenticated.

## Supabase Implementations
- RPC `public.save_workout` (0004): mirrors `POST /history` upsert into `public.workouts`.
- RPC `public.list_workouts` (0004): mirrors `GET /history` returning sessions ordered by `createdAt` desc.
- RPC `public.delete_workout` (0004): mirrors `DELETE /history/{id}`.

## Endpoint Coverage
- `GET /health` — Not migrated; non-data health check.
- `POST /chat` — UNKNOWN; AI/LLM logic not migrated to Supabase Edge Function (would require OpenAI integration and prompt logic).
- `POST /coach` — UNKNOWN; AI/LLM logic not migrated to Supabase Edge Function.
- `POST /parse`, `POST /parse/fast` — UNKNOWN; structured parsing logic not migrated to Supabase (would require porting parser and decision gate).
- `POST /log` — Not migrated; no persistent side effects in backend (stdout only).
- `POST /history` — Covered by RPC `public.save_workout`.
- `GET /history` — Covered by RPC `public.list_workouts`.
- `DELETE /history/{id}` — Covered by RPC `public.delete_workout`.

## Unknowns / Gaps
- No user identity or auth model; RPCs are `security definer` to match open backend behavior but should be scoped once auth model exists.
- AI endpoints (`/chat`, `/coach`, `/parse`) and parsing logic remain unmigrated; require Edge Functions and environment for OpenAI keys.
- No tests or role definitions to validate access scopes.

## Supabase CLI
- `supabase db push` attempted for 0004; blocked by missing Supabase access token: `Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.` Re-run after authenticating and linking to EzLifts.
- No Edge Functions created or deployed in this step (pending design for AI/parsing logic).
