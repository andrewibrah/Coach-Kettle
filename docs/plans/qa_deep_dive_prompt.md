# Coach Kettle — QA Deep-Dive & Bug Audit Prompt

> **Purpose:** Systematic prompt-engineered template for autonomous codebase auditing across 6 quality dimensions.
> **Method:** Chain-of-thought decomposition + structured evidence collection + severity classification.

---

## META-INSTRUCTIONS (For Auditing Agent)

You are a **Senior DevOps/Software Reliability Engineer** performing a systematic quality audit of the Coach Kettle codebase — an Expo/React Native workout tracker with a Supabase backend.

### Reasoning Protocol

For each finding, follow this chain:

```
1. OBSERVE  → What specific code/pattern did you see?
2. HYPOTHESIZE → What could go wrong and under what conditions?
3. VERIFY   → Trace the data flow / call chain to confirm
4. CLASSIFY → Severity (P0-Critical / P1-High / P2-Medium / P3-Low)
5. EVIDENCE → File path, line numbers, code snippet
6. IMPACT   → What user-facing behavior results?
7. FIX      → Concrete, minimal change with rationale
```

### Severity Definitions

| Level | Definition | Example |
|-------|-----------|---------|
| **P0-Critical** | Data loss, auth bypass, crash in happy path | Workout data silently dropped |
| **P1-High** | Feature broken, security weakness, silent failure | PR celebration never fires |
| **P2-Medium** | Degraded UX, performance issue, inconsistency | Dark mode broken on one screen |
| **P3-Low** | Code smell, minor UX nit, tech debt | Unused import, hardcoded string |

### Output Schema (Per Finding)

```
### [DIMENSION]-[NUMBER]: <Title>
- **Severity:** P0/P1/P2/P3
- **File(s):** `path/to/file.ts` (lines X-Y)
- **Observation:** <What you saw>
- **Root Cause:** <Why it's wrong>
- **Impact:** <User-facing consequence>
- **Evidence:** <Code snippet or trace>
- **Fix:** <Specific change>
- **Regression Risk:** Low/Medium/High
```

---

## AUDIT DIMENSIONS

### DIMENSION 1: Data Integrity & State Management

**Audit targets:**
- `lib/workoutStorage.ts` — AsyncStorage ↔ Supabase sync
- `hooks/useWorkoutSession.ts` — Session state lifecycle
- `hooks/useRowActions.ts` — Row CRUD operations
- `app/(tabs)/index.tsx` — Main screen state orchestration
- `lib/api.ts` — API call error handling & response parsing

**Check for:**
- [ ] Race conditions between local save and remote sync
- [ ] Lost writes during concurrent operations (e.g., rapid set logging)
- [ ] Missing error handling on `fetch()` calls (no `.ok` check, no try/catch)
- [ ] Stale closure bugs in `useCallback`/`useEffect` dependency arrays
- [ ] Optimistic updates that don't rollback on failure
- [ ] `commitPendingAndGet()` calls missing before API operations
- [ ] JSON parse failures on malformed API responses
- [ ] Undefined/null access on optional fields (LogRow.status, WorkoutSession.review)
- [ ] State updates after unmount (memory leaks in async operations)
- [ ] Duplicate IDs in workout rows

### DIMENSION 2: Authentication & Security

**Audit targets:**
- `lib/auth.ts` — JWT management, token refresh
- `lib/authLock.ts` — Session TTL
- `components/AuthProvider.tsx` — Auth state + context
- `lib/supabase.ts` — Client initialization
- All edge functions in `supabase/functions/*/index.ts`

**Check for:**
- [ ] JWT expiry edge case: what happens if token expires mid-request?
- [ ] Race condition in `refreshSession()` — multiple concurrent refreshes?
- [ ] Missing auth header check in any edge function
- [ ] Service role key exposure (should never appear in client code)
- [ ] RLS bypass potential — any edge function using admin client where user client would suffice?
- [ ] Missing `user_id` scoping in database queries (data leak across users)
- [ ] CORS misconfiguration (wildcard `*` in production)
- [ ] Input validation gaps in edge functions (missing body fields, type coercion)
- [ ] Error messages leaking internal details (stack traces, DB schema)
- [ ] Token stored insecurely (check AsyncStorage usage for tokens)

### DIMENSION 3: Performance & Resource Management

**Audit targets:**
- `app/(tabs)/index.tsx` — Re-render frequency
- `app/(tabs)/history.tsx` — List rendering
- `hooks/*.ts` — Memoization correctness
- `lib/api.ts` — Network efficiency
- `lib/structuredGate.ts` — Parsing performance

**Check for:**
- [ ] Missing `useMemo`/`useCallback` causing unnecessary re-renders
- [ ] FlatList missing `keyExtractor`, `getItemLayout`, or using inline functions in `renderItem`
- [ ] Large component re-renders on unrelated state changes (missing React.memo)
- [ ] N+1 API calls (loops calling API instead of batch)
- [ ] Missing abort controllers for cancelled requests
- [ ] Memory leaks: subscriptions/listeners not cleaned up in useEffect returns
- [ ] Expensive computations on render path (e.g., sorting/filtering without memoization)
- [ ] Bundle size: unnecessarily large imports (lodash full vs. lodash/pick)
- [ ] Image optimization (if applicable)
- [ ] Realtime subscription leaks — channels not unsubscribed on unmount

### DIMENSION 4: Edge Function Reliability

**Audit targets:**
- Every file in `supabase/functions/*/index.ts`

**Check for:**
- [ ] Missing CORS headers on error responses
- [ ] Unhandled promise rejections
- [ ] Missing request body validation
- [ ] SQL injection via string interpolation (vs parameterized queries)
- [ ] Missing `OPTIONS` preflight handling
- [ ] Error responses not following consistent schema
- [ ] Streaming response error handling (coach function)
- [ ] OpenAI API key not validated before use
- [ ] Timeout handling for external API calls (OpenAI)
- [ ] Response size unbounded (no pagination on list endpoints)

### DIMENSION 5: UI/UX Consistency & Correctness

**Audit targets:**
- All files in `app/` directory
- `components/ui/` — Themed components
- `constants/theme.ts` — Color definitions
- `hooks/use-theme-color.ts`

**Check for:**
- [ ] Hardcoded colors (hex values outside theme system)
- [ ] Missing `useThemeColor()` calls
- [ ] Keyboard handling: does the keyboard dismiss properly? Input overlap?
- [ ] Loading states: are all async operations covered with loading indicators?
- [ ] Empty states: what shows when there's no data?
- [ ] Error states: are errors shown to users or swallowed silently?
- [ ] Accessibility: missing `accessibilityLabel`, `accessibilityRole`
- [ ] Safe area handling: content behind notch/home indicator?
- [ ] Platform-specific issues (iOS vs Android rendering differences)
- [ ] Touch target sizes (minimum 44x44 for gym-friendly tapping)

### DIMENSION 6: Cross-Cutting Concerns

**Audit targets:**
- `package.json` — Dependencies
- `tsconfig.json` — TypeScript strictness
- `app.json` — Expo config
- All `import` statements

**Check for:**
- [ ] Unused dependencies in package.json
- [ ] Missing TypeScript strict mode flags
- [ ] Circular import chains
- [ ] Dead code (exported functions never imported elsewhere)
- [ ] Console.log statements left in production code
- [ ] TODO/FIXME/HACK comments indicating unfinished work
- [ ] Version pinning issues (^ vs exact in package.json)
- [ ] Environment variable handling (missing fallbacks, .env in gitignore?)

---

## PRIORITY HEURISTIC

**Report findings in this order:**
1. P0 bugs that cause data loss or security issues → fix immediately
2. P1 bugs that break user-facing features → fix before next release
3. P2 issues that degrade experience → schedule for sprint
4. P3 code quality items → backlog

**For each dimension:** Report top 5 findings maximum. Depth over breadth.

---

## ANTI-PATTERNS TO SPECIFICALLY HUNT

These are known failure modes in React Native + Supabase stacks:

1. **The Stale Closure Trap:** `useCallback`/`useEffect` referencing state variables not in dependency array
2. **The Fire-and-Forget:** `fetch()` calls with no error handling, no `.ok` check
3. **The Zombie Subscription:** Realtime channels or event listeners not cleaned up
4. **The Race Condition:** Multiple rapid state updates that overwrite each other
5. **The Silent Swallow:** `catch(e) {}` or `catch(e) { console.log(e) }` with no user feedback
6. **The Type Lie:** TypeScript `as any` or `!` assertions hiding real null checks
7. **The Render Bomb:** Parent state change re-rendering expensive child trees
8. **The Orphan Mutation:** Database writes with no corresponding local state update
9. **The Auth Gap:** Endpoints or operations that don't verify the current user
10. **The Theme Hole:** Screens/components that bypass the theme system
