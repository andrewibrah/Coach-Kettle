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
};
