import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMealPlan } from '../_shared/mealPlanValidation.ts';

// Synthetic unit-test food estimates only; not real provider output or dietary advice.
const keys = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const;
const policy = {
  targetRelativeTolerance: 0.05, // Existing provider prompt's ±5% policy.
  consistencyAbsoluteTolerance: { calories: 2, protein_g: 0.2, carbs_g: 0.2, fat_g: 0.2 },
};
function food(name: string, grams: number, calories: number, protein_g: number, carbs_g: number, fat_g: number) {
  return { name, grams, calories, protein_g, carbs_g, fat_g };
}
function fixture() {
  const menus = [
    [food('Rolled oats', 60, 228, 8, 41, 4), food('Milk', 200, 100, 7, 10, 3), food('Blueberries', 100, 57, 1, 14, 0)],
    [food('Chicken breast', 150, 248, 46, 0, 5), food('Cooked brown rice', 200, 246, 5, 51, 2), food('Broccoli', 100, 35, 2, 7, 0)],
    [food('Salmon', 150, 309, 33, 0, 18), food('Baked potato', 250, 233, 6, 53, 0), food('Green beans', 100, 35, 2, 8, 0)],
    [food('Plain Greek yogurt', 200, 146, 20, 8, 4), food('Banana', 120, 107, 1, 27, 0), food('Almonds', 30, 174, 6, 6, 15)],
  ];
  const slots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
  const dates = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'];
  const meals = dates.flatMap((date, day_of_week) => menus.map((items, slot) => ({
    date, day_of_week, is_training_day: [1, 3, 5].includes(day_of_week), meal_slot: slots[slot],
    title: `${items[0].name} with ${items[1].name}`, description: 'Cook and serve the listed portions.',
    ...Object.fromEntries(keys.map(key => [key, items.reduce((sum, item) => sum + item[key], 0)])),
    fiber_g: 5, items: structuredClone(items),
  })));
  const target = Object.fromEntries(keys.map(key => [key, menus.flat().reduce((sum, item) => sum + item[key], 0)]));
  const expected = dates.map((date, day) => ({ date, is_training_day: [1, 3, 5].includes(day), target: { ...target } }));
  return { plan: { meals }, expected };
}

test('rejects an empty provider response instead of manufacturing meals', () => {
  assert.equal(validateMealPlan({}, [], {}).ok, false);
});
test('accepts a complete realistic week without changing it', () => {
  const { plan, expected } = fixture();
  const before = structuredClone(plan);
  const result = validateMealPlan(plan, expected, policy);
  assert.equal(result.ok, true);
  assert.deepEqual(plan, before);
});

function rejects(name: string, change: (f: ReturnType<typeof fixture>) => void) {
  test(name, () => {
    const f = fixture();
    change(f);
    const before = structuredClone(f);
    assert.equal(validateMealPlan(f.plan, f.expected, policy).ok, false);
    assert.deepEqual(f, before, 'invalid input must not be repaired');
  });
}
rejects('missing meal', f => { f.plan.meals.pop(); });
rejects('extra meal', f => { f.plan.meals.push(f.plan.meals[0]); });
rejects('missing day', f => { f.plan.meals.splice(0, 4); });
rejects('duplicate day', f => { for (const m of f.plan.meals.slice(4, 8)) { m.date = f.plan.meals[0].date; m.day_of_week = 0; } });
rejects('duplicate slot', f => { f.plan.meals[0].meal_slot = 'lunch'; });
rejects('unknown slot', f => { Object.assign(f.plan.meals[0], { meal_slot: 'brunch' }); });
for (const date of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-9-13', '2026-09-20', '2026-09-13T00:00:00Z']) {
  rejects(`invalid or unexpected date ${date}`, f => { f.plan.meals[0].date = date; });
}
rejects('weekday disagrees with date', f => { f.plan.meals[0].day_of_week = 1; });
rejects('wrong training flag', f => { f.plan.meals[0].is_training_day = true; });
rejects('string training flag', f => { Object.assign(f.plan.meals[0], { is_training_day: 'false' }); });
for (const value of [NaN, Infinity, -Infinity, '100', -1, null, true]) {
  for (const key of keys) {
    rejects(`invalid item ${key}: ${String(value)}`, f => { Object.assign(f.plan.meals[0].items[0], { [key]: value }); });
    rejects(`invalid meal ${key}: ${String(value)}`, f => { Object.assign(f.plan.meals[0], { [key]: value }); });
  }
}
for (const value of [0, -1, NaN, Infinity, '60', null]) {
  rejects(`invalid grams ${String(value)}`, f => { Object.assign(f.plan.meals[0].items[0], { grams: value }); });
  rejects(`invalid optional servings ${String(value)}`, f => { Object.assign(f.plan.meals[0].items[0], { servings: value }); });
}
rejects('no portion', f => { Reflect.deleteProperty(f.plan.meals[0].items[0], 'grams'); });
rejects('zero calorie item', f => { f.plan.meals[0].items[0].calories = 0; });
for (const name of ['', '   ', 'Placeholder meal', 'TBD', 'Food', '...']) {
  rejects(`empty or placeholder food: ${name}`, f => { f.plan.meals[0].items[0].name = name; });
}
rejects('empty title', f => { f.plan.meals[0].title = ' '; });
rejects('empty items', f => { f.plan.meals[0].items = []; });
rejects('too many items', f => { f.plan.meals[0].items = Array(13).fill(f.plan.meals[0].items[0]); });
rejects('overlong name', f => { f.plan.meals[0].items[0].name = 'a'.repeat(81); });
rejects('overlong title', f => { f.plan.meals[0].title = 'a'.repeat(121); });
rejects('overlong description', f => { f.plan.meals[0].description = 'a'.repeat(501); });
rejects('unknown nested field', f => { Object.assign(f.plan.meals[0].items[0], { nutrition: { calories: 100 } }); });
rejects('unknown root field', f => { Object.assign(f.plan, { allergy_safe: true }); });
rejects('unknown meal field', f => { Object.assign(f.plan.meals[0], { target: 100 }); });
rejects('missing macro', f => { Reflect.deleteProperty(f.plan.meals[0].items[0], 'fat_g'); });
rejects('invalid fiber', f => { f.plan.meals[0].fiber_g = -1; });
for (const key of keys) {
  rejects(`meal/item totals disagree: ${key}`, f => { Object.assign(f.plan.meals[0], { [key]: 9000 }); });
  rejects(`day target disagrees: ${key}`, f => { f.expected[0].target[key] *= 1.2; });
}
rejects('missing authoritative day', f => { f.expected.pop(); });
rejects('duplicate authoritative day', f => { f.expected[1] = f.expected[0]; });
rejects('invalid authoritative date', f => { f.expected[0].date = '2026-02-30'; });
rejects('missing authoritative flag', f => { Reflect.deleteProperty(f.expected[0], 'is_training_day'); });
rejects('missing authoritative target', f => { Reflect.deleteProperty(f.expected[0].target, 'fat_g'); });
rejects('nonfinite authoritative target', f => { f.expected[0].target.calories = Infinity; });
rejects('nonconsecutive authoritative week', f => { f.expected[6].date = '2026-09-21'; });
test('policy is required, finite, complete and not silently defaulted', () => {
  const { plan, expected } = fixture();
  for (const bad of [undefined, {}, { ...policy, targetRelativeTolerance: Infinity },
    { ...policy, targetRelativeTolerance: -1 }, { ...policy, targetRelativeTolerance: 1 },
    { ...policy, consistencyAbsoluteTolerance: {} }]) {
    assert.equal(validateMealPlan(plan, expected, bad).ok, false);
  }
});
test('positive servings alone are supported', () => {
  const { plan, expected } = fixture();
  const item = plan.meals[0].items[0];
  Reflect.deleteProperty(item, 'grams');
  Object.assign(item, { servings: 1 });
  assert.equal(validateMealPlan(plan, expected, policy).ok, true);
});
test('meal rounding policy is explicit and enforced', () => {
  const { plan, expected } = fixture();
  Object.assign(plan.meals[0], { calories: 387 }); // Sum is 385; +2 permitted.
  assert.equal(validateMealPlan(plan, expected, policy).ok, true);
  Object.assign(plan.meals[0], { calories: 387.01 });
  assert.equal(validateMealPlan(plan, expected, policy).ok, false);
});
test('day target checks item sums too, preventing rounding from hiding target misses', () => {
  const { plan, expected } = fixture();
  const exact = { ...policy, targetRelativeTolerance: 0 };
  expected[0].target.calories += 2;
  Object.assign(plan.meals[0], { calories: 387 });
  assert.equal(validateMealPlan(plan, expected, exact).ok, false);
});
test('rejects accessors without invoking them', () => {
  const { plan, expected } = fixture();
  let called = false;
  Object.defineProperty(plan.meals[0].items[0], 'name', { get() { called = true; return 'Oats'; } });
  assert.equal(validateMealPlan(plan, expected, policy).ok, false);
  assert.equal(called, false);
});
test('rejects null, primitive, sparse, cyclic and inherited shapes', () => {
  const { plan, expected } = fixture();
  const cycle = { meals: [] as unknown[] }; cycle.meals.push(cycle);
  for (const bad of [null, 7, 'meals', [], { meals: Array(28) }, cycle, Object.create(plan)]) {
    assert.equal(validateMealPlan(bad, expected, policy).ok, false);
  }
});
