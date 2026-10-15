import type { LogRow } from '../types/workout';
import { isPendingSet, isPerformedRow } from './performedSets.ts';

/** A consecutive run of rows for one exercise; rest rows join the run before them. */
export type SessionGroup = {
  key: string;        // id of the group's first set row (stable across edits)
  exercise: string;
  start: number;      // inclusive row index
  end: number;        // inclusive row index
  setCount: number;   // non-rest rows
  hasPending: boolean;
};

export type SessionItem =
  | { kind: 'header'; group: SessionGroup; groupIndex: number; expanded: boolean }
  | { kind: 'row'; row: LogRow; rowIndex: number; groupIndex: number };

const norm = (value: string) => value.trim().toLowerCase();

export function groupSessionRows(rows: LogRow[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  rows.forEach((row, index) => {
    const current = groups[groups.length - 1];
    if (row.isRest) {
      if (current) current.end = index;
      return;
    }
    const pending = isPendingSet(row) && !isPerformedRow(row);
    if (current && norm(current.exercise) === norm(row.exercise)) {
      current.end = index;
      current.setCount += 1;
      current.hasPending ||= pending;
      return;
    }
    // Leading rest rows (before any set) belong to the first group.
    groups.push({ key: row.id, exercise: row.exercise.trim(), start: current ? index : 0, end: index, setCount: 1, hasPending: pending });
  });
  return groups;
}

/**
 * The one group shown expanded by default. Anchor on the most recently logged set
 * (latest timestamp, ties to the later row). If that exercise still has scheduled
 * sets it stays active; once it is finished, the next scheduled exercise takes over.
 * Nothing logged yet → the first scheduled exercise, else the last group.
 * A row still parsing (status 'syncing') overrides all of this.
 */
export function activeGroupIndex(rows: LogRow[], groups: SessionGroup[]): number {
  if (groups.length === 0) return -1;
  // A message still parsing is the user's newest entry: keep it in view.
  const syncing = rows.findLastIndex((row) => row.status === 'syncing' && !row.isRest);
  if (syncing !== -1) return groups.findIndex((g) => syncing >= g.start && syncing <= g.end);
  const rank = (row: LogRow) => Number.isFinite(row.timestamp) ? row.timestamp : -Infinity;
  let latest = -1;
  rows.forEach((row, index) => {
    if (row.isRest || !isPerformedRow(row)) return;
    if (latest === -1 || rank(row) >= rank(rows[latest])) latest = index;
  });
  if (latest === -1) {
    const firstPending = groups.findIndex((g) => g.hasPending);
    return firstPending === -1 ? groups.length - 1 : firstPending;
  }
  const anchor = groups.findIndex((g) => latest >= g.start && latest <= g.end);
  if (groups[anchor].hasPending) return anchor;
  const next = groups.findIndex((g, i) => i > anchor && g.hasPending);
  return next === -1 ? anchor : next;
}

export function visibleSessionItems(
  rows: LogRow[],
  groups: SessionGroup[],
  isExpanded: (group: SessionGroup, groupIndex: number) => boolean,
): SessionItem[] {
  // Rest-only sessions have no groups: show the rows as-is.
  if (groups.length === 0) return rows.map((row, rowIndex) => ({ kind: 'row', row, rowIndex, groupIndex: -1 }));
  const items: SessionItem[] = [];
  groups.forEach((group, groupIndex) => {
    const expanded = isExpanded(group, groupIndex);
    items.push({ kind: 'header', group, groupIndex, expanded });
    if (!expanded) return;
    for (let rowIndex = group.start; rowIndex <= group.end; rowIndex++) {
      items.push({ kind: 'row', row: rows[rowIndex], rowIndex, groupIndex });
    }
  });
  return items;
}
