# Profile & PR Tracking Feature - Implementation Plan

## Overview

This document outlines the complete implementation plan for the Profile Quiz, PR Tracking, and Workout Regimen features. The goal is to create an engaging onboarding experience that captures user fitness data, enables autonomous personal record tracking, and provides customizable workout templates.

---

## Requirements Analysis

### Original User Requirements

| Requirement | Description | Priority |
|-------------|-------------|----------|
| Profile Quiz | 5-10 minute onboarding quiz after account creation or first login | Critical |
| Quiz Timing | Triggered immediately after signup OR on next login for existing users | Critical |
| Skip Button | Every question must have a skip option | Critical |
| Engaging UX | Special, engaging experience during quiz (not just forms) | High |
| Settings Access | All answers editable in user settings | Critical |
| AI Context | Profile data accessible to AI coaching features | High |
| PR Section | Separate "PR" section in settings (not under Profile) | High |
| PR Contents | Tracked lift names, current PR, history/breakthroughs | High |
| Real-time PR Tracking | Autonomous detection when user beats a PR during workout logging | Critical |
| Celebration Effects | Special effects when PR is broken | High |
| Workout Regimens | User-defined workout templates with lift/sets/reps | Medium |
| Supabase Ready | All DB schemas and functions deployable via Supabase CLI | Critical |

### Quiz Questions Breakdown

| # | Question | Input Type | Skip? | Storage |
|---|----------|------------|-------|---------|
| 1 | Height | Number + Unit picker (cm/in) | Yes | `profiles.height_value`, `profiles.height_unit` |
| 2 | Age | Number or DOB picker | Yes | `profiles.dob` |
| 3 | Current Weight | Number + Unit picker (lb/kg) | Yes | `profiles.current_weight`, `profiles.weight_unit` |
| 4 | Goal Weight | Number + Unit picker (lb/kg) | Yes | `profiles.goal_weight` |
| 5 | Focus | Single select: Strength, Lean Muscle, Fat Loss, Other | Yes | `profiles.focus`, `profiles.focus_other` |
| 6 | PR Lifts | Multi-add list of exercise names | Yes | `pr_tracked_lifts` table |
| 7 | Current PRs | For each lift in #6: Weight + Reps | Yes (per lift) | `pr_lifts` table |
| 8 | Workout Regimens | Multi-step: Name -> Lifts (one at a time) -> Done | Yes | `workout_templates`, `workout_template_items` |

---

## Gap Analysis: User Requirements vs ChatGPT Outline

### Aligned Elements (Keep As-Is)

- Gate logic for quiz triggering (new accounts + existing accounts on next login)
- Progress bar UX with step indicators
- Per-question skip functionality
- DB schema design (profiles, pr_tracked_lifts, pr_lifts, pr_history, workout_templates)
- RLS policies for user data isolation
- Trigger-based PR auto-detection on exercise_log insert
- AI context refresh via RPC function
- Epley 1RM formula for PR comparison

### Gaps & Adjustments Required

| Area | ChatGPT Suggested | Required Adjustment |
|------|-------------------|---------------------|
| Quiz UX | "Micro-feedback after each step" | Expand: Add animated transitions between steps, progress persistence, visual feedback for input validation |
| PR Celebration | "Confetti burst" | Spec required: Define exact celebration animation, duration, sound/haptic patterns |
| Settings Structure | Profile + PR as separate sections | Confirmed requirement - implement as distinct navigation items |
| Workout Input UX | One lift at a time with visible list | Add: Clear "Add Next" vs "Done" distinction, real-time list preview |
| AI Context | Compact JSON snapshot | Add: Define refresh triggers (on quiz complete, on settings change, on PR update) |
| exercise_logs Integration | New table assumed | **Critical**: Must integrate with existing `workout_log` table OR create new `exercise_logs` table with migration strategy |

### Critical Decision Point

The existing `workout_log` table already captures exercise data:
```sql
workout_log: workout_id, workout_date, exercise, set_number, weight_lbs, reps, notes, user_id
```

**Options:**
1. **Reuse `workout_log`**: Add trigger to existing table for PR detection
2. **New `exercise_logs`**: Create separate table as ChatGPT suggested

**Recommendation**: Option 1 - Reuse `workout_log`. This avoids data duplication and works with existing workout logging flow. The PR trigger will listen to this table instead.

---

## Implementation Phases

### Phase 1: Database Foundation
**Objective**: Create all Supabase tables, functions, triggers, and RLS policies

#### 1.1 New Tables to Create

```
profiles              - User profile data + onboarding state
pr_tracked_lifts      - Which lifts user wants to track PRs for
pr_lifts              - Current best PR per tracked lift
pr_history            - Historical breakthroughs timeline
workout_templates     - User-defined workout routines
workout_template_items - Lifts within each template
```

#### 1.2 Modifications to Existing Tables

```
workout_log           - Add trigger for PR detection (no schema change needed)
```

#### 1.3 Functions to Create

```
epley_1rm(weight, reps)           - Calculate estimated 1RM
update_pr_from_workout_log()      - Trigger function for PR detection
refresh_ai_context()              - Update profiles.ai_context JSON
create_profile_for_user()         - Auto-create profile row on signup
```

#### 1.4 Deliverables

- [ ] Migration file: `supabase/migrations/YYYYMMDDHHMMSS_profile_pr_workouts.sql`
- [ ] All tables with proper constraints and indexes
- [ ] RLS policies for each table
- [ ] Triggers installed
- [ ] Functions created
- [ ] Verified with `supabase db push`

---

### Phase 2: Onboarding Gate Logic
**Objective**: Intercept users after auth and route to quiz if needed

#### 2.1 Auth Flow Modification Points

| File | Current Behavior | New Behavior |
|------|------------------|--------------|
| `app/(tabs)/_layout.tsx` | Checks session + isLocked | Add: Check `onboarding_completed` |
| `components/AuthProvider.tsx` | Provides session context | Add: Fetch profile, provide `needsOnboarding` |
| `app/auth/sign-up.tsx` | Redirects to `/(tabs)` | Keep as-is (gate handles redirect) |
| `app/auth/sign-in.tsx` | Redirects to `/(tabs)` | Keep as-is (gate handles redirect) |

#### 2.2 New Route Structure

```
app/
  onboarding/
    _layout.tsx          - Stack layout for quiz screens
    index.tsx            - Quiz controller/router
    height.tsx           - Step 1
    age.tsx              - Step 2
    current-weight.tsx   - Step 3
    goal-weight.tsx      - Step 4
    focus.tsx            - Step 5
    pr-lifts.tsx         - Step 6
    pr-values.tsx        - Step 7 (dynamic per lift)
    workout-setup.tsx    - Step 8
    complete.tsx         - Completion animation
```

#### 2.3 Gate Logic Flow

```
User authenticates
       ↓
AuthProvider fetches profile
       ↓
profile.onboarding_completed?
       ├── true  → Proceed to /(tabs)
       └── false → Redirect to /onboarding
```

#### 2.4 Deliverables

- [ ] `ProfileProvider` component (or extend AuthProvider)
- [ ] Profile fetch on auth state change
- [ ] Gate logic in TabLayout
- [ ] Redirect to `/onboarding` when needed
- [ ] Handle edge case: profile row doesn't exist (create it)

---

### Phase 3: Quiz UI Components
**Objective**: Build engaging, step-by-step quiz experience

#### 3.1 Shared Quiz Components

| Component | Purpose |
|-----------|---------|
| `QuizProgress` | Top progress bar showing current step |
| `QuizContainer` | Standard layout wrapper with animations |
| `QuizQuestion` | Large question text display |
| `QuizSkipButton` | Consistent skip button (bottom-right) |
| `QuizContinueButton` | Primary action button |
| `QuizInput` | Styled text/number input |
| `QuizPicker` | Unit selector (cm/in, lb/kg) |
| `QuizOptionList` | Single/multi-select options |
| `QuizLiftAdder` | Add lift name to list |
| `QuizLiftList` | Display added lifts with remove option |

#### 3.2 Animation Specifications

| Transition | Animation |
|------------|-----------|
| Between steps | Slide left (forward) / Slide right (back) |
| Input focus | Subtle scale-up (1.02x) |
| Skip pressed | Fade + slide to next |
| Continue pressed | Scale pulse + slide to next |
| Error state | Shake animation |
| Completion | Confetti-lite + checkmark animation |

#### 3.3 Haptic Feedback

| Action | Haptic |
|--------|--------|
| Step complete | Light impact |
| Skip pressed | Light impact |
| Invalid input | Error notification |
| Quiz complete | Success notification |

#### 3.4 Deliverables

- [ ] All shared quiz components in `components/onboarding/`
- [ ] Animated transitions using `react-native-reanimated`
- [ ] Haptic integration using `expo-haptics`
- [ ] Quiz state management (context or local)
- [ ] Progress persistence to prevent data loss on app close

---

### Phase 4: Quiz Screens Implementation
**Objective**: Build each quiz step screen

#### 4.1 Screen Specifications

**Step 1: Height**
- Input: Number field
- Unit: Toggle (cm / inches)
- Validation: Reasonable range (50-300cm / 20-120in)
- Skip: Stores null

**Step 2: Age**
- Input: Date picker (DOB) or number (age)
- Recommendation: DOB (age auto-calculates)
- Validation: Born after 1900, at least 13 years old
- Skip: Stores null

**Step 3: Current Weight**
- Input: Number field
- Unit: Toggle (lb / kg)
- Validation: Reasonable range (50-1000lb / 20-450kg)
- Skip: Stores null

**Step 4: Goal Weight**
- Input: Number field
- Unit: Inherit from step 3
- Validation: Same as current weight
- Skip: Stores null

**Step 5: Focus**
- Input: Single-select cards
- Options: Strength, Lean Muscle, Fat Loss, Other
- If "Other": Show text input for custom focus
- Skip: Stores null

**Step 6: PR Lifts to Track**
- Input: Text field + "Add" button
- Display: List of added lifts with remove option
- Common suggestions: Bench Press, Squat, Deadlift, OHP, Barbell Row
- Skip: Empty list (no PR tracking)

**Step 7: Current PR Values**
- Dynamic: One sub-step per lift from step 6
- Input: Weight + Reps fields
- Skip: Skippable per-lift
- If no lifts in step 6: Skip entirely

**Step 8: Workout Regimens**
- Initial prompt: "Do you have workout routines? Yes/Skip"
- If Yes:
  - Step 8a: "Name this workout" (text input)
  - Step 8b: Add lifts one at a time
    - Lift name (text)
    - Number of sets (number)
    - Target reps (number)
    - "Add to workout" button
    - Display: Growing list of added lifts
  - Step 8c: "Add another workout?" or "Done"
- Skip: No templates created

**Completion Screen**
- Animation: Checkmark + subtle confetti
- Message: "You're all set!"
- Auto-redirect to `/(tabs)` after 2 seconds
- Or "Continue" button

#### 4.2 Deliverables

- [ ] All 8+ screen files in `app/onboarding/`
- [ ] Input validation per screen
- [ ] State persistence between screens
- [ ] Proper keyboard handling (KeyboardAvoidingView)
- [ ] Back navigation to previous step
- [ ] Skip logic per screen
- [ ] Final commit: `profiles.onboarding_completed = true`
- [ ] Call `refresh_ai_context()` on completion

---

### Phase 5: Settings Integration
**Objective**: Add Profile and PR sections to Settings

#### 5.1 Settings Structure Update

Current settings.tsx sections:
```
Account (email display)
Appearance (dark mode, theme)
Security (biometrics)
Data (clear cache)
Account Actions (logout)
```

New structure:
```
Account (email display)
Profile (NEW - edit quiz answers)
PR Tracking (NEW - manage tracked lifts)
Appearance (dark mode, theme)
Security (biometrics)
Data (clear cache)
Account Actions (logout)
```

#### 5.2 Profile Settings Screen

Route: `app/settings/profile.tsx` (or modal)

| Field | Display | Edit Control |
|-------|---------|--------------|
| Height | "5'10" (178 cm)" | Number + unit picker |
| Age/DOB | "28 years old" | Date picker |
| Current Weight | "180 lbs" | Number + unit |
| Goal Weight | "170 lbs" | Number + unit |
| Focus | "Lean Muscle" | Option picker |

- Save button commits changes to `profiles` table
- Call `refresh_ai_context()` after save

#### 5.3 PR Tracking Settings Screen

Route: `app/settings/pr-tracking.tsx` (or modal)

**Section: Tracked Lifts**
- List of lifts with toggle (active/inactive)
- "Add New Lift" button
- Remove lift option (with confirmation)

**Section: Current Records**
- Per lift:
  - Lift name
  - Current PR: "260 lbs x 1 rep"
  - Estimated 1RM: "260 lbs"
  - Last updated: "Jan 15, 2026"
  - "View History" link

**Section: PR History** (per lift)
- Timeline of breakthroughs
- Each entry: Date, Weight x Reps, E1RM
- Visual graph option (stretch goal)

#### 5.4 Deliverables

- [ ] Profile settings screen
- [ ] PR tracking settings screen
- [ ] PR history view
- [ ] Navigation from main settings
- [ ] Edit functionality with validation
- [ ] Save to Supabase with optimistic UI
- [ ] Refresh AI context on changes

---

### Phase 6: Real-time PR Detection
**Objective**: Automatically detect and celebrate PRs during workout logging

#### 6.1 PR Detection Flow

```
User logs set via existing workout flow
       ↓
Insert into workout_log table
       ↓
Trigger: update_pr_from_workout_log() fires
       ↓
Check: Is this lift in pr_tracked_lifts (active)?
       ├── No  → Exit
       └── Yes → Continue
       ↓
Calculate new E1RM using epley_1rm()
       ↓
Compare to current best in pr_lifts
       ├── Not better → Exit
       └── Is better  → Continue
       ↓
Update pr_lifts with new best
       ↓
Insert into pr_history
       ↓
pg_notify('pr_breakthrough', {details})
       ↓
Client receives notification
       ↓
Display celebration UI
```

#### 6.2 Client-Side Detection Options

**Option A: Supabase Realtime (Recommended)**
- Subscribe to `pr_history` inserts for current user
- On new row: Trigger celebration

**Option B: Post-Insert Query**
- After workout log save succeeds
- Query `pr_lifts` for that lift
- Compare locally
- If improved: Trigger celebration

**Recommendation**: Implement Option B first (simpler), add Option A later for real-time UX.

#### 6.3 Celebration UI Specification

| Element | Specification |
|---------|---------------|
| Overlay | Semi-transparent dark background |
| Animation | Confetti burst from center |
| Duration | 3 seconds |
| Banner | "NEW PR!" with lift name |
| Details | "Bench Press: 260 lbs x 1" |
| Sound | Optional celebratory sound effect |
| Haptic | Success notification pattern |
| Dismiss | Tap anywhere or auto-dismiss after 3s |

#### 6.4 Deliverables

- [ ] PR detection trigger on `workout_log` table
- [ ] Client subscription OR post-insert check
- [ ] Celebration overlay component
- [ ] Confetti animation
- [ ] Haptic feedback
- [ ] Integration with existing workout logging flow
- [ ] Proper cleanup (prevent multiple celebrations)

---

### Phase 7: AI Context Integration
**Objective**: Make profile data available to AI coaching features

#### 7.1 AI Context Schema

```json
{
  "height": { "value": 178, "unit": "cm" },
  "dob": "1997-05-15",
  "current_weight": { "value": 180, "unit": "lb" },
  "goal_weight": { "value": 170, "unit": "lb" },
  "focus": { "type": "lean_muscle", "other": null },
  "tracked_pr_lifts": [
    { "lift": "Bench Press", "active": true },
    { "lift": "Squat", "active": true }
  ],
  "current_prs": [
    {
      "lift": "Bench Press",
      "best": { "weight": 260, "reps": 1, "unit": "lb", "e1rm": 260 },
      "updated_at": "2026-01-15T..."
    }
  ],
  "workout_templates": [
    { "id": "uuid", "name": "Push Day" }
  ]
}
```

#### 7.2 Context Refresh Triggers

| Event | Action |
|-------|--------|
| Quiz completed | Call `refresh_ai_context()` |
| Profile edited in settings | Call `refresh_ai_context()` |
| PR tracking settings changed | Call `refresh_ai_context()` |
| New PR detected | Auto-refresh via trigger (optional) |

#### 7.3 AI Prompt Integration

Location: `lib/api.ts` (or wherever AI calls are made)

```typescript
// Pseudocode
async function getAICoachResponse(userMessage: string) {
  const profile = await getProfile(userId);
  const aiContext = profile.ai_context;

  const systemPrompt = `
    You are a fitness coach. User profile:
    - Height: ${aiContext.height.value}${aiContext.height.unit}
    - Current weight: ${aiContext.current_weight.value}${aiContext.current_weight.unit}
    - Goal: ${aiContext.focus.type}
    - Current PRs: ${JSON.stringify(aiContext.current_prs)}

    Provide personalized advice based on this context.
  `;

  // Send to AI...
}
```

#### 7.4 Deliverables

- [ ] `refresh_ai_context()` RPC function
- [ ] Client-side refresh calls at appropriate triggers
- [ ] AI prompt builder that includes context
- [ ] Test AI responses include personalization

---

## Database Schema Reference

### Full Migration SQL

The complete migration file should be created at:
`supabase/migrations/YYYYMMDDHHMMSS_profile_pr_workouts.sql`

**Tables:**
- `profiles` - Core user profile with onboarding state
- `pr_tracked_lifts` - Which lifts to monitor for PRs
- `pr_lifts` - Current best for each tracked lift
- `pr_history` - Historical PR breakthroughs
- `workout_templates` - User workout routine definitions
- `workout_template_items` - Exercises within templates

**Functions:**
- `set_updated_at()` - Auto-update timestamps
- `epley_1rm(weight, reps)` - Calculate estimated 1RM
- `update_pr_from_workout_log()` - PR detection trigger function
- `refresh_ai_context()` - Rebuild AI context JSON

**Triggers:**
- `trg_profiles_updated_at` - On profiles update
- `trg_workout_templates_updated_at` - On templates update
- `trg_pr_lifts_updated_at` - On PR update
- `trg_update_pr_from_workout_log` - After workout_log insert

**RLS Policies:**
- All tables: SELECT/INSERT/UPDATE/DELETE own data only
- Based on `auth.uid() = user_id`

---

## File Structure Reference

### New Files to Create

```
app/
  onboarding/
    _layout.tsx
    index.tsx
    height.tsx
    age.tsx
    current-weight.tsx
    goal-weight.tsx
    focus.tsx
    pr-lifts.tsx
    pr-values.tsx
    workout-setup.tsx
    complete.tsx
  settings/
    profile.tsx
    pr-tracking.tsx

components/
  onboarding/
    QuizProgress.tsx
    QuizContainer.tsx
    QuizQuestion.tsx
    QuizSkipButton.tsx
    QuizContinueButton.tsx
    QuizInput.tsx
    QuizPicker.tsx
    QuizOptionList.tsx
    QuizLiftAdder.tsx
    QuizLiftList.tsx
  celebration/
    PRCelebration.tsx
    Confetti.tsx

contexts/
  ProfileContext.tsx    (or extend AuthProvider)

lib/
  profile.ts            (profile API functions)
  prTracking.ts         (PR detection utilities)

supabase/
  migrations/
    YYYYMMDDHHMMSS_profile_pr_workouts.sql
```

### Files to Modify

```
app/(tabs)/_layout.tsx          - Add onboarding gate
components/AuthProvider.tsx     - Add profile fetch
app/(tabs)/settings.tsx         - Add Profile/PR sections
lib/api.ts                      - Add AI context integration
```

---

## Phase Summary & Dependencies

```
Phase 1: Database Foundation
    ↓ (no dependencies)
Phase 2: Onboarding Gate Logic
    ↓ (depends on Phase 1)
Phase 3: Quiz UI Components
    ↓ (can parallel with Phase 2)
Phase 4: Quiz Screens Implementation
    ↓ (depends on Phase 2, 3)
Phase 5: Settings Integration
    ↓ (depends on Phase 1, can parallel with 4)
Phase 6: Real-time PR Detection
    ↓ (depends on Phase 1, 4)
Phase 7: AI Context Integration
    ↓ (depends on Phase 1, 6)
```

**Parallelization Opportunity:**
- Phase 3 + Phase 5 can run concurrently
- Phase 6 can start once Phase 1 is done (frontend part once Phase 4 done)

---

## Testing Checklist

### Phase 1: Database
- [ ] Tables created successfully
- [ ] RLS policies block cross-user access
- [ ] Triggers fire correctly
- [ ] Functions return expected values
- [ ] Migration rollback works

### Phase 2: Gate Logic
- [ ] New users routed to onboarding
- [ ] Existing users without profile routed to onboarding
- [ ] Completed users go to main app
- [ ] Logout + login respects onboarding state

### Phase 3-4: Quiz
- [ ] All steps navigable forward/back
- [ ] Skip works on all questions
- [ ] Data persists between steps
- [ ] App close/resume doesn't lose progress
- [ ] Completion sets onboarding_completed = true
- [ ] All data saved to correct tables

### Phase 5: Settings
- [ ] Profile data displays correctly
- [ ] Edits save successfully
- [ ] PR tracking list accurate
- [ ] PR history displays
- [ ] Changes reflect in AI context

### Phase 6: PR Detection
- [ ] PR detected on workout log entry
- [ ] Celebration shows for new PRs
- [ ] No celebration for non-tracked lifts
- [ ] No celebration for non-improvements
- [ ] History entry created

### Phase 7: AI Integration
- [ ] AI context JSON populated
- [ ] Refreshes on profile change
- [ ] AI responses include personalization

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Existing users lose workout data | Migration only adds tables, no modifications to existing data |
| Quiz abandonment | Persist progress to AsyncStorage, resume on return |
| PR detection performance | Efficient trigger with indexed lookups |
| AI context bloat | Compact JSON schema, only essential fields |
| Migration failures | Test in staging first, prepare rollback script |

---

## Success Criteria

1. **Onboarding Completion Rate**: >80% of users complete quiz (skip counts as complete)
2. **PR Detection Accuracy**: 100% of valid PRs detected and celebrated
3. **Settings Usability**: Users can edit all quiz answers without friction
4. **AI Personalization**: AI responses reference user profile data
5. **Performance**: No perceptible delay in workout logging with PR detection

---

## Appendix: ChatGPT SQL Reference

The ChatGPT-provided SQL migration is included as a starting reference. Key adjustments needed:

1. **Change `exercise_logs` references to `workout_log`** - Use existing table
2. **Adjust trigger function** to match `workout_log` schema (column names differ)
3. **Verify `auth.uid()` syntax** works with current Supabase version
4. **Test `pg_notify`** for realtime integration

The SQL provides a solid foundation but requires adaptation to the existing codebase.
