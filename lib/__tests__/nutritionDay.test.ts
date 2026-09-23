import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchNutritionDay } from '../nutritionDay.ts';

test('foreground catches a timezone/day change immediately and unsubscribes', () => {
  let day = '2026-09-07';
  let active = () => {};
  let changes = 0;
  let removed = false;
  const stop = watchNutritionDay({ readToday: () => day, onChange: () => { changes++; },
    subscribeActive: (check) => { active = check; return () => { removed = true; }; },
  });
  try {
    day = '2026-09-06';
    active();
    assert.equal(changes, 1);
    active();
    assert.equal(changes, 1);
  } finally { stop(); }
  assert.equal(removed, true);
});

test('active midnight advances once and cleanup stops the clock', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let day = '2026-09-06';
  let changes = 0;
  const stop = watchNutritionDay({
    readToday: () => day,
    onChange: () => { changes++; },
    subscribeActive: () => () => {},
  });
  t.mock.timers.tick(60_000);
  assert.equal(changes, 0);
  day = '2026-09-07';
  t.mock.timers.tick(60_000);
  assert.equal(changes, 1);
  t.mock.timers.tick(60_000);
  assert.equal(changes, 1);
  stop();
  day = '2026-09-08';
  t.mock.timers.tick(60_000);
  assert.equal(changes, 1);
});
