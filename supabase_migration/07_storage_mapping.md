# Storage Mapping

## Sources Reviewed
- Backend code (`backend/main.py`, `backend/structured_gate.py`): no file upload/download handlers.
- Database schema: no file metadata tables.
- Docs: no storage providers or paths referenced.

## Target Migration
- `supabase/migrations/0006_storage.sql` contains `-- UNKNOWN: storage usage not found` because no storage usage was identified.

## UNKNOWNs
- No existing storage providers, buckets, or folder structures.
- No access rules or policies to map.
- No file metadata tables or paths.

## Supabase CLI
- `supabase db push` not run for 0006 in this task; prior CLI steps require authentication (`supabase login` or `SUPABASE_ACCESS_TOKEN`). Re-run after authenticating to apply or keep placeholder as-is.
