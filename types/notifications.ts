// Notification system types.

export type NotificationKind =
  | 'rest_timer'
  | 'workout_reminder'
  | 'nutrition_midday'
  | 'daily_feedback'
  | 'pr_celebration'
  | 'streak_milestones'
  | 'harshness_escalation'
  | 'meal_plan'
  | 'weekly_recalibration'
  | 'body_weight_reminder'
  | 'resting_hr_alert'
  | 'inactivity_reengagement'
  | 'test';

export interface NotificationPreferences {
  user_id: string;
  permission_granted: boolean;
  rest_timer_enabled: boolean;
  workout_reminder_enabled: boolean;
  workout_reminder_hour: number;
  workout_reminder_minute: number;
  nutrition_midday_enabled: boolean;
  nutrition_midday_hour: number;
  daily_feedback_enabled: boolean;
  daily_feedback_hour: number;
  pr_celebration_enabled: boolean;
  streak_milestones_enabled: boolean;
  harshness_escalation_enabled: boolean;
  meal_plan_enabled: boolean;
  weekly_recalibration_enabled: boolean;
  body_weight_reminder_enabled: boolean;
  resting_hr_alert_enabled: boolean;
  inactivity_reengagement_enabled: boolean;
  quiet_hours_start_hour: number | null;
  quiet_hours_end_hour: number | null;
  timezone: string;
}
