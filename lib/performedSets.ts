import type { LogRow } from '../types/workout';

type PerformanceRow = Pick<LogRow, 'weightLbs' | 'reps'> &
  Partial<Pick<LogRow, 'isRest' | 'isCardio' | 'status' | 'performance'>>;

/** Legacy valid numeric entries remain logged. Templates and malformed values
 * are not performance. Explicit zero/bodyweight is data, not absence.
 */
export function isPerformedRow(row: PerformanceRow): boolean {
  if (row.isRest || row.status === 'syncing' || row.performance === 'planned') return false;
  if (row.isCardio) return true;
  const weight = row.weightLbs.trim();
  const reps = row.reps.trim();
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(weight) && Number.isFinite(Number(weight)) &&
    /^\d+$/.test(reps) && Number.isSafeInteger(Number(reps));
}

export function performedRows<T extends PerformanceRow>(rows: T[]): T[] {
  return rows.filter(isPerformedRow);
}

/** Only metadata-free blank-load legacy rows carry ambiguous prescribed reps.
 * Explicit performance metadata is provenance: new pending AI reps are actual.
 */
export function isLegacyPlannedTemplate(row: LogRow): boolean {
  return row.performance === undefined && !row.plannedTarget && isPendingSet(row);
}

/** Resolve an edit without promoting prescribed or malformed values. */
export function resolveEditedPerformance(current: LogRow, edited: LogRow, repsEntered: boolean): LogRow {
  const legacyTemplate = isLegacyPlannedTemplate(current);
  const next: LogRow = {
    ...edited,
    reps: legacyTemplate && !repsEntered ? '' : edited.reps,
    plannedTarget: edited.plannedTarget ?? (legacyTemplate ? { reps: current.reps } : undefined),
  };
  next.performance = isPerformedRow({ ...next, performance: undefined }) ? 'performed' : 'planned';
  return next;
}

export function isPendingSet(row: PerformanceRow): boolean {
  return !row.isRest && !row.isCardio && row.status !== 'syncing' && row.performance !== 'performed' &&
    (row.performance === 'planned' || row.weightLbs.trim() === '');
}
