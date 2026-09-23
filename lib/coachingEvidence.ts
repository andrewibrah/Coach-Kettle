import type { DailyFeedback } from '@/types/coaching';
import type { DailyTotals } from '@/types/nutrition';
import type { ResolvedNutritionTarget } from '@/types/nutritionTargets';

export interface CoachNutritionView {
  date: string;
  totals: DailyTotals | null;
  todayTarget: ResolvedNutritionTarget;
  loading?: boolean;
  error?: string | null;
}

// View-only: never rewrite saved historical reports to hide missing evidence.
export function getCoachPresentation(report: DailyFeedback, nutrition?: CoachNutritionView) {
  const totals = nutrition?.totals;
  const target = nutrition?.todayTarget.target;
  if (nutrition?.date === report.feedback_date && !nutrition.loading && !nutrition.error
    && totals && totals.log_count > 0 && target && target.calories > 0
    && Number.isFinite(totals.calories) && Number.isFinite(target.calories)) {
    return {
      did_well: report.workout_completed ? 'A completed workout and food entries are recorded for this date.' : 'Food entries are recorded for this date.',
      needs_improvement: `Logged ${Math.round(totals.calories)} calories against a target of ${Math.round(target.calories)}. Entries may be incomplete; this is not a complete-day assessment.`,
      tomorrow_focus: 'Check portions and any missing meals before changing intake.',
      availability: `Report ${report.feedback_date} · Nutrition uses the latest loaded entries. ${nutrition.todayTarget.explanation}`,
    };
  }
  return {
    did_well: report.workout_completed ? 'A completed workout is recorded for this report date.' : 'No completed workout is recorded for this report date.',
    needs_improvement: 'Nutrition cannot be assessed from this saved report alone. Missing data is not a success or a failure.',
    tomorrow_focus: 'Review food entries and saved targets before changing intake.',
    availability: `Report ${report.feedback_date} — a verified nutrition snapshot is unavailable.`,
  };
}
