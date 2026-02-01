# QA Report: Backend Fix for Workout Template 500 Error

**Date**: 2026-02-01
**Component**: Supabase Edge Function (`workout-templates`)
**Issue**: HTTP 500 Error when adding items to a workout template.

## 1. Problem Statement
Users reported receiving a `500 Internal Server Error` when attempting to add a new lift to a workout template in the mobile app.
- **Log Evidence**: `ERROR [Profile] Error adding template item: 500`
- **Frontend Stack**: `addTemplateItem` in `lib/profile.ts`

## 2. Investigation & Root Cause Analysis
I analyzed the data flow between the client, the Edge Function, and the Database schema.

### A. The Schema (Truth)
Inspection of the `supabase/migrations/0022_profile_pr_workouts.sql` file revealed the definition of `workout_template_items`:

```sql
CREATE TABLE IF NOT EXISTS public.workout_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lift_name TEXT NOT NULL,
    target_sets INTEGER,
    target_reps INTEGER,
    display_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Finding**: There is **NO** `target_weight` column in this table.

### B. The Code (The Bug)
The Edge Function `supabase/functions/workout-templates/index.ts` was attempting to insert `target_weight`:

```typescript
// Previous Code
.insert({
    user_id: userId,
    template_id,
    lift_name,
    target_sets: target_sets || null,
    target_reps: target_reps || null,
    target_weight: target_weight || null, // <--- BREAKING CHANGE
    notes: notes || null,
})
```

**Root Cause**: The Edge Function code was out of sync with the Database Schema. It was trying to write to a column that does not exist, causing the Postgres database to throw an error, which the Edge Function caught and returned as a generic 500.

## 3. The Resolution

### Fix Applied
I modified `supabase/functions/workout-templates/index.ts` to remove the offending field from the insert payload.

**Diff**:
```typescript
- target_weight: target_weight || null,
+ // target_weight: target_weight || null, // Column missing in DB schema
```

### Rationale
I chose to align the code with the existing schema rather than modifying the database schema at this time.
- **Reasoning**: The current schema `0022_profile_pr_workouts.sql` is the established source of truth. Adding a column to a live database requires a migration script and careful consideration of data types. Since `target_weight` was not present in the schema, removing it from the write operation was the safest immediate fix to restore functionality.

## 4. Deployment Status
**Status**: ⚠️ **Code Updated Locally, Pending Deployment**

The code changes are saved in your local environment. For the fix to take effect for app users, the Edge Function must be deployed to Supabase.

**Required Action**:
Run: `npx supabase functions deploy workout-templates`

## 5. Verification Steps (For QA)
1. **Deploy** the function.
2. Open the App => Profile => Workout Templates.
3. Create a template or select an existing one.
4. Tap "Add Exercise".
5. Fill in sets/reps (Weight field logic is currently disabled in backend).
6. Tap Save.
7. **Expected Result**: Success (HTTP 200), item appears in list.
8. **Previous Result**: Failure (HTTP 500).
