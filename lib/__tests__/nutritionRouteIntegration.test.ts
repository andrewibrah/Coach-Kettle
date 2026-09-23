import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Integration wiring guards, not device interaction coverage.
const plan = readFileSync(new URL('../../app/(tabs)/nutrition/plan.tsx', import.meta.url), 'utf8');
const targets = readFileSync(new URL('../../app/(tabs)/nutrition/targets.tsx', import.meta.url), 'utf8');
test('both mutation actions share synchronous guard and committed readback', () => {
  assert.equal((plan.match(/if \(pending\.current\) return/g) ?? []).length, 2);
  assert.equal((plan.match(/await refreshMealPlan\(result\.plan\.id\)/g) ?? []).length, 2);
  assert.match(plan, /mealPlanStatus === 'error'/);
});
test('device goals upload requires explicit confirmation and states device-only status', () => {
  assert.match(targets, /Alert\.alert\('Import device goals\?'/);
  assert.match(targets, /importWeeklyGoals\(true\)/);
  assert.match(targets, /Device-only/);
});
