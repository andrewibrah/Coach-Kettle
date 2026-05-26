// Coaching domain types — daily feedback + harshness state machine.

import type { ColorGrade } from './nutrition';

export type HarshnessLevel = 0 | 1 | 2 | 3;
export type CoachingTone = 'supportive' | 'firm' | 'direct' | 'accountability';

export const HARSHNESS_LABELS: Record<HarshnessLevel, { tone: CoachingTone; label: string; description: string }> = {
  0: { tone: 'supportive',    label: 'Supportive',    description: 'Firm but understanding. First slip-up.' },
  1: { tone: 'firm',          label: 'Firm',          description: 'More direct, less cushioning.' },
  2: { tone: 'direct',        label: 'Direct',        description: 'No more sugar-coating. Two bad days in a row.' },
  3: { tone: 'accountability',label: 'Accountability', description: 'Full accountability mode. Three+ bad days.' },
};

export interface DailyFeedback {
  id: string;
  user_id: string;
  feedback_date: string;            // YYYY-MM-DD
  workout_completed: boolean;
  nutrition_color: ColorGrade | null;
  nutrition_score: number | null;
  nutrition_grade: string | null;
  workout_grade: string | null;
  overall_color: ColorGrade | null;
  did_well: string | null;
  needs_improvement: string | null;
  tomorrow_focus: string | null;
  harshness_level: HarshnessLevel;
  tone: CoachingTone | null;
  streak_days: number;
  bad_days_streak: number;
  created_at: string;
  updated_at: string;
}

export interface BehaviorState {
  id: string;
  user_id: string;
  harshness_level: HarshnessLevel;
  consecutive_bad_days: number;
  consecutive_good_days: number;
  last_evaluated_date: string | null;
  last_bad_day_date: string | null;
  last_good_day_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BehaviorEventKind =
  | 'good_day'
  | 'bad_day'
  | 'workout_missed'
  | 'nutrition_red'
  | 'nutrition_green'
  | 'workout_completed'
  | 'plan_recalibrated'
  | 'harshness_changed';

export interface BehaviorEvent {
  id: string;
  user_id: string;
  event_date: string;
  kind: BehaviorEventKind;
  delta_harshness: number;
  payload: Record<string, unknown> | null;
  created_at: string;
}
