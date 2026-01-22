import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  user_id: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  height_value: number | null;
  height_unit: 'cm' | 'in' | null;
  dob: string | null;
  current_weight: number | null;
  goal_weight: number | null;
  weight_unit: 'lb' | 'kg' | null;
  focus: 'strength' | 'lean_muscle' | 'fat_loss' | 'other' | null;
  focus_other: string | null;
  ai_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PRTrackedLift {
  id: string;
  user_id: string;
  lift_name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface PRLift {
  id: string;
  user_id: string;
  lift_name: string;
  weight_lbs: number;
  reps: number;
  estimated_1rm: number;
  achieved_at: string;
  updated_at: string;
}

export interface PRHistory {
  id: string;
  user_id: string;
  lift_name: string;
  weight_lbs: number;
  reps: number;
  estimated_1rm: number;
  previous_1rm: number | null;
  improvement_pct: number | null;
  achieved_at: string;
}

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateItem {
  id: string;
  template_id: string;
  user_id: string;
  lift_name: string;
  target_sets: number | null;
  target_reps: number | null;
  display_order: number;
  notes: string | null;
  created_at: string;
}

// Fetch user profile
export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No profile found - this is expected for new users
      return null;
    }
    console.error('[Profile] Error fetching profile:', error);
    return null;
  }

  return data as UserProfile;
}

// Create profile for user (calls the DB function)
export async function createProfile(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_profile_for_user', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[Profile] Error creating profile:', error);
    return null;
  }

  return data as string;
}

// Ensure profile exists (fetch or create)
export async function ensureProfile(userId: string): Promise<UserProfile | null> {
  let profile = await fetchProfile(userId);

  if (!profile) {
    console.log('[Profile] Creating profile for user:', userId);
    await createProfile(userId);
    profile = await fetchProfile(userId);
  }

  return profile;
}

// Update profile fields
export async function updateProfile(
  userId: string,
  updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'ai_context'>>
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[Profile] Error updating profile:', error);
    return null;
  }

  return data as UserProfile;
}

// Complete onboarding
export async function completeOnboarding(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[Profile] Error completing onboarding:', error);
    return false;
  }

  // Refresh AI context after onboarding
  await refreshAIContext(userId);

  return true;
}

// Update onboarding step
export async function updateOnboardingStep(userId: string, step: number): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_step: step })
    .eq('user_id', userId);

  if (error) {
    console.error('[Profile] Error updating onboarding step:', error);
    return false;
  }

  return true;
}

// Refresh AI context
export async function refreshAIContext(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('refresh_ai_context', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[Profile] Error refreshing AI context:', error);
    return false;
  }

  return true;
}

// PR Tracked Lifts
export async function fetchTrackedLifts(userId: string): Promise<PRTrackedLift[]> {
  const { data, error } = await supabase
    .from('pr_tracked_lifts')
    .select('*')
    .eq('user_id', userId)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[Profile] Error fetching tracked lifts:', error);
    return [];
  }

  return data as PRTrackedLift[];
}

export async function addTrackedLift(userId: string, liftName: string): Promise<PRTrackedLift | null> {
  const { data, error } = await supabase
    .from('pr_tracked_lifts')
    .insert({
      user_id: userId,
      lift_name: liftName,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('[Profile] Error adding tracked lift:', error);
    return null;
  }

  return data as PRTrackedLift;
}

export async function removeTrackedLift(liftId: string): Promise<boolean> {
  const { error } = await supabase
    .from('pr_tracked_lifts')
    .delete()
    .eq('id', liftId);

  if (error) {
    console.error('[Profile] Error removing tracked lift:', error);
    return false;
  }

  return true;
}

export async function toggleTrackedLift(liftId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('pr_tracked_lifts')
    .update({ is_active: isActive })
    .eq('id', liftId);

  if (error) {
    console.error('[Profile] Error toggling tracked lift:', error);
    return false;
  }

  return true;
}

// PR Lifts (Current Records)
export async function fetchPRLifts(userId: string): Promise<PRLift[]> {
  const { data, error } = await supabase
    .from('pr_lifts')
    .select('*')
    .eq('user_id', userId)
    .order('lift_name', { ascending: true });

  if (error) {
    console.error('[Profile] Error fetching PR lifts:', error);
    return [];
  }

  return data as PRLift[];
}

export async function setPRLift(
  userId: string,
  liftName: string,
  weightLbs: number,
  reps: number
): Promise<PRLift | null> {
  // Calculate e1rm using Epley formula
  const estimated1rm = reps <= 0 ? weightLbs : Math.round(weightLbs * (1 + reps / 30) * 10) / 10;

  const { data, error } = await supabase
    .from('pr_lifts')
    .upsert(
      {
        user_id: userId,
        lift_name: liftName,
        weight_lbs: weightLbs,
        reps: reps,
        estimated_1rm: estimated1rm,
        achieved_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lift_name' }
    )
    .select()
    .single();

  if (error) {
    console.error('[Profile] Error setting PR lift:', error);
    return null;
  }

  return data as PRLift;
}

// PR History
export async function fetchPRHistory(userId: string, liftName?: string): Promise<PRHistory[]> {
  let query = supabase
    .from('pr_history')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false });

  if (liftName) {
    query = query.eq('lift_name', liftName);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Profile] Error fetching PR history:', error);
    return [];
  }

  return data as PRHistory[];
}

// Workout Templates
export async function fetchWorkoutTemplates(userId: string): Promise<WorkoutTemplate[]> {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[Profile] Error fetching workout templates:', error);
    return [];
  }

  return data as WorkoutTemplate[];
}

export async function createWorkoutTemplate(
  userId: string,
  name: string,
  description?: string
): Promise<WorkoutTemplate | null> {
  const { data, error } = await supabase
    .from('workout_templates')
    .insert({
      user_id: userId,
      name: name,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[Profile] Error creating workout template:', error);
    return null;
  }

  return data as WorkoutTemplate;
}

export async function deleteWorkoutTemplate(templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('workout_templates')
    .update({ is_active: false })
    .eq('id', templateId);

  if (error) {
    console.error('[Profile] Error deleting workout template:', error);
    return false;
  }

  return true;
}

// Workout Template Items
export async function fetchTemplateItems(templateId: string): Promise<WorkoutTemplateItem[]> {
  const { data, error } = await supabase
    .from('workout_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[Profile] Error fetching template items:', error);
    return [];
  }

  return data as WorkoutTemplateItem[];
}

export async function addTemplateItem(
  userId: string,
  templateId: string,
  liftName: string,
  targetSets?: number,
  targetReps?: number,
  notes?: string
): Promise<WorkoutTemplateItem | null> {
  const { data, error } = await supabase
    .from('workout_template_items')
    .insert({
      user_id: userId,
      template_id: templateId,
      lift_name: liftName,
      target_sets: targetSets || null,
      target_reps: targetReps || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[Profile] Error adding template item:', error);
    return null;
  }

  return data as WorkoutTemplateItem;
}

export async function removeTemplateItem(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('workout_template_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('[Profile] Error removing template item:', error);
    return false;
  }

  return true;
}
