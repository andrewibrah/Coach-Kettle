import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';

const PROFILE_CACHE_KEY = 'cached_profile';
const API_BASE = `${supabaseUrl}/functions/v1`;

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
  target_weight: number | null;
  display_order: number;
  notes: string | null;
  created_at: string;
}

// Cache profile locally
async function cacheProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('[Profile] Failed to cache profile:', e);
  }
}

// Get cached profile
async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as UserProfile;
    }
  } catch (e) {
    console.warn('[Profile] Failed to get cached profile:', e);
  }
  return null;
}

// Clear cached profile
export async function clearCachedProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  } catch (e) {
    console.warn('[Profile] Failed to clear cached profile:', e);
  }
}

// Fetch user profile via Edge Function
export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/profile?action=fetch`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Profile] Error fetching profile:', response.status, errorText);
      return getCachedProfile();
    }

    const data = await response.json();
    if (data.profile) {
      await cacheProfile(data.profile);
    }
    return data.profile;
  } catch (error) {
    console.error('[Profile] Error fetching profile:', error);
    return getCachedProfile();
  }
}

// Create profile for user via Edge Function
export async function createProfile(userId: string): Promise<string | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/profile`, {
      method: 'POST',
      body: JSON.stringify({ action: 'create' }),
    });

    if (!response.ok) {
      console.error('[Profile] Error creating profile:', response.status);
      return null;
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('[Profile] Error creating profile:', error);
    return null;
  }
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

// Update profile fields via Edge Function
export async function updateProfile(
  userId: string,
  updates: Partial<Omit<UserProfile, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'ai_context'>>
): Promise<UserProfile | null> {
  console.log('[Profile] Updating profile for user:', userId, 'with updates:', updates);

  try {
    const response = await fetchWithAuth(`${API_BASE}/profile`, {
      method: 'POST',
      body: JSON.stringify({ action: 'update', updates }),
    });

    if (!response.ok) {
      console.error('[Profile] Error updating profile:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Profile] Profile updated successfully:', data.profile);

    if (data.profile) {
      await cacheProfile(data.profile);
    }
    return data.profile;
  } catch (error) {
    console.error('[Profile] Error updating profile:', error);
    return null;
  }
}

// Complete onboarding via Edge Function
export async function completeOnboarding(userId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/profile`, {
      method: 'POST',
      body: JSON.stringify({ action: 'complete_onboarding' }),
    });

    if (!response.ok) {
      console.error('[Profile] Error completing onboarding:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error completing onboarding:', error);
    return false;
  }
}

// Update onboarding step via Edge Function
export async function updateOnboardingStep(userId: string, step: number): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/profile`, {
      method: 'POST',
      body: JSON.stringify({ action: 'update_step', step }),
    });

    if (!response.ok) {
      console.error('[Profile] Error updating onboarding step:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error updating onboarding step:', error);
    return false;
  }
}

// Refresh AI context via Edge Function
export async function refreshAIContext(userId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/profile`, {
      method: 'POST',
      body: JSON.stringify({ action: 'refresh_ai_context' }),
    });

    if (!response.ok) {
      console.error('[Profile] Error refreshing AI context:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error refreshing AI context:', error);
    return false;
  }
}

// ==================== PR TRACKING ====================

// Fetch tracked lifts via Edge Function
export async function fetchTrackedLifts(userId: string): Promise<PRTrackedLift[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking?action=tracked_lifts`, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error('[Profile] Error fetching tracked lifts:', response.status);
      return [];
    }

    const data = await response.json();
    return data.lifts || [];
  } catch (error) {
    console.error('[Profile] Error fetching tracked lifts:', error);
    return [];
  }
}

// Add tracked lift via Edge Function
export async function addTrackedLift(userId: string, liftName: string): Promise<PRTrackedLift | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking`, {
      method: 'POST',
      body: JSON.stringify({ action: 'add_tracked', lift_name: liftName }),
    });

    if (!response.ok) {
      console.error('[Profile] Error adding tracked lift:', response.status);
      return null;
    }

    const data = await response.json();
    return data.lift;
  } catch (error) {
    console.error('[Profile] Error adding tracked lift:', error);
    return null;
  }
}

// Remove tracked lift via Edge Function
export async function removeTrackedLift(liftId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove_tracked', lift_id: liftId }),
    });

    if (!response.ok) {
      console.error('[Profile] Error removing tracked lift:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error removing tracked lift:', error);
    return false;
  }
}

// Toggle tracked lift via Edge Function
export async function toggleTrackedLift(liftId: string, isActive: boolean): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking`, {
      method: 'POST',
      body: JSON.stringify({ action: 'toggle_tracked', lift_id: liftId, is_active: isActive }),
    });

    if (!response.ok) {
      console.error('[Profile] Error toggling tracked lift:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error toggling tracked lift:', error);
    return false;
  }
}

// Fetch PR lifts via Edge Function
export async function fetchPRLifts(userId: string): Promise<PRLift[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking?action=pr_lifts`, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error('[Profile] Error fetching PR lifts:', response.status);
      return [];
    }

    const data = await response.json();
    return data.lifts || [];
  } catch (error) {
    console.error('[Profile] Error fetching PR lifts:', error);
    return [];
  }
}

// Set PR lift via Edge Function
export async function setPRLift(
  userId: string,
  liftName: string,
  weightLbs: number,
  reps: number
): Promise<PRLift | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/pr-tracking`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'set_pr',
        lift_name: liftName,
        weight_lbs: weightLbs,
        reps,
      }),
    });

    if (!response.ok) {
      console.error('[Profile] Error setting PR lift:', response.status);
      return null;
    }

    const data = await response.json();
    return data.lift;
  } catch (error) {
    console.error('[Profile] Error setting PR lift:', error);
    return null;
  }
}

// Fetch PR history via Edge Function
export async function fetchPRHistory(userId: string, liftName?: string): Promise<PRHistory[]> {
  try {
    let url = `${API_BASE}/pr-tracking?action=pr_history`;
    if (liftName) {
      url += `&lift_name=${encodeURIComponent(liftName)}`;
    }

    const response = await fetchWithAuth(url, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error('[Profile] Error fetching PR history:', response.status);
      return [];
    }

    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error('[Profile] Error fetching PR history:', error);
    return [];
  }
}

// ==================== WORKOUT TEMPLATES ====================

// Fetch workout templates via Edge Function
export async function fetchWorkoutTemplates(userId: string): Promise<WorkoutTemplate[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates?action=list`, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error('[Profile] Error fetching workout templates:', response.status);
      return [];
    }

    const data = await response.json();
    return data.templates || [];
  } catch (error) {
    console.error('[Profile] Error fetching workout templates:', error);
    return [];
  }
}

// Create workout template via Edge Function
export async function createWorkoutTemplate(
  userId: string,
  name: string,
  description?: string
): Promise<WorkoutTemplate | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({ action: 'create', name, description }),
    });

    if (!response.ok) {
      console.error('[Profile] Error creating workout template:', response.status);
      return null;
    }

    const data = await response.json();
    return data.template;
  } catch (error) {
    console.error('[Profile] Error creating workout template:', error);
    return null;
  }
}

// Delete workout template via Edge Function
export async function deleteWorkoutTemplate(templateId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', template_id: templateId }),
    });

    if (!response.ok) {
      console.error('[Profile] Error deleting workout template:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error deleting workout template:', error);
    return false;
  }
}

// Fetch template items via Edge Function
export async function fetchTemplateItems(templateId: string): Promise<WorkoutTemplateItem[]> {
  try {
    const response = await fetchWithAuth(
      `${API_BASE}/workout-templates?action=items&template_id=${encodeURIComponent(templateId)}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      console.error('[Profile] Error fetching template items:', response.status);
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('[Profile] Error fetching template items:', error);
    return [];
  }
}

// Add template item via Edge Function
export async function addTemplateItem(
  userId: string,
  templateId: string,
  liftName: string,
  targetSets?: number,
  targetReps?: number,
  targetWeight?: number,
  notes?: string,
  displayOrder?: number
): Promise<WorkoutTemplateItem | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'add_item',
        template_id: templateId,
        lift_name: liftName,
        target_sets: targetSets,
        target_reps: targetReps,
        target_weight: targetWeight,
        notes,
        display_order: displayOrder,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Profile] Error adding template item:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.item;
  } catch (error) {
    console.error('[Profile] Error adding template item:', error);
    return null;
  }
}

// Remove template item via Edge Function
export async function removeTemplateItem(itemId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove_item', item_id: itemId }),
    });

    if (!response.ok) {
      console.error('[Profile] Error removing template item:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error removing template item:', error);
    return false;
  }
}

// Update template item via Edge Function
export async function updateTemplateItem(
  itemId: string,
  updates: {
    lift_name?: string;
    target_sets?: number | null;
    target_reps?: number | null;
    target_weight?: number | null;
    notes?: string | null;
  }
): Promise<WorkoutTemplateItem | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({ action: 'update_item', item_id: itemId, ...updates }),
    });

    if (!response.ok) {
      console.error('[Profile] Error updating template item:', response.status);
      return null;
    }

    const data = await response.json();
    return data.item;
  } catch (error) {
    console.error('[Profile] Error updating template item:', error);
    return null;
  }
}

// Reorder template items via Edge Function
export async function reorderTemplateItems(
  items: Array<{ id: string; display_order: number }>
): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE}/workout-templates`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reorder_items', items }),
    });

    if (!response.ok) {
      console.error('[Profile] Error reordering template items:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Profile] Error reordering template items:', error);
    return false;
  }
}
