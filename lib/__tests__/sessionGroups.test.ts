import assert from 'node:assert/strict';
import test from 'node:test';
import { activeGroupIndex, groupSessionRows, visibleSessionItems } from '../sessionGroups.ts';
import type { LogRow } from '../../types/workout';

let seq = 0;
const done = (exercise: string, timestamp = ++seq): LogRow =>
  ({ id: `r${++seq}`, exercise, set: 1, weightLbs: '135', reps: '8', notes: '', timestamp, performance: 'performed' });
const planned = (exercise: string): LogRow =>
  ({ id: `r${++seq}`, exercise, set: 1, weightLbs: '', reps: '', notes: '', timestamp: 0, performance: 'planned', plannedTarget: { reps: '8' } });
const rest = (): LogRow =>
  ({ id: `r${++seq}`, exercise: '', set: 0, weightLbs: '', reps: '', notes: 'Rest 90s', timestamp: ++seq, isRest: true });

const names = (rows: LogRow[]) => {
  const groups = groupSessionRows(rows);
  return groups.map((g) => [g.exercise, g.setCount]);
};

test('groups consecutive sets by exercise, case/space-insensitive; rest rows join the preceding group', () => {
  const rows = [done('Bench'), rest(), done(' bench '), done('Incline Bench'), done('Bench')];
  assert.deepEqual(names(rows), [['Bench', 2], ['Incline Bench', 1], ['Bench', 1]]);
  const groups = groupSessionRows(rows);
  assert.deepEqual([groups[0].start, groups[0].end], [0, 2]);
});

test('leading rest rows attach to the first group; rest-only sessions have no groups', () => {
  const rows = [rest(), done('Bench')];
  const [g] = groupSessionRows(rows);
  assert.deepEqual([g.start, g.end, g.setCount], [0, 1, 1]);
  assert.deepEqual(groupSessionRows([rest()]), []);
  assert.equal(activeGroupIndex([rest()], []), -1);
});

test('plan: bench done → incline (in progress) is active, scheduled cable fly stays collapsed', () => {
  const rows = [done('Bench'), done('Bench'), done('Bench'), done('Incline'), planned('Incline'), planned('Cable Fly')];
  const groups = groupSessionRows(rows);
  assert.equal(groups[activeGroupIndex(rows, groups)].exercise, 'Incline');
});

test('plan: a finished exercise hands off to the next scheduled one before its first set', () => {
  const rows = [done('Bench'), done('Bench'), planned('Incline'), planned('Incline'), planned('Cable Fly')];
  const groups = groupSessionRows(rows);
  assert.equal(groups[activeGroupIndex(rows, groups)].exercise, 'Incline');
});

test('nothing logged yet: the first scheduled exercise is active', () => {
  const rows = [planned('Bench'), planned('Incline')];
  const groups = groupSessionRows(rows);
  assert.equal(activeGroupIndex(rows, groups), 0);
});

test('ad-hoc session (no plan): the most recently logged exercise is active', () => {
  const rows = [done('Bench'), done('Bench'), done('Incline')];
  const groups = groupSessionRows(rows);
  assert.equal(groups[activeGroupIndex(rows, groups)].exercise, 'Incline');
  // Recency is by timestamp, not position: editing back into bench keeps bench active.
  const back = [done('Bench', 10), done('Incline', 5)];
  assert.equal(activeGroupIndex(back, groupSessionRows(back)), 0);
});

test('everything finished: the last logged exercise stays open', () => {
  const rows = [done('Bench'), done('Incline')];
  const groups = groupSessionRows(rows);
  assert.equal(activeGroupIndex(rows, groups), 1);
});

test('visible items: headers for every group, rows only for expanded groups', () => {
  const rows = [done('Bench'), done('Bench'), done('Incline'), planned('Incline'), planned('Cable Fly')];
  const groups = groupSessionRows(rows);
  const active = activeGroupIndex(rows, groups);
  const items = visibleSessionItems(rows, groups, (_g, i) => i === active);
  assert.deepEqual(items.map((it) => it.kind === 'header' ? `H:${it.group.exercise}` : `R:${it.rowIndex}`),
    ['H:Bench', 'H:Incline', 'R:2', 'R:3', 'H:Cable Fly']);
});

test('a message still parsing (syncing ghost row) opens its group so the new entry is visible', () => {
  const ghost: LogRow = { id: 'ghost', exercise: 'incline 135x8', set: 1, weightLbs: '...', reps: '...',
    notes: 'Parsing...', timestamp: ++seq, status: 'syncing' };
  const rows = [done('Bench'), done('Bench'), ghost];
  const groups = groupSessionRows(rows);
  assert.equal(groups[activeGroupIndex(rows, groups)].key, 'ghost');
  // Even while a scheduled exercise is in progress.
  const planRows = [done('Incline'), planned('Incline'), { ...ghost, id: 'ghost2' }];
  const planGroups = groupSessionRows(planRows);
  assert.equal(planGroups[activeGroupIndex(planRows, planGroups)].key, 'ghost2');
});
