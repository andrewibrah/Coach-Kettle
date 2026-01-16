# Next Steps & Future Plans

## 🔒 Security Best Practices

### 1. Enable Row Level Security (RLS)
- [x] **Chats Table**: RLS is currently enabled for the `chats` table.
- [ ] **Workouts/Sets**: Ensure RLS is enabled for `workouts` and `log_entries` tables to prevent unauthorized data access.
- [ ] **Audit**: Periodically review RLS policies in `supabase/migrations` to ensure no regression.

### 2. Edge Function Security
- [ ] **Remove `no-verify-jwt`**: The `coach` and `chat-history` functions currently bypass Supabase's automatic JWT verification.
    - *Plan*: Implement strict JWT validation within the functions (using `jose` library) or fix the deployment configuration to allow Supabase to handle it natively.
- [ ] **Input Validation**: Ensure all Edge Functions strictly parse and validate incoming JSON bodies (e.g., using `zod`).

### 3. API Key Management
- [ ] **Rotation**: Regularly rotate `service_role` keys if used in CI/CD.
- [ ] **Scope**: Ensure the frontend only ever uses the `anon` key.

---

## 🚀 Future Features & Improvements

### 1. Containerized Development Environment
- [ ] **Goal**: Standardize the dev environment so new contributors don't need to manually install Node, Expo, or Supabase CLI.
- [ ] **Plan**:
    - Create `.devcontainer/devcontainer.json`
    - Create `.devcontainer/Dockerfile`
    - Verify `npm install` and `supabase start` work inside the container.

### 2. Specialized Coaching
- [ ] **Goal**: Make the AI coach "aware" of specific training programs (e.g., 5x5, PPL).
- [ ] **Plan**: Add a `program_context` field to the coach system prompt.

### 3. Offline Sync
- [ ] **Goal**: Improve reliability when logging sets in a gym with poor reception.
- [ ] **Plan**: Implement a local queue (e.g., typically using SQLite or WatermelonDB) that syncs to Supabase when online.

---

## 🧹 Maintenance & Technical Debt

### 1. Unified Error Handling
- [ ] **Goal**: A single pattern for UI error toasts.
- [ ] **Plan**: Refactor `alert` usages to a custom `useToast` hook for better UX.

### 2. Documentation
- [ ] **Goal**: Keep `docs/` up to date.
- [ ] **Plan**: Archive old migration docs and keep `schema.md` current.
