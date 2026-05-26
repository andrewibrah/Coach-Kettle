// Body metrics + progress + recovery types.

export interface BodyMetricsEntry {
  id: string;
  user_id: string;
  measured_date: string;
  measured_at: string;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  waist_in: number | null;
  chest_in: number | null;
  hips_in: number | null;
  arm_in: number | null;
  thigh_in: number | null;
  neck_in: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyPhoto {
  id: string;
  user_id: string;
  captured_date: string;
  pose: 'front' | 'side' | 'back' | 'custom' | null;
  storage_path: string;
  signed_url?: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  notes: string | null;
  created_at: string;
}

export interface RestingHeartRateEntry {
  id: string;
  user_id: string;
  measured_date: string;
  bpm: number;
  source: 'manual' | 'healthkit' | 'google_fit' | 'wearable';
  notes: string | null;
  created_at: string;
}

export interface RestingHeartRateSummary {
  avg_bpm: number | null;
  min_bpm: number | null;
  max_bpm: number | null;
  sample_count: number;
  trend_delta_bpm: number | null;
  last_measured_date: string | null;
}

export interface StrengthProgressionPoint {
  workout_date: string;
  top_weight: number | null;
  top_reps: number | null;
  top_e1rm: number | null;
  total_volume: number | null;
  set_count: number;
}

export interface RecoveryEntry {
  id: string;
  user_id: string;
  measured_date: string;
  source: 'manual' | 'healthkit' | 'google_fit' | 'oura' | 'whoop' | 'garmin';
  sleep_minutes: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  readiness_score: number | null;
  soreness: Record<string, number> | null;
  notes: string | null;
  created_at: string;
}

export interface MobilityMovement {
  name: string;
  seconds: number;
  per_side?: boolean;
}

export interface MobilityRoutine {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target_areas: string[];
  duration_min: number;
  movements: MobilityMovement[];
  created_at: string;
}
