import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubmitGuard } from '../submitGuard.ts';

test('a second submit while one is in flight is ignored', async () => {
  const guard = createSubmitGuard();
  let release!: () => void;
  let runs = 0;
  const first = guard.run(async () => { runs++; await new Promise<void>((resolve) => { release = resolve; }); });
  assert.equal(guard.active, true);
  assert.equal(await guard.run(async () => { runs++; }), false);
  release();
  assert.equal(await first, true);
  assert.equal(runs, 1);
  assert.equal(guard.active, false);
});

test('a failure propagates and the guard resets for the next submit', async () => {
  const guard = createSubmitGuard();
  await assert.rejects(guard.run(async () => { throw new Error('offline'); }), /offline/);
  assert.equal(guard.active, false);
  assert.equal(await guard.run(async () => {}), true);
});

test('the guard is taken synchronously, before the task awaits', () => {
  const guard = createSubmitGuard();
  void guard.run(() => new Promise<void>(() => {}));
  assert.equal(guard.active, true);
});
