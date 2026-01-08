# Environment Variable Mapping

## Sources Reviewed
- Backend: `backend/main.py` (uses `OPENAI_API_KEY`, `CORS_ORIGINS`).
- Client API config: `lib/api.ts` (uses `EXPO_PUBLIC_API_URL`).
- Docs: `docs/supabase.md` (lists Supabase URL and keys; not copied; placeholders only).

## Required Variables (placeholders only)
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_ANON_KEY` — anon key for client calls.
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side).
- `SUPABASE_JWT_SECRET` — JWT secret.
- `SUPABASE_ACCESS_TOKEN` — CLI token for `supabase link/db push` automation.
- `OPENAI_API_KEY` — used by backend `/chat` and `/coach`.
- `CORS_ORIGINS` — optional override for FastAPI CORS; defaults to Expo dev hosts if unset.
- `EXPO_PUBLIC_API_URL` — API base URL for the client; required in production; auto-derived in dev if missing.

## Files Added
- `.env.supabase.example` with placeholders for the variables above (no real secrets).

## UNKNOWNs
- Final production values for Supabase keys and JWT secret.
- Whether additional env vars are used outside reviewed files (none found).
- CORS origins for deployed environments.

## Supabase CLI
- No Supabase config changes in this step; no CLI commands run. If applying migrations/config, authenticate (`supabase login` or set `SUPABASE_ACCESS_TOKEN`) before running CLI.
