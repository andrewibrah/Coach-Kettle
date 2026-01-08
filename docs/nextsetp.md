SECTION 1 — MIGRATION DECOMPOSITION

  - Supabase project structure & config: isolate because it defines target project and runtime defaults; if wrong, all migrations and clients point to the wrong project or fail.
  - Schema extraction & normalization: isolate because it is the foundation for integrity and constraints; if wrong, data shape diverges and logic breaks.
  - SQL migrations (core schema): isolate because they are irreversible once applied; if wrong, every downstream step fails or corrupts data.
  - Data backfill & ID mapping: isolate because it moves historical data at scale; if wrong, integrity and historical accuracy are lost.
  - Auth model migration: isolate because identity semantics control access; if wrong, users cannot sign in or roles are incorrect.
  - RLS policies: isolate because access control is enforced at the DB layer; if wrong, data leaks or legitimate access is blocked.
  - Backend logic / functions: isolate because it encodes business rules; if wrong, app behavior regresses.
  - History / activity pipelines: isolate because audit trails must be exact; if wrong, historical accuracy and compliance break.
  - Storage migration: isolate because file access uses separate policies; if wrong, uploads/downloads fail or leak.
  - Auth UI (account creation and login with Apple/Google): isolate because user access depends on it; if wrong, users cannot authenticate or recover sessions.
  - Client auth wiring: isolate because it changes session lifecycle and token use; if wrong, UX breaks or sessions churn.
  - Offline sync implications: isolate because it governs local consistency; if wrong, users see stale data or conflicts.
  - Secrets & environment handling: isolate because misconfiguration cascades; if wrong, services fail or secrets leak.
  - Observability & error reporting: isolate because incident response depends on it; if wrong, failures become invisible.
  - Verification & parity tests: isolate because they detect regressions; if wrong or absent, regressions ship.

  SECTION 2 — PROMPT SEQUENCE MAP
  Prompt 01 — Baseline inventory docs exist with UNKNOWNs captured.
  Prompt 02 — Supabase project structure and supabase/config.toml exist with placeholders documented.
  Prompt 03 — Core schema migration SQL and schema mapping doc exist.
  Prompt 04 — Auth migration SQL and auth mapping doc exist.
  Prompt 05 — RLS policy migration SQL and access matrix doc exist.
  Prompt 06 — Backend logic migrated to RPC/Edge Functions with mapping doc.
  Prompt 07 — History/audit pipeline migration SQL and mapping doc exist.
  Prompt 08 — Storage bucket/policy migration SQL and mapping doc exist.
  Prompt 11 — Supabase env example and env mapping doc exist.
  Prompt 12 — Observability artifacts (log table + ingest function) exist with doc.
  Prompt 13 — Verification scripts and parity checklist exist.
  Prompt 14 — Full UI for account creation and login with Apple/Google exists.

  SECTION 3 — AGENT PROMPTS (PRIMARY OUTPUT)

  ———

  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Create a complete baseline inventory of the current backend, data stores, and client data flows with UNKNOWNs explicitly captured.

  SCOPE

  - Files/directories to inspect: repo root; backend/server code; database models/migrations; API definitions; auth logic; storage integrations; background jobs; mobile client API layer.
  - Explicit exclusions: node_modules, vendor, build/dist, .git, generated files, third-party SDK source.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Locate all backend implementations, data stores, and API surfaces.
  3. Enumerate data stores and how the app connects to each.
  4. Enumerate API surfaces with endpoint names and request/response shapes.
  5. Enumerate auth flows, providers, token lifecycle, roles/permissions, and user/profile tables.
  6. Enumerate business logic components (handlers, jobs, cron/queue workers) and triggers.
  7. Enumerate storage usage (file types, paths, access patterns).
  8. Enumerate offline sync/caching behavior in the mobile client.
  9. Record missing details as explicit UNKNOWN entries without guessing.
  10. Apply changes to Supabase via CLI if any migrations/functions/config were created; otherwise document "No Supabase changes" in supabase_migration/00_baseline_inventory.md.

  OUTPUT REQUIREMENTS

  - Create supabase_migration/00_baseline_inventory.md with sections for Data Stores, API Surface, Auth, Business Logic, Background Jobs, Storage, Offline Sync, External Services.
  - Create supabase_migration/00_unknowns.md listing every UNKNOWN with a short reason.

  VERIFICATION

  - Every required section is populated or marked UNKNOWN.
  - No assumptions are introduced; UNKNOWNs are explicit and exhaustive.

  STOP CONDITIONS

  - Only stop if the repo contains none of the sources needed to enumerate the baseline; report UNKNOWN and continue with any partial findings.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
2

  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Establish Supabase project structure and non-secret configuration scaffolding.

  SCOPE

  - Files/directories to inspect: repo root; infra/config directories; existing Supabase-related files; DB connection config.
  - Explicit exclusions: application source code, node_modules, vendor, build/dist, .git.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Locate any existing Supabase or database configuration and record key values.
  3. Ensure supabase/ and supabase/migrations/ directories exist.
  4. Create or update supabase/config.toml using Supabase standard sections; populate known values and write UNKNOWN placeholders where missing; do not add secrets.
  5. Document configuration decisions and UNKNOWNs in supabase_migration/01_project_config.md.
  6. Apply changes to Supabase via CLI if any migrations/functions/config were created; otherwise document "No Supabase changes" in supabase_migration/01_project_config.md.

  OUTPUT REQUIREMENTS

  - Create or update supabase/config.toml with sections for project, db, api, auth, storage, and functions.
  - Create supabase_migration/01_project_config.md summarizing settings and UNKNOWNs.

  VERIFICATION

  - supabase/config.toml is present, structured, and contains no secrets.
  - All unknown values are explicitly marked UNKNOWN.

  STOP CONDITIONS

  - Only stop if the repo cannot be read; otherwise proceed with defaults and mark UNKNOWNs.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
3
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Create the initial Supabase schema migration for all core application tables.

  SCOPE

  - Files/directories to inspect: ORM models, migration files, schema SQL, seeds, data model docs.
  - Explicit exclusions: auth/system tables, storage tables, client UI code.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Extract the current schema from migrations/models/SQL dumps.
  3. Build a complete inventory of tables, columns, constraints, indexes, sequences, and enums excluding auth.* and storage.*.
  4. Write supabase/migrations/0001_initial_schema.sql with required extensions and all CREATE TABLE/ALTER TABLE statements for core schema.
  5. Write supabase_migration/02_schema_mapping.md mapping source objects to target objects and noting UNKNOWNs.
  6. Apply changes to Supabase via CLI by running supabase db push; if not possible, record the blocking reason in supabase_migration/02_schema_mapping.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0001_initial_schema.sql.
  - Create supabase_migration/02_schema_mapping.md with table/column mapping and deviations.

  VERIFICATION

  - All core tables are included with correct constraints and indexes.
  - No auth or storage system tables are created.
  - Every source table has a mapping or is marked UNKNOWN.

  STOP CONDITIONS

  - If no schema sources are found, create supabase_migration/02_schema_mapping.md with UNKNOWNs and create supabase/migrations/0001_initial_schema.sql containing a single -- UNKNOWN: source
    schema not found comment, then stop.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
4
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Migrate authentication model to Supabase Auth with profile/role mappings.

  SCOPE

  - Files/directories to inspect: auth logic, user models, role/permission definitions, session/token handling.
  - Explicit exclusions: client UI code, non-auth business logic, storage integrations.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Identify current auth providers, user identity fields, session/refresh handling, and role/permission storage.
  3. Define mapping to Supabase Auth (auth.users) and any required public profile/role tables.
  4. Write supabase/migrations/0002_auth.sql with profile tables, role tables, and triggers/functions to sync from auth.users as needed.
  5. Write supabase_migration/03_auth_mapping.md describing each auth flow and mapping, with UNKNOWNs flagged.
  6. Apply changes to Supabase via CLI by running supabase db push; if not possible, record the blocking reason in supabase_migration/03_auth_mapping.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0002_auth.sql.
  - Create supabase_migration/03_auth_mapping.md.

  VERIFICATION

  - All auth flows/providers are represented in the mapping.
  - User IDs remain consistent across auth and profile tables.
  - No credentials are stored outside Supabase Auth.

  STOP CONDITIONS

  - If auth sources are not found, create supabase_migration/03_auth_mapping.md with UNKNOWNs and create supabase/migrations/0002_auth.sql containing a single -- UNKNOWN: auth model not
    found comment, then stop.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
5

  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Implement Row Level Security policies that match existing access rules.

  SCOPE

  - Files/directories to inspect: backend access checks, authorization middleware, role definitions, tests covering permissions.
  - Explicit exclusions: client UI code, storage integrations, non-auth business logic not tied to access control.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Extract access rules for each table from code and tests.
  3. For each table in the core schema, define RLS policies using auth.uid() and role claims.
  4. Write supabase/migrations/0003_rls_policies.sql to enable RLS and create policies.
  5. Apply changes to Supabase via CLI by running supabase db push; if not possible, record the blocking reason in supabase_migration/04_rls_matrix.md.
  6. Write supabase_migration/04_rls_matrix.md listing table, policy, role, operations, and UNKNOWNs.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0003_rls_policies.sql.
  - Create supabase_migration/04_rls_matrix.md.

  VERIFICATION

  - Every table has explicit policies or is documented as intentionally public.
  - Policies preserve existing access behavior; UNKNOWNs are explicit blockers.

  STOP CONDITIONS

  - If access rules cannot be derived for a table, record UNKNOWN and add a clearly labeled placeholder policy that denies access; continue for remaining tables.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
6
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Migrate backend business logic to Supabase RPC and Edge Functions.

  SCOPE

  - Files/directories to inspect: backend controllers/handlers, service layer, scheduled jobs (excluding audit/history), API route definitions.
  - Explicit exclusions: audit/history pipelines, client UI code, storage integrations.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Inventory backend endpoints and map each to an RPC function or Edge Function.
  3. Implement database RPCs in supabase/migrations/0004_rpc_functions.sql where logic is data-centric.
  4. Implement Edge Functions in supabase/functions/<function_name>/index.(ts|js) using the repo’s dominant language; if none, use JS and mark UNKNOWN in the mapping doc.
  5. Write supabase_migration/05_backend_logic_mapping.md mapping each endpoint to its Supabase implementation with UNKNOWNs flagged.
  6. Apply changes to Supabase via CLI by running supabase db push and supabase functions deploy; if not possible, record the blocking reason in supabase_migration/05_backend_logic_mapping.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0004_rpc_functions.sql.
  - Create supabase/functions/ entries for each migrated Edge Function.
  - Create supabase_migration/05_backend_logic_mapping.md.

  VERIFICATION

  - Every backend endpoint has a Supabase equivalent with matching inputs/outputs.
  - Business rules are preserved; UNKNOWNs are explicit and minimal.

  STOP CONDITIONS

  - If no backend logic is found, create supabase_migration/05_backend_logic_mapping.md with UNKNOWNs and create supabase/migrations/0004_rpc_functions.sql containing a single -- UNKNOWN:
    backend logic not found comment, then stop.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
7
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Migrate history and activity pipelines to preserve audit trails.

  SCOPE

  - Files/directories to inspect: audit logging, activity feed generation, event tables, analytics pipelines tied to history.
  - Explicit exclusions: core business logic already migrated, client UI code, storage integrations.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Identify all audit/history sources, tables, and event generation points.
  3. Design target history/audit tables and triggers to preserve ordering and immutability.
  4. Write supabase/migrations/0005_history_pipeline.sql with history tables, triggers, and indexes.
  5. Write supabase_migration/06_history_mapping.md mapping source events to target records with UNKNOWNs flagged.
  6. Apply changes to Supabase via CLI by running supabase db push; if not possible, record the blocking reason in supabase_migration/06_history_mapping.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0005_history_pipeline.sql.
  - Create supabase_migration/06_history_mapping.md.

  VERIFICATION

  - All historical events are mapped to immutable records.
  - Timestamps and ordering semantics are preserved.

  STOP CONDITIONS

  - If no history pipeline is found, create supabase_migration/06_history_mapping.md with UNKNOWNs and create supabase/migrations/0005_history_pipeline.sql containing a single -- UNKNOWN:
    history pipeline not found comment, then stop.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
8
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Migrate file storage configuration to Supabase Storage with correct access policies.

  SCOPE

  - Files/directories to inspect: storage integrations, upload/download handlers, file metadata tables.
  - Explicit exclusions: client UI code, non-storage business logic.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Identify existing storage providers, bucket/folder structure, and access rules.
  3. Define Supabase Storage buckets and file path mappings.
  4. Write supabase/migrations/0006_storage.sql to create buckets and policies.
  5. Write supabase_migration/07_storage_mapping.md mapping old paths/policies to new buckets and rules with UNKNOWNs flagged.
  6. Apply changes to Supabase via CLI by running supabase db push; if not possible, record the blocking reason in supabase_migration/07_storage_mapping.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0006_storage.sql.
  - Create supabase_migration/07_storage_mapping.md.

  VERIFICATION

  - Every file path pattern maps to a bucket and policy.
  - Storage access behavior matches existing rules; UNKNOWNs are explicit.

  STOP CONDITIONS

  - If storage usage is not found, create supabase_migration/07_storage_mapping.md with UNKNOWNs and create supabase/migrations/0006_storage.sql containing a single -- UNKNOWN: storage usage
    not found comment, then stop.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  
  ———
9
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Define secrets and environment variable mapping for Supabase without committing secrets.

  SCOPE

  - Files/directories to inspect: env files, config loaders, build scripts, CI configs.
  - Explicit exclusions: database migrations, client UI code.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Inventory existing environment variables used by backend and client.
  3. Define required Supabase variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, and any app-specific keys).
  4. Create .env.supabase.example with placeholders and no real secrets.
  5. Write supabase_migration/10_env_mapping.md mapping old variables to new ones with UNKNOWNs flagged.
  6. Apply changes to Supabase via CLI if any migrations/functions/config were created; otherwise document "No Supabase changes" in supabase_migration/10_env_mapping.md.

  OUTPUT REQUIREMENTS

  - Create .env.supabase.example.
  - Create supabase_migration/10_env_mapping.md.

  VERIFICATION

  - All required Supabase variables are listed.
  - No secrets or real keys are committed.

  STOP CONDITIONS

  - If env usage cannot be determined, create supabase_migration/10_env_mapping.md with UNKNOWNs and still create .env.supabase.example with placeholders.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———

10
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Add observability artifacts for Supabase migration without altering existing business logic.

  SCOPE

  - Files/directories to inspect: logging/error reporting code, analytics hooks, serverless/edge function patterns.
  - Explicit exclusions: existing business logic functions, client UI code.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Identify current error reporting and logging mechanisms.
  3. Create a log storage schema in supabase/migrations/0007_observability.sql (e.g., event_logs table with indexes).
  4. Implement a standalone Edge Function in supabase/functions/observability/index.(ts|js) to accept log events and insert into the log table.
  5. Write supabase_migration/11_observability.md describing integration points and UNKNOWNs.
  6. Apply changes to Supabase via CLI by running supabase db push and supabase functions deploy; if not possible, record the blocking reason in supabase_migration/11_observability.md.

  OUTPUT REQUIREMENTS

  - Create supabase/migrations/0007_observability.sql.
  - Create supabase/functions/observability/index.(ts|js).
  - Create supabase_migration/11_observability.md.

  VERIFICATION

  - Observability artifacts are self-contained and do not modify existing business logic.
  - Log table and function schemas are consistent.

  STOP CONDITIONS

  - If no logging mechanisms are found, still create the artifacts and mark UNKNOWNs in the doc.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
11
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Produce verification artifacts that prove parity and detect regressions.

  SCOPE

  - Files/directories to inspect: test suites, QA scripts, migration docs, API specs.
  - Explicit exclusions: application source code changes.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Inventory existing tests and identify coverage gaps for auth, data, storage, and offline flows.
  3. Create supabase_migration/verification/parity_checks.sql with queries validating row counts, checksums, and FK integrity.
  4. Create supabase_migration/verification/api_parity_checklist.md enumerating endpoints and expected behaviors.
  5. Apply changes to Supabase via CLI if any migrations/functions/config were created; otherwise document "No Supabase changes" in supabase_migration/12_verification.md.
  6. Create supabase_migration/12_verification.md describing how to run checks and what invariants must hold.

  OUTPUT REQUIREMENTS

  - Create supabase_migration/verification/parity_checks.sql.
  - Create supabase_migration/verification/api_parity_checklist.md.
  - Create supabase_migration/12_verification.md.

  VERIFICATION

  - Verification artifacts cover schema, data, auth, storage, and client flows.
  - UNKNOWNs are explicitly documented where coverage is missing.

  STOP CONDITIONS

  - If no tests/specs exist, document UNKNOWNs and still create the verification artifacts.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  ———
12
  AGENT ROLE
  You are a senior software engineer specializing in Supabase migrations.

  OBJECTIVE
  Implement a full UI for account creation and login with Apple and Google using Supabase Auth.

  SCOPE

  - Files/directories to inspect: app/ routes, auth-related components, navigation, hooks, config files, and any existing auth UI.
  - Explicit exclusions: backend server code, supabase/ migrations, build outputs.

  TASKS

  1. Ensure supabase_migration/ exists.
  2. Locate existing auth UI routes, navigation, and auth state handling.
  3. Add or update screens for account creation and login, including Apple and Google sign-in options.
  4. Wire UI actions to Supabase Auth OAuth flows and session handling using existing project patterns.
  5. Configure Apple and Google providers in Supabase (redirect URLs, client IDs, and any required scopes) using CLI or documented API; if not possible without secrets, prepare exact configuration steps and placeholders.
  6. Update mobile config for Apple and Google sign-in (bundle IDs, OAuth client IDs, URL schemes, deep links) in app config files; document UNKNOWNs where missing.
  7. Ensure redirect URLs and deep links match current navigation structure and are registered in Supabase provider settings; document UNKNOWNs if missing.
  8. Create or update tests for auth UI flows if tests exist in the repo.
  9. Write supabase_migration/13_auth_ui.md summarizing screens, flow, provider configuration, and any UNKNOWNs.
  10. Apply changes to Supabase via CLI where possible; if provider configuration cannot be applied via CLI, record the blocking reason and exact manual steps in supabase_migration/13_auth_ui.md.

  OUTPUT REQUIREMENTS

  - Modify app UI files to include account creation and login screens with Apple/Google options.
  - Create supabase_migration/13_auth_ui.md.

  VERIFICATION

  - Account creation and login flows are reachable from the app and update session state correctly.
  - Apple and Google sign-in options are present and wired to Supabase Auth.
  - UNKNOWNs are explicitly documented when provider configuration is missing.

  STOP CONDITIONS

  - If auth UI entry points cannot be located, document UNKNOWNs and stop after creating supabase_migration/13_auth_ui.md.

  DO NOT

  - No refactors
  - No renames
  - No feature additions
  - No stylistic changes

  EXECUTE UNTIL COMPLETE.
  DO NOT ASK FOR APPROVAL.
  DO NOT CONTINUE BEYOND THIS SCOPE.

  SECTION 4 — HUMAN-ONLY TASKS

  - [ ] Create the Supabase project(s) and select region/plan.
  - [ ] Provision credentials and store secrets securely.
  - [ ] Configure environment variables in CI/CD and production.
  - [ ] Run production data export/import and cutover.
  - [ ] Perform manual QA on physical devices across supported OS versions.

  SECTION 5 — EXECUTION STRATEGY
  Start with low-risk documentation and config scaffolding, then lock down schema/auth/RLS before moving logic, storage, and data migration, and finally update the client; this minimizes
  blast radius and rollback cost because early steps are non-destructive and later steps are isolated per migration file or client patch. Rollback is possible by removing individual
  migration files or reverting client changes before cutover. Prompts 01, 02, 11, and 13 are parallel-safe if needed, but the recommended order prevents policy/logic drift. A human should
  pause before running backfill and before production cutover to validate UNKNOWNs and secrets.
