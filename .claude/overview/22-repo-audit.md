# Repo audit — reality check

> Evidence-based audit of the current repo state. Read this before major feature work.

---

## Scope and evidence

Inspected:
- Repo guidance: `AGENTS.md`, `CLAUDE.md`, `docs/ai/feature-map.md`, `docs/ai/dev-workflow.md`
- App shell: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/settings/index.tsx`
- Key product systems: nutrition, coaching, programming, progress, notifications, workout history
- Backend surfaces: `supabase/functions/**`, `supabase/migrations/**`

Verification run on the app codebase:
- `npm run lint` ✅
- `npx tsc --noEmit` ✅

Repo size snapshot:
- ~212 tracked product files across app/components/contexts/hooks/lib/functions/migrations/types
- ~22k lines `.tsx`, ~13k lines `.ts`, ~4k lines `.sql`

---

## Blunt verdict

This repo is not a toy and not a mess, but it is strategically split-brain.

It has real product depth in training, nutrition, coaching, and progression. The problem is not lack of systems. The problem is that product clarity, navigation, and trust have not kept up with system growth.

The team has been building capability faster than operating coherence.

---

## What is gold

### 1. The app has real domain depth
This is not fake SaaS dressing. The repo has meaningful fitness-specific systems:
- workout logging + history
- programming engine + next-set suggestions
- nutrition targets + meal plans + food logs
- daily feedback / harshness state machine
- progress tracking + body metrics + RHR
- form-check surface

Evidence:
- `contexts/NutritionContext.tsx`
- `contexts/CoachingContext.tsx`
- `contexts/ProgramContext.tsx`
- `supabase/functions/programming/index.ts`
- `supabase/functions/daily-feedback/index.ts`
- `supabase/functions/meal-plan/index.ts`

### 2. Local-first workout capture is the right instinct
The workout product centers on immediate logging, then sync. That is a good UX decision for gyms and weak-signal environments.

Evidence:
- `lib/workoutStorage.ts`
- `hooks/useWorkoutSession.ts`

### 3. The repo mostly prefers deterministic fitness logic over vague AI fluff
A lot of the valuable behavior is rule-based, typed, and inspectable instead of being dumped onto a model.

Evidence:
- programming progression logic in `supabase/functions/programming/index.ts`
- nutrition grading in `supabase/functions/daily-feedback/index.ts`
- next-set heuristics via `supabase/migrations/0037_next_set_suggestion.sql`

### 4. Basic code health is better than average for a feature-heavy mobile app
The app currently passes lint and TypeScript. That matters because the repo is already broad.

---

## What is trash

### 1. Product discoverability is weak relative to feature count
The main tab layout only exposes `Home` and `History`, and even the tab bar is hidden.

Evidence:
- `app/(tabs)/_layout.tsx` uses only `index` and `history`
- `tabBarStyle: { display: 'none' }`

That means major product value lives behind route jumps and settings links instead of an obvious daily operating flow.

### 2. Some “shipped” surfaces still announce unfinished truth
Examples:
- `app/progress/index.tsx` shows `Workouts (7d)` as `coming soon`
- meal-plan fallback labels meals as `Auto-generated placeholder`

These are not catastrophic, but they leak unfinishedness directly into the product.

Evidence:
- `app/progress/index.tsx`
- `supabase/functions/meal-plan/index.ts`

---

## What is confused

### 1. The app identity is broader than the shell admits
The repo behaves like a fitness operating system, but the shell still behaves like a workout logger with side routes.

Current reality:
- training, nutrition, coach, progress, and program are all meaningful systems
- but the primary navigation does not present that clearly

Result:
- strong backend/domain work
- weaker habit loop and weaker product comprehension

### 2. Docs drifted behind reality
Parts of `.claude/overview/` still describe older architecture assumptions.

Examples:
- `00-architecture.md` shows an older provider stack and narrower app shape than `app/_layout.tsx`
- `06-api.md` overstates the simplicity/uniformity of the API layer; the real repo mixes edge-function calls, direct Supabase client usage, and storage operations depending on the surface

This is how agents and future maintainers make wrong changes with confidence.

---

## What was insecure

### Fixed in this audit
Several edge functions built “user-scoped” RPC clients with the service-role key plus a bearer token:
- `supabase/functions/food-log/index.ts`
- `supabase/functions/resting-hr/index.ts`
- `supabase/functions/daily-feedback/index.ts`
- `supabase/functions/next-set/index.ts`
- `supabase/functions/default-templates/index.ts`

That is the wrong pattern for user-scoped RPC calls. If a service-role client is used where auth context is expected, RLS/auth assumptions become harder to trust and easier to accidentally bypass later.

Patch applied:
- those user-scoped RPC clients now use `SUPABASE_ANON_KEY` with the user bearer token
- service-role remains only where admin behavior is actually intended

Strategic lesson:
- service-role should be treated like a scalpel, not a convenience default

---

## What is overbuilt

### 1. System breadth outran product choreography
There are many subsystems for a repo whose primary daily flow still is not unified.

Examples:
- entitlement/paywall
- harshness engine
- notifications matrix
- form analysis
- programming engine
- progress tracking
- nutrition stack

None of these are individually bad. Together, they create product sprawl when the main shell still lacks a clear “today” command center.

### 2. Settings is carrying product weight it should not carry
Important behavior is discoverable from Settings rather than from the main operating loop.

Evidence:
- `app/settings/index.tsx` is acting like a secondary product hub

That is a design smell: users should not have to think “let me go to settings to use the product.”

---

## What is underbuilt

### 1. Unified daily dashboard / command center
The repo has the pieces for a strong daily operator view, but not the actual integrated view.

Missing product layer:
- today’s workout state
- nutrition target gap
- coach directive
- next action
- progress signal

Right now those insights exist in separate screens and systems.

### 2. Trust surfaces
Some systems are good internally but do not yet explain themselves well to users.

Examples:
- programming shows week/split data, but not enough reasoning or adaptation proof
- coaching shows outputs, but not enough traceability to what drove the score
- progress has real data sources, but the home view still under-sells it

---

## What we have been doing wrong

1. Shipping systems faster than product coherence
2. Letting overview docs drift from actual code
3. Using service-role shortcuts in places that should stay user-scoped
4. Hiding major value behind routes/settings instead of the main habit loop
5. Growing backend sophistication before tightening the app’s “why open this today?” experience

---

## Current product identity

What the repo currently behaves like:
- a powerful but fragmented fitness app with several advanced subsystems

What it should behave like:
- a daily fitness operating system with one clear command center and several specialist modules

That means no destructive rewrite.
It means making the shell, trust surfaces, and sequencing finally match the strength of the backend/domain work.

---

## Grounded plan

### Phase 1 — trust and truth
1. Keep overview docs synced to real architecture
2. Remove security-footgun patterns around user-scoped Supabase clients
3. Eliminate obvious “coming soon” or placeholder truth leaks from high-visibility screens

### Phase 2 — shell coherence
1. Define the real primary loop: Today / Train / Eat / Review / Progress
2. Pull product-critical surfaces out of settings-only discovery paths
3. Decide whether `Home` is workout-first or dashboard-first, then commit

### Phase 3 — strategic leverage
1. Turn the app into a daily operating cockpit, not a drawer of tools
2. Make coaching, nutrition, and programming reinforce one another visibly
3. Add proof/explanations where automation makes decisions

---

## Changes executed in this audit

1. Inspected repo guidance, overview docs, app shell, core feature modules, and edge functions
2. Ran app verification checks (`lint`, `tsc`)
3. Patched five edge functions to use anon-key user clients for user-scoped RPC/auth-context work
4. Added this audit file so future work starts from reality instead of hype
