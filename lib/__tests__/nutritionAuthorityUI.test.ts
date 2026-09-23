import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as targets from '../nutritionTargets.ts';
import * as storage from '../nutritionTargetStorage.ts';

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const edge = readFileSync(new URL('../../supabase/functions/nutrition-targets/index.ts', import.meta.url), 'utf8');
const validate = vm.runInNewContext(ts.transpileModule(edge.slice(edge.indexOf('const DURABLE_SOURCES'), edge.indexOf('// Verify the receipt')) + '\nvalidSavePayload;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText);
const wire = (req: any) => JSON.parse(JSON.stringify({ action: 'save_set', ...req }));
test('first weekly import requires an explicitly saved daily parent', () => {
  assert.throws(() => storage.buildWeeklyImportSaveRequest({ 1: macro }, null, true), /daily.*first/i);
});
test('real JSON SQL null parents are omitted and accepted by the actual save validator', () => {
  for (const row of [
    { ...saved, training_day_target: null, rest_day_target: null },
    { ...saved, training_day_target: macro, rest_day_target: macro },
    { ...saved, base_target: null, training_day_target: macro, rest_day_target: null },
  ]) {
    const request = wire(storage.buildWeeklyImportSaveRequest({ 1: macro }, JSON.parse(JSON.stringify(row)), true));
    assert.equal(validate(request), true, JSON.stringify(request));
  }
});
const macro = { calories: 2100, protein_g: 150, carbs_g: 220, fat_g: 70 };
const saved: any = { id: 's', user_id: 'u', source: 'manual', base_target: macro, updated_at: '', created_at: '' };
test('approved selection excludes device previews and blocks incomplete selected macros', () => {
  const resolve = (targets as any).resolveApprovedClientTarget;
  assert.equal(typeof resolve, 'function');
  assert.deepEqual(resolve({ date: '2026-09-14', savedTargets: saved, weeklyGoals: { 1: { ...macro, calories: 9000 } } }).target, macro);
  assert.equal(resolve({ date: '2026-09-14', weeklyGoals: { 1: macro } }).target, null);
  assert.equal(resolve({ date: '2026-09-14', savedTargets: { ...saved, day_overrides: [{ day_of_week: 1, source: 'manual', target: { calories: 2000 } }] } }).target, null);
});
test('weekly import requires confirmation and merges by weekday without clearing other days', () => {
  const build = (storage as any).buildWeeklyImportSaveRequest;
  assert.equal(typeof build, 'function');
  assert.throws(() => build({ 1: macro }, saved, false), /confirm/i);
  const req = build({ 1: macro }, { ...saved, day_overrides: [{ day_of_week: 2, target: macro, source: 'manual' }] }, true);
  assert.deepEqual(req.targets.day_overrides.map((x: any) => x.day_of_week), [1, 2]);
});
