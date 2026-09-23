import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { WorkoutSession, WorkoutSource } from '../workoutStorage.ts';

// ---------- Storage round-trip for program source IDs (#1) ----------
//
// The full draft -> local history -> sync -> API -> fetch pipeline is
// deferred in this pass (see 20260904000200_workout_program_source.sql's
// scope note: the edge functions don't yet accept/persist these columns).
// What IS built and testable here: the `source` field surviving the two
// serialization boundaries that already exist today regardless of that
// pipeline -- AsyncStorage's JSON.stringify/parse for local history, and a
// JSON request/response body for the eventual API call. If `source` were
// dropped by either boundary, this catches it before the pipeline is wired.

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSession(source?: WorkoutSource): WorkoutSession {
  return {
    id: 'w1',
    dateISO: '2026-09-04',
    part: 'Pull (Heavy)',
    rows: [{ exercise: 'Deadlift', weightLbs: '315', reps: '5', notes: '' }],
    createdAt: Date.now(),
    ...(source ? { source } : {}),
  };
}

test('freestyle session (no source field) survives the round trip with source still absent', () => {
  const session = makeSession();
  const roundTripped = jsonRoundTrip(session);
  assert.equal('source' in roundTripped, false);
  assert.equal(roundTripped.id, session.id);
});

test('template source survives the round trip intact', () => {
  const source: WorkoutSource = { kind: 'template', templateId: 'tmpl-123' };
  const session = makeSession(source);
  const roundTripped = jsonRoundTrip(session);
  assert.deepEqual(roundTripped.source, source);
});

test('program source (programId, programDayId, programWeek) survives the round trip intact', () => {
  const source: WorkoutSource = {
    kind: 'program',
    programId: 'prog-abc',
    programDayId: 'day-xyz',
    programWeek: 3,
  };
  const session = makeSession(source);
  const roundTripped = jsonRoundTrip(session);
  assert.deepEqual(roundTripped.source, source);
  assert.equal(roundTripped.source?.kind, 'program');
  if (roundTripped.source?.kind === 'program') {
    assert.equal(roundTripped.source.programWeek, 3);
  }
});

test('a double round trip (local save, then a simulated API save+fetch) preserves source', () => {
  const source: WorkoutSource = {
    kind: 'program',
    programId: 'prog-abc',
    programDayId: 'day-xyz',
    programWeek: 1,
  };
  const session = makeSession(source);

  // Simulates AsyncStorage.setItem/getItem (local history).
  const afterLocalSave = jsonRoundTrip(session);
  // Simulates fetchWithAuth's JSON request body -> edge function -> JSON response body.
  const afterApiRoundTrip = jsonRoundTrip(afterLocalSave);

  assert.deepEqual(afterApiRoundTrip.source, source);
});

test('an old session shape (recorded before `source` existed) still parses -- optional field, not required', () => {
  const legacyJson = JSON.stringify({
    id: 'old-1',
    dateISO: '2026-01-01',
    part: 'Push',
    rows: [],
    createdAt: 1735689600000,
  });
  const parsed = JSON.parse(legacyJson) as WorkoutSession;
  assert.equal(parsed.source, undefined);
  assert.equal(parsed.id, 'old-1');
});
