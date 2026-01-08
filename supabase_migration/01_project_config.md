# Supabase Project Config

## Sources Reviewed
- `docs/supabase.md` (contains Supabase URL and secrets; secrets not copied into config).
- `supabase/config.toml` (updated this task).

## Config Summary
- `supabase/config.toml` updated to a CLI-compatible scaffold (project block removed per CLI schema). All values are non-secret defaults to allow `supabase link`/`db push` to parse:
  - `[db]` port `5432`, shadow_port `54320`, major_version `17`.
  - `[api]` port `54321`, schemas `["public"]`, extra_search_path `["public"]`, max_rows `1000`.
  - `[auth]` site_url `http://localhost:3000`, additional_redirect_urls `[]`, jwt_expiry `3600`, enable_signup `true`.
  - `[storage]` file_size_limit `"50MB"`.
  - `[functions]` default.verify_jwt `true`.
- Project ref inferred as `vjfteiuxsdqdozhljxhd` (EzLifts) from `docs/supabase.md`; not stored in config (per CLI schema) but used for linking.

## UNKNOWNs
- Actual deployed ports, search paths, limits, and auth URLs for EzLifts production; current values are defaults only.
- Real storage limits and transformation settings.
- Functions JWT verification policy per environment (defaulted to true).

## Supabase CLI
- `supabase link --project-ref vjfteiuxsdqdozhljxhd` (EzLifts) succeeded after updating `db.major_version` to `17`.
- `supabase db push` pending; run after link.
