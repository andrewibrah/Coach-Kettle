import type { LogRow } from '../types/workout';
import type { WorkoutRow } from './workoutStorage';
import { performedRows } from './performedSets';

/** Final performance evidence only. Omitted legacy metadata stays omitted;
 * explicit zero/false survive. Transport/recovery markers are not history.
 */
export function serializeWorkoutRows(rows: LogRow[]): (WorkoutRow & { set: number })[] {
  return performedRows(rows).map(row => ({
    id: row.id,
    set: row.set,
    exercise: row.exercise,
    weightLbs: row.weightLbs,
    reps: row.reps,
    notes: row.notes,
    timestamp: row.timestamp,
    ...(row.performance === undefined ? {} : { performance: row.performance }),
    ...(row.setKind === undefined ? {} : { setKind: row.setKind }),
    ...(row.plannedTarget === undefined ? {} : { plannedTarget: { ...row.plannedTarget } }),
    ...(row.isCardio === undefined ? {} : { isCardio: row.isCardio }),
    ...(row.durationMins === undefined ? {} : { durationMins: row.durationMins }),
    ...(row.distance === undefined ? {} : { distance: row.distance }),
    ...(row.distanceUnit === undefined ? {} : { distanceUnit: row.distanceUnit }),
    ...(row.heartRate === undefined ? {} : { heartRate: row.heartRate }),
    ...(row.calories === undefined ? {} : { calories: row.calories }),
    ...(row.level === undefined ? {} : { level: row.level }),
  }));
}
