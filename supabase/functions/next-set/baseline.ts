// Pure response shaping for next-set. Adaptive output stays off until D07 is approved:
// the baseline is the prior completed session's eligible sets, not a recommendation.

export interface BaselineSet {
  setNumber: number;
  setKind: string | null;
  weightLbs: number;
  reps: number;
  e1rm: number | null;
}

export interface Baseline {
  workoutId: string;
  date: string | null;
  exercise: string;
  sets: BaselineSet[];
}

function finite(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Malformed baseline number");
  return n;
}

/** Map exercise_history_baseline rows; null only for an empty result. Throws on malformed rows. */
export function shapeBaseline(rows: unknown, exercise: string): Baseline | null {
  if (!Array.isArray(rows)) throw new Error("Malformed baseline payload");
  if (rows.length === 0) return null;
  const workoutId = rows[0]?.workout_id;
  if (typeof workoutId !== "string" || !workoutId) throw new Error("Malformed baseline workout");
  const sets = rows.map((r) => {
    if (r?.workout_id !== workoutId) throw new Error("Baseline must not merge sessions");
    const weightLbs = finite(r.weight_lbs);
    const reps = finite(r.reps);
    if (!(weightLbs > 0) || !Number.isSafeInteger(reps) || reps <= 0) throw new Error("Ineligible baseline set");
    return {
      setNumber: finite(r.set_number),
      setKind: typeof r.set_kind === "string" ? r.set_kind : null,
      weightLbs,
      reps,
      e1rm: r.e1rm == null ? null : finite(r.e1rm),
    };
  });
  return { workoutId, date: typeof rows[0].workout_date === "string" ? rows[0].workout_date : null, exercise, sets };
}

export function nextSetResponse(baseline: Baseline | null) {
  return { suggestion: null, reason: "policy_unapproved", baseline };
}
