export type BodyPart =
  | "Push"
  | "Pull"
  | "Legs"
  | "Abs"
  | "Chest"
  | "Back"
  | "Bis"
  | "Tris"
  | "Shoulders"
  | "Cardio";

export type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string;
  reps: string;
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
  // Rest-timer marker row. Inserted between sets when a rest timer is started.
  // Not a real set: excluded from sync, save, PR checks, and set re-sequencing.
  isRest?: boolean;
  // Cardio-specific fields (optional)
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
};
