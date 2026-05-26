// Workout programming domain types — multi-week personalized programs.

export type GoalType =
  | 'muscle_building'
  | 'leaning_out'
  | 'weight_loss'
  | 'maintenance'
  | 'strength'
  | 'endurance';

export type SplitType =
  | 'ppl_3day'
  | 'pp_sh_l_5day'
  | 'pp_sh_l_6day'
  | 'upper_lower'
  | 'full_body'
  | 'custom';

export type Periodization = 'linear' | 'undulating' | 'block' | 'none';
export type ProgramStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface WorkoutProgram {
  id: string;
  user_id: string;
  name: string;
  goal_type: GoalType;
  split_type: SplitType;
  days_per_week: number;
  weeks_total: number;
  current_week: number;
  periodization: Periodization;
  deload_every: number | null;
  status: ProgramStatus;
  inputs_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramWeek {
  id: string;
  program_id: string;
  user_id: string;
  week_number: number;
  is_deload: boolean;
  intensity_pct: number;
  volume_pct: number;
  notes: string | null;
  created_at: string;
}

export interface ProgramDay {
  id: string;
  week_id: string;
  program_id: string;
  user_id: string;
  day_index: number;
  body_part: string;
  title: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProgramExercise {
  id: string;
  day_id: string;
  program_id: string;
  user_id: string;
  exercise_slug: string | null;
  exercise_name: string;
  target_sets: number;
  target_reps_low: number | null;
  target_reps_high: number | null;
  target_pct_e1rm: number | null;
  target_weight_lbs: number | null;
  rest_seconds: number | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface ProgramTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  split_type: SplitType;
  days_per_week: number;
  goal_types: GoalType[];
  structure: ProgramTemplateStructure;
  created_at: string;
}

export interface ProgramTemplateStructure {
  days: ProgramTemplateDay[];
}

export interface ProgramTemplateDay {
  day: number;
  body_part: string;
  title: string;
  exercises: ProgramTemplateExercise[];
}

export interface ProgramTemplateExercise {
  slug: string;
  sets: number;
  reps: [number, number];   // [low, high]
  rest: number;             // seconds
}

export interface NextSetSuggestion {
  last_workout_date: string | null;
  last_top_weight_lbs: number | null;
  last_top_reps: number | null;
  last_top_e1rm: number | null;
  suggested_weight_lbs: number | null;
  suggested_reps_low: number;
  suggested_reps_high: number;
  strategy: 'no_history' | 'hold' | 'increase_weight' | 'micro_load' | 'deload_set';
  rationale: string;
}
