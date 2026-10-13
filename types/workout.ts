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
  // I3 wire integrity: empty = unknown, never an implicit zero. Known load is
  // canonical finite/non-negative lb; known reps are whole/non-negative safe integers.
  // Explicit0 is preserved; zero reps are not eligible strength PR evidence.
  notes: string;
  timestamp: number;
  status?: 'syncing' | 'committed';
  // Durable recovery evidence only; never automatically replay after process death.
  pendingInput?: string;
  // Performance is independent of transport status; omitted fields are legacy.
  performance?: 'planned' | 'performed';
  plannedTarget?: { reps: string; weightLbs?: string };
  setKind?: 'work' | 'warmup' | 'backoff' | 'drop' | 'superset' | 'cardio';
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
