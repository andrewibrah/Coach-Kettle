# Coach Kettle — QA Deep-Dive Consolidated Report

> 6 parallel audit agents scanned the entire codebase across Data Integrity, Security, Performance, Edge Functions, UI/UX, and Cross-Cutting Concerns.

---

## EXECUTIVE SUMMARY

| Severity | Count | Categories |
|----------|-------|-----------|
| **P0-Critical** | 2 | History detail dark mode (D5-001), WorkoutCard dark mode (D5-002) |
| **P1-High** | 8 | Unauthenticated edge functions, IDOR in pr-tracking, log-set silent 200, stale closure in fill_skeleton, bottom bar dark mode, chats dark mode, silent error swallowing, hardcoded Supabase creds |
| **P2-Medium** | 12 | IDOR templates, unbounded profile update, CORS wildcard, unbounded queries, schema leaks, unvalidated payloads, auth screens dark mode, modal buttons dark mode, zombie deps, dead code, `as any` |
| **P3-Low** | 6 | Token refresh race, token storage, stale StyleSheet defaults, console.log leaks, inline code duplication, dead exports |

**Total: 28 findings across 6 dimensions.**

---

## PROMPT ENGINEERING METHODOLOGY

### How This Audit Was Conducted

**Technique:** Chain-of-thought decomposition + parallel agent specialization + structured evidence collection

Each of 6 agents received a prompt engineered with:
1. **Role Assignment** — Senior engineer persona specific to their domain (Security Engineer, Performance Engineer, etc.)
2. **Reasoning Protocol** — 7-step chain: OBSERVE → HYPOTHESIZE → VERIFY → CLASSIFY → EVIDENCE → IMPACT → FIX
3. **Severity Taxonomy** — P0-P3 with concrete definitions tied to user-facing impact
4. **Anti-Pattern Catalog** — 10 named patterns to hunt (The Stale Closure Trap, The Fire-and-Forget, The Zombie Subscription, etc.)
5. **Output Schema** — Structured format per finding for consistent comparison
6. **File Target Lists** — Explicit files to audit, preventing shallow coverage
7. **Depth Constraint** — "Top 5-8 findings maximum, ordered by severity" to force prioritization over breadth

**Agents deployed in parallel:**
- D1: Data Integrity & State Management
- D2: Authentication & Security
- D3: Performance & Resource Management
- D4: Edge Function Reliability
- D5: UI/UX Consistency & Correctness
- D6: Cross-Cutting Concerns (dead code, deps, TS strictness)

**Full prompt template:** See `docs/plans/qa_deep_dive_prompt.md`

---

## TOP 10 CRITICAL FIXES (Action Items)

### 1. [SECURITY] Unauthenticated Edge Functions (P1)
- **Files:** `supabase/functions/chat/index.ts`, `supabase/functions/parse/index.ts`, `supabase/functions/observability/index.ts`
- **Bug:** No JWT verification — anyone can burn OpenAI credits and inject logs
- **Fix:** Add JWT auth check to `chat` and `parse`; for `observability`, derive `user_id` from token instead of request body

### 2. [SECURITY] IDOR in pr-tracking (P1)
- **Files:** `supabase/functions/pr-tracking/index.ts` (lines 218-258)
- **Bug:** `remove_tracked` and `toggle_tracked` delete/update by `id` only — no `.eq("user_id", userId)` — uses service-role client bypassing RLS
- **Fix:** Add `.eq("user_id", userId)` to both queries

### 3. [DATA] log-set Returns 200 OK on Failure (P1)
- **File:** `supabase/functions/log-set/index.ts` (lines 86-132)
- **Bug:** Missing fields return `200 OK`, DB errors return `200 OK` — user thinks data is saved when it's lost
- **Fix:** Return `400` for missing fields, `500` for DB errors

### 4. [DATA] Stale Closure in fill_skeleton PR Check (P1)
- **File:** `app/(tabs)/index.tsx` (lines 843-844)
- **Bug:** After `setRows()`, reads `rows[targetRowIndex]` which captures the **old** state (before the update)
- **Fix:** Use the local variables `weight`/`reps` from `gateDecision` instead of reading from stale `rows`

### 5. [UI] History Detail Hardcoded Colors — Dark Mode Broken (P0)
- **File:** `app/history/[id].tsx` (lines 197-376)
- **Bug:** 20+ hardcoded light-mode hex colors in StyleSheet; screen nearly unreadable in dark mode
- **Fix:** Replace all hardcoded colors with `useThemeColor`/`isDark` ternary overrides

### 6. [UI] WorkoutCard Hardcoded Colors (P0)
- **File:** `components/workout/WorkoutCard.tsx` (lines 42-65, 170-220)
- **Bug:** Edit input `#000000`/`#FFFFFF`, labels `#6B7280`, divider `#D1D5DB`, notes `#4B5563` all hardcoded
- **Fix:** Use `useThemeColor` for all color values

### 7. [UI] WorkoutBottomBar — Primary Buttons Invisible in Dark Mode (P1)
- **File:** `components/workout/WorkoutBottomBar.tsx` (lines 145-261)
- **Bug:** 15+ hardcoded hex values; Start/End/Send buttons use `#111827` which disappears on dark backgrounds
- **Fix:** Invert primary button colors: `isDark ? '#FFFFFF' : '#111827'`

### 8. [BACKEND] `chats` Edge Function Completely Non-Functional (P2)
- **File:** `supabase/functions/chats/index.ts` (lines 161-174)
- **Bug:** Routes match `path === "/chats"` but actual URL path is `/functions/v1/chats` — every request returns 405
- **Fix:** Switch to method-only routing (drop path matching), same as all other functions

### 9. [BACKEND] History GET Unbounded — No LIMIT (P2)
- **File:** `supabase/functions/history/index.ts` (lines 145-149)
- **Bug:** Returns ALL user workouts with no `.limit()` — can be megabytes for active users, causing timeouts
- **Fix:** Add `.limit(50)` and cursor-based pagination

### 10. [SECURITY] Unbounded Profile Update (P2)
- **File:** `supabase/functions/profile/index.ts` (lines 164-171)
- **Bug:** Passes raw `body.updates` to `.update(updates)` with service-role client — user can overwrite ANY column
- **Fix:** Allowlist fields: `['display_name', 'focus', 'experience', 'training_days', 'ai_context']`

---

## FULL FINDINGS BY DIMENSION

### D1: Data Integrity & State Management
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D1-1 | P1 | Stale closure in `fill_skeleton` — reads old `rows` after `setRows()` | `app/(tabs)/index.tsx:843-844` |
| D1-2 | P2 | `saveWorkout` silent fail — Supabase sync error logged but user never notified | `lib/workoutStorage.ts:53-56` |
| D1-3 | P2 | `buildRowsFromApi` uses `Date.now()` + `Math.random()` for IDs — collision risk | `app/(tabs)/index.tsx:201` |
| D1-4 | P2 | `onEndWorkout` rollback is imperfect — calls `startWorkoutSession([title])` which may not match | `app/(tabs)/index.tsx:696-705` |
| D1-5 | P3 | `deleteWorkout` in `workoutStorage.ts` only deletes locally — never calls API | `lib/workoutStorage.ts:59-63` |

### D2: Authentication & Security
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D2-1 | P1 | Unauthenticated `chat`, `parse`, `observability` endpoints | `supabase/functions/chat/`, `parse/`, `observability/` |
| D2-2 | P1 | IDOR: `remove_tracked`/`toggle_tracked` missing `user_id` filter | `supabase/functions/pr-tracking/index.ts:218-258` |
| D2-3 | P2 | IDOR: `items` action fetches template items without ownership check | `supabase/functions/workout-templates/index.ts:92-118` |
| D2-4 | P2 | Unbounded profile update — no field allowlist | `supabase/functions/profile/index.ts:164-171` |
| D2-5 | P2 | Wildcard CORS `*` on all edge functions | All `supabase/functions/*/index.ts` |
| D2-6 | P3 | Token refresh race condition — no mutex on concurrent `refreshSession()` | `lib/auth.ts:8-76` |
| D2-7 | P3 | Error messages leak DB schema + OpenAI internals | Multiple edge functions |
| D2-8 | P3 | JWT tokens stored in unencrypted AsyncStorage | `lib/supabase.ts:11` |

### D3: Performance & Resource Management
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D3-1 | P2 | Zero `React.memo` usage across entire codebase | All components |
| D3-2 | P2 | No AbortController on any fetch call — cancelled requests run to completion | `lib/api.ts` |
| D3-3 | P2 | `checkForPR` makes 2 network round-trips per set logged (fetchTrackedLifts + fetchPRLifts) | `lib/prTracking.ts:31-46` |
| D3-4 | P2 | Realtime subscription re-mounts when `showCelebration` ref changes | `app/(tabs)/index.tsx:141-182` |
| D3-5 | P3 | ConfettiPiece creates 30 animation instances on every PR celebration | `components/celebration/PRCelebration.tsx:160-222` |

### D4: Edge Function Reliability
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D4-1 | P1 | `log-set` returns 200 OK on failure | `supabase/functions/log-set/index.ts:86-132` |
| D4-2 | P1 | `chat`/`parse` have no auth | `supabase/functions/chat/`, `parse/` |
| D4-3 | P2 | Unbounded `history` GET — no LIMIT | `supabase/functions/history/index.ts:145-149` |
| D4-4 | P2 | Error messages leak schema/OpenAI internals | Multiple functions |
| D4-5 | P2 | Profile `update` accepts arbitrary columns | `supabase/functions/profile/index.ts:164-184` |
| D4-6 | P2 | Service-role client where user-scoped would suffice | `profile/`, `pr-tracking/`, `workout-templates/` |
| D4-7 | P2 | OpenAI JSON.parse crash on malformed response | `supabase/functions/chat/index.ts:120` |
| D4-8 | P2 | `chats` function routes never match — entirely non-functional | `supabase/functions/chats/index.ts:161-174` |

### D5: UI/UX Consistency
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D5-1 | P0 | History detail: 20+ hardcoded light-mode colors | `app/history/[id].tsx:197-376` |
| D5-2 | P0 | WorkoutCard: edit input, labels, notes all hardcoded | `components/workout/WorkoutCard.tsx` |
| D5-3 | P1 | WorkoutBottomBar: buttons invisible in dark mode | `components/workout/WorkoutBottomBar.tsx` |
| D5-4 | P1 | Chats screen: 14 hardcoded colors | `app/chats.tsx` |
| D5-5 | P1 | History load/delete: silent catch blocks | `app/(tabs)/history.tsx:62-90` |
| D5-6 | P2 | Auth screens: `Colors.light.icon` regardless of theme | `app/auth/sign-in.tsx`, `sign-up.tsx` |
| D5-7 | P2 | CoachModal/SessionReviewModal: `#111827` buttons invisible | `components/modals/CoachModal.tsx`, `SessionReviewModal.tsx` |
| D5-8 | P3 | DeleteWorkoutModal: stale hardcoded defaults | `components/modals/DeleteWorkoutModal.tsx` |

### D6: Cross-Cutting Concerns
| ID | Sev | Issue | File |
|----|-----|-------|------|
| D6-1 | P1 | Hardcoded Supabase URL + anon key in source | `lib/supabase.ts:6-7` |
| D6-2 | P2 | 53 `as any` type assertions (17 non-router) | 22 files |
| D6-3 | P2 | Dead exports: 5 functions + 4 constants never imported | `lib/prTracking.ts`, `lib/authLock.ts` |
| D6-4 | P2 | 4 zombie dependencies (`expo-crypto`, `expo-image`, `expo-system-ui`, `react-native-worklets`) | `package.json` |
| D6-5 | P2 | 61 `console.log` in production paths (only 7 gated behind `__DEV__`) | 22 files |
| D6-6 | P3 | `expo-constants`/`expo-font` appear unused but are framework deps | `package.json` |
| D6-7 | P3 | Inline Realtime subscription duplicates `subscribeToPRBreakthroughs` | `app/(tabs)/index.tsx` vs `lib/prTracking.ts` |

---

## RECOMMENDED FIX ORDER

**Sprint 1 — Security Hardening (P0/P1)**
1. Add JWT auth to `chat`, `parse`, `observability` edge functions
2. Fix IDOR: add `.eq("user_id", userId)` to pr-tracking mutations
3. Fix `log-set` to return proper error status codes
4. Add field allowlist to profile `update` action
5. Fix stale closure in `fill_skeleton` PR check

**Sprint 2 — Dark Mode Sweep (P0/P1)**
6. Fix `app/history/[id].tsx` theme colors
7. Fix `components/workout/WorkoutCard.tsx` theme colors
8. Fix `components/workout/WorkoutBottomBar.tsx` theme colors
9. Fix `app/chats.tsx` theme colors
10. Fix modal buttons (`CoachModal`, `SessionReviewModal`)
11. Fix auth screen borders/placeholders

**Sprint 3 — Reliability (P2)**
12. Fix `chats` edge function routing
13. Add `.limit()` to history and pr_history queries
14. Add error feedback to history load/delete
15. Sanitize error messages across all edge functions
16. Add `JSON.parse` safety in chat function

**Sprint 4 — Cleanup (P2/P3)**
17. Remove 4 zombie dependencies
18. Clean up dead exports in prTracking and authLock
19. Gate `console.log` behind `__DEV__` or use logging abstraction
20. Fix `as any` assertions for non-router usage

---

## VERIFICATION

After fixes are applied:
1. `npx expo start --clear` — app compiles without errors
2. Toggle dark mode in Settings — all screens render correctly
3. Log a set for a tracked PR lift — celebration fires, set saved to DB
4. Check Supabase Edge Function logs for proper error responses
5. Attempt unauthenticated API call — should get 401
6. `npm install` succeeds with cleaned dependencies
7. Grep for remaining hardcoded hex colors in `.tsx` files — zero outside theme constants

---

## ARTIFACTS

- **Full prompt template:** `docs/plans/qa_deep_dive_prompt.md`
- **This report:** `docs/plans/qa_plan.md`
- **Existing 5-issue plan:** `docs/plans/onboarding_backend_agent.md`
