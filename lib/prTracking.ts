import { supabase } from './supabase';
import { PRTrackedLift, PRLift, fetchTrackedLifts, fetchPRLifts } from './profile';

export interface PRCheckResult {
  isPR: boolean;
  liftName: string;
  weight: number;
  reps: number;
  newE1rm: number;
  previousE1rm?: number;
}

// Calculate Epley 1RM
function calculateE1rm(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Client-side PR check (post-insert)
export async function checkForPR(
  userId: string,
  exercise: string,
  weightLbs: number,
  reps: number
): Promise<PRCheckResult | null> {
  try {
    // Normalize exercise name
    const normalizedExercise = exercise.toLowerCase().trim();

    // Fetch tracked lifts
    const trackedLifts = await fetchTrackedLifts(userId);
    const trackedLift = trackedLifts.find(
      (lift) => lift.lift_name.toLowerCase().trim() === normalizedExercise && lift.is_active
    );

    if (!trackedLift) {
      return null; // Not tracking this lift
    }

    // Calculate new E1RM
    const newE1rm = calculateE1rm(weightLbs, reps);

    // Get current PR for this lift
    const currentPRs = await fetchPRLifts(userId);
    const currentPR = currentPRs.find(
      (pr) => pr.lift_name.toLowerCase().trim() === normalizedExercise
    );

    const previousE1rm = currentPR?.estimated_1rm;

    // Check if this is a PR
    if (!previousE1rm || newE1rm > previousE1rm) {
      return {
        isPR: true,
        liftName: trackedLift.lift_name, // Use original casing from tracked lift
        weight: weightLbs,
        reps,
        newE1rm,
        previousE1rm: previousE1rm || undefined,
      };
    }

    return null; // Not a PR
  } catch (error) {
    console.error('[prTracking] Error checking for PR:', error);
    return null;
  }
}

// Subscribe to PR breakthroughs via Supabase Realtime (optional advanced feature)
function subscribeToPRBreakthroughs(
  userId: string,
  onPR: (data: PRCheckResult) => void
): () => void {
  const channel = supabase
    .channel(`pr_history:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pr_history',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const record = payload.new as any;
        onPR({
          isPR: true,
          liftName: record.lift_name,
          weight: record.weight_lbs,
          reps: record.reps,
          newE1rm: record.estimated_1rm,
          previousE1rm: record.previous_1rm || undefined,
        });
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

// Batch check for PRs (useful when logging multiple sets)
async function checkBatchForPRs(
  userId: string,
  sets: Array<{ exercise: string; weightLbs: number; reps: number }>
): Promise<PRCheckResult[]> {
  const results: PRCheckResult[] = [];

  // Group by exercise to avoid redundant checks
  const exerciseMap = new Map<string, { weightLbs: number; reps: number; e1rm: number }>();

  for (const set of sets) {
    const normalizedExercise = set.exercise.toLowerCase().trim();
    const e1rm = calculateE1rm(set.weightLbs, set.reps);

    const existing = exerciseMap.get(normalizedExercise);
    if (!existing || e1rm > existing.e1rm) {
      exerciseMap.set(normalizedExercise, {
        weightLbs: set.weightLbs,
        reps: set.reps,
        e1rm,
      });
    }
  }

  // Check each best set
  for (const [exercise, best] of exerciseMap) {
    const result = await checkForPR(userId, exercise, best.weightLbs, best.reps);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
