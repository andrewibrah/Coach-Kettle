import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approximateBirthDate, cmToInches, convertWeightPair, displayHeight,
  estimatedOneRepMax, inchesToCm, kgToLb, lbToKg, parseFiniteNumber,
  validateAge, validateHeightCm, validateHeightImperial, validatePRPair,
  validateTemplateLift, validateWeight,
  ageFromApproximateBirthDate, formatWeight, heightForStorage, heightToCanonical,
  resolveHeightInput, resolveWeightInput, resolveWeightState, switchHeightUnit, switchWeightUnit,
} from '../onboardingValidation.ts';
import type { ParsedPRPair, ValidationResult } from '../onboardingValidation.ts';

function value<T, F extends string>(result: ValidationResult<T, F>): T {
  assert.equal(result.valid, true);
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  assert.deepEqual(result.errors, {});
  return result.value;
}
function invalid<T, F extends string>(result: ValidationResult<T, F>, field: F) {
  assert.equal(result.valid, false);
  assert.ok(result.errors[field]);
  assert.equal('value' in result, false);
}
const junk = ['NaN', 'Infinity', '-Infinity', '1e999', '12abc', '1.2.3', '+', '-', '0x10', '1 2'];

test('numeric parsing consumes a full finite decimal string with field-specific errors', () => {
  for (const input of [...junk, '', ' ']) invalid(parseFiniteNumber(input, 'sets', 'Sets'), 'sets');
  for (const [input, expected] of [[' 12.5 ', 12.5], ['.5', 0.5], ['+2', 2], ['1e2', 100]] as const) {
    assert.equal(value(parseFiniteNumber(input, 'weight', 'Weight')), expected);
  }
  assert.match(parseFiniteNumber('junk', 'sets', 'Sets').errors.sets!, /Sets/);
});

test('PR pair requires both fields or neither and returns only validated pairs', () => {
  invalid(validatePRPair('100', ''), 'reps');
  invalid(validatePRPair(' ', '5'), 'weight');
  assert.equal(value(validatePRPair('', ' ')), null);
  for (const input of [...junk, '0', '-1']) invalid(validatePRPair(input, '5'), 'weight');
  for (const input of [...junk, '1.5', '0', '-1']) invalid(validatePRPair('100', input), 'reps');
  const both = validatePRPair('bad', 'bad');
  invalid(both, 'weight');
  invalid(both, 'reps');
  const pair = value(validatePRPair(' 100.5 ', ' 3 '));
  assert.ok(pair);
  assert.deepEqual(pair, { weight: 100.5, reps: 3 });
  assert.equal(estimatedOneRepMax(pair), 100.5 * 1.1);
  assert.equal(estimatedOneRepMax(value(validatePRPair('100', '1'))!), 100);
});

test('integer fields accept safe boundaries within domain limits and reject unsafe integers', () => {
  // Upper bound is the database int4 column limit enforced by complete_onboarding_atomic.
  const int4Max = '2147483647';
  assert.deepEqual(value(validateTemplateLift('Squat', int4Max, int4Max)), {
    name: 'Squat', sets: 2147483647, reps: 2147483647,
  });
  const pair = value(validatePRPair('1', int4Max));
  assert.ok(pair);
  assert.equal(pair.reps, 2147483647);
  assert.ok(Number.isFinite(estimatedOneRepMax(pair)));
  invalid(validateAge(int4Max), 'age');
  const safe = String(Number.MAX_SAFE_INTEGER);
  for (const input of ['2147483648', safe, '9007199254740992', '9007199254740993', '-9007199254740992', '-9007199254740993']) {
    invalid(validateAge(input), 'age');
    invalid(validateTemplateLift('Squat', input, '5'), 'sets');
    invalid(validateTemplateLift('Squat', '3', input), 'reps');
    invalid(validatePRPair('1', input), 'reps');
  }
});

test('PR validation rejects overflowing estimates and preserves finite huge estimates', () => {
  invalid(validatePRPair('1e308', '30'), 'weight');
  for (const [weight, reps, expected] of [
    ['1e308', '1', 1e308],
    ['1e308', '2', 1e308 * (1 + 2 / 30)],
    ['8e307', '30', 1.6e308],
    [String(Number.MAX_VALUE), '1', Number.MAX_VALUE],
  ] as const) {
    const pair = value(validatePRPair(weight, reps));
    assert.ok(pair);
    assert.equal(estimatedOneRepMax(pair), expected);
    assert.ok(Number.isFinite(estimatedOneRepMax(pair)));
  }
});

test('estimatedOneRepMax defensively rejects nonfinite results from forged pairs', () => {
  for (const pair of [
    { weight: 1e308, reps: 30 },
    { weight: Infinity, reps: 1 },
    { weight: NaN, reps: 1 },
    { weight: 100, reps: Infinity },
  ]) {
    assert.throws(() => estimatedOneRepMax(pair as ParsedPRPair), RangeError);
  }
});

test('template lifts require a name and positive safe integer sets and reps without domain caps', () => {
  invalid(validateTemplateLift(' ', '3', '5'), 'name');
  for (const input of ['', ...junk, '0', '-2', '2.5']) {
    invalid(validateTemplateLift('Squat', input, '5'), 'sets');
    invalid(validateTemplateLift('Squat', '3', input), 'reps');
  }
  assert.deepEqual(value(validateTemplateLift(' Squat ', '1000000', '2000000')), { name: 'Squat', sets: 1000000, reps: 2000000 });
});

test('age is optional and restricted to whole ages 13 through 120', () => {
  assert.equal(value(validateAge(' ')), null);
  for (const input of [...junk, '13.5', '0', '-1', '12', '121']) invalid(validateAge(input), 'age');
  for (const age of [13, 40, 120]) {
    assert.equal(value(validateAge(` ${age} `)), age);
    assert.equal(approximateBirthDate(age, 2026), `${2026 - age}-01-01`);
  }
  assert.throws(() => approximateBirthDate(12, 2026), RangeError);
  assert.throws(() => approximateBirthDate(30, NaN), RangeError);
});

test('cm height validates bounds and yields unrounded inches', () => {
  assert.equal(value(validateHeightCm('')), null);
  for (const input of [...junk, '49.9', '300.1', '-1', '0']) invalid(validateHeightCm(input), 'height');
  for (const cm of [50, 182.34, 300]) assert.equal(value(validateHeightCm(String(cm))), cmToInches(cm));
});

test('imperial height permits one omitted component only with a valid total', () => {
  assert.equal(value(validateHeightImperial(' ', '')), null);
  assert.equal(value(validateHeightImperial('5', '')), 60);
  assert.equal(value(validateHeightImperial('', '70')), 70);
  assert.equal(value(validateHeightImperial('1', '8')), 20);
  assert.equal(value(validateHeightImperial('10', '0')), 120);
  for (const input of [...junk, '-1', '1.5']) {
    invalid(validateHeightImperial(input, ''), 'feet');
    invalid(validateHeightImperial('', input), 'inches');
  }
  for (const [feet, inches] of [['1', ''], ['', '19'], ['10', '1'], ['0', '0']]) {
    invalid(validateHeightImperial(feet, inches), 'height');
  }
});

test('display carries rounded inches into feet and retains canonical height on repeated toggles', () => {
  const canonical = value(validateHeightCm('182.34'))!;
  const snapshot = canonical;
  assert.deepEqual(displayHeight(71.9, 'in'), { value: '72', feet: '6', inches: '0' });
  assert.deepEqual(displayHeight(null, 'cm'), { value: '', feet: '', inches: '' });
  for (let i = 0; i < 100; i++) {
    assert.equal(displayHeight(canonical, 'cm').value, '182');
    assert.equal(displayHeight(canonical, 'in').inches, '0');
    assert.equal(canonical, snapshot);
  }
  let converted = canonical;
  for (let i = 0; i < 100; i++) converted = cmToInches(inchesToCm(converted));
  assert.ok(Math.abs(converted - canonical) < 1e-10);
});

test('weight accepts optional finite values within unit-specific inclusive ranges', () => {
  for (const unit of ['lb', 'kg'] as const) {
    assert.equal(value(validateWeight(' ', unit)), null);
    for (const input of [...junk, '0', '-1']) invalid(validateWeight(input, unit), 'weight');
  }
  for (const lb of [50, 150.5, 1000]) assert.equal(value(validateWeight(String(lb), 'lb')), lb);
  for (const kg of [20, 75.5, 450]) assert.equal(value(validateWeight(String(kg), 'kg')), kg);
  for (const input of ['49.99', '1000.01']) invalid(validateWeight(input, 'lb'), 'weight');
  for (const input of ['19.99', '450.01']) invalid(validateWeight(input, 'kg'), 'weight');
});

test('weight conversions atomically convert both values from the old shared unit', () => {
  const original = Object.freeze({ current_weight: 200, goal_weight: 180 });
  const kg = convertWeightPair(original, 'lb', 'kg');
  assert.deepEqual(kg, { current_weight: lbToKg(200), goal_weight: lbToKg(180), weight_unit: 'kg' });
  const lb = convertWeightPair(kg, 'kg', 'lb');
  assert.ok(Math.abs(lb.current_weight! - 200) < 1e-10);
  assert.ok(Math.abs(lb.goal_weight! - 180) < 1e-10);
  assert.equal(kgToLb(kg.current_weight!), lb.current_weight);
  assert.deepEqual(original, { current_weight: 200, goal_weight: 180 });
  assert.deepEqual(convertWeightPair(original, 'lb', 'lb'), { ...original, weight_unit: 'lb' });
});

test('explicit nulls survive conversions in either field and either direction', () => {
  for (const oldUnit of ['lb', 'kg'] as const) {
    for (const newUnit of ['lb', 'kg'] as const) {
      for (const pair of [{ current_weight: null, goal_weight: 100 }, { current_weight: 100, goal_weight: null }, { current_weight: null, goal_weight: null }]) {
        const result = convertWeightPair(Object.freeze(pair), oldUnit, newUnit);
        if (pair.current_weight === null) assert.equal(result.current_weight, null);
        if (pair.goal_weight === null) assert.equal(result.goal_weight, null);
      }
    }
  }
});

// ---- Screen wiring helpers (height/age/current-weight/goal-weight) ----

test('age screen derives the age from the approximate DOB string, not a timezone-shifted Date', () => {
  assert.equal(ageFromApproximateBirthDate('2000-01-01', 2026), '26');
  assert.equal(ageFromApproximateBirthDate(approximateBirthDate(40, 2026), 2026), '40');
  for (const dob of [null, undefined, '', 'junk', '20000-01-01']) assert.equal(ageFromApproximateBirthDate(dob, 2026), '');
});

test('stored height converts to canonical inches and back for storage within SQL bounds', () => {
  assert.equal(heightToCanonical(null, 'cm'), null);
  assert.equal(heightToCanonical(70, 'in'), 70);
  assert.equal(heightToCanonical(182.34, 'cm'), cmToInches(182.34));
  assert.deepEqual(heightForStorage(null, 'cm'), { height_value: null, height_unit: null });
  assert.deepEqual(heightForStorage(70, 'in'), { height_value: 70, height_unit: 'in' });
  // Typed boundaries survive the canonical round trip without floating drift out of bounds.
  assert.deepEqual(heightForStorage(value(validateHeightCm('50'))!, 'cm'), { height_value: 50, height_unit: 'cm' });
  assert.deepEqual(heightForStorage(value(validateHeightCm('300'))!, 'cm'), { height_value: 300, height_unit: 'cm' });
  assert.equal(heightForStorage(value(validateHeightCm('182.34'))!, 'cm').height_value, 182.34);
});

test('untouched height display keeps the unrounded canonical value; edits reparse strictly', () => {
  const prior = cmToInches(182.34);
  const shown = displayHeight(prior, 'in');
  assert.equal(value(resolveHeightInput({ unit: 'in', value: '', feet: shown.feet, inches: shown.inches }, prior)), prior);
  assert.equal(value(resolveHeightInput({ unit: 'cm', value: '182', feet: '', inches: '' }, prior)), prior);
  assert.equal(value(resolveHeightInput({ unit: 'cm', value: '183', feet: '', inches: '' }, prior)), cmToInches(183));
  invalid(resolveHeightInput({ unit: 'cm', value: '183cm', feet: '', inches: '' }, prior), 'height');
  invalid(resolveHeightInput({ unit: 'in', value: '', feet: '5.5', inches: '' }, null), 'feet');
  invalid(resolveHeightInput({ unit: 'in', value: '', feet: '5', inches: '1x' }, null), 'inches');
  assert.equal(value(resolveHeightInput({ unit: 'cm', value: ' ', feet: '', inches: '' }, prior)), null);
});

test('height unit switch converts the canonical value, never shows 12 inches, and refuses bad or out-of-range input', () => {
  let canonical: number | null = cmToInches(182.34);
  let inputs = { unit: 'cm' as const, value: '182', feet: '', inches: '' };
  for (let i = 0; i < 50; i++) {
    const toIn = value(switchHeightUnit(inputs, canonical, 'in'));
    assert.equal(toIn.canonical, canonical);
    assert.notEqual(toIn.display.inches, '12');
    const toCm = value(switchHeightUnit({ unit: 'in', value: '', ...toIn.display }, toIn.canonical, 'cm'));
    assert.equal(toCm.canonical, canonical);
    assert.equal(toCm.display.value, '182');
    canonical = toCm.canonical;
  }
  invalid(switchHeightUnit({ unit: 'in', value: '', feet: '5', inches: '11.9' }, null, 'cm'), 'inches');
  assert.equal(value(switchHeightUnit({ unit: 'cm', value: '', feet: '', inches: '' }, null, 'in')).canonical, null);
  invalid(switchHeightUnit({ unit: 'cm', value: 'abc', feet: '', inches: '' }, null, 'in'), 'height');
  // Boundary values whose conversion leaves the SQL-supported range for the new unit are refused.
  invalid(switchHeightUnit({ unit: 'in', value: '', feet: '10', inches: '0' }, null, 'cm'), 'height');
  invalid(switchHeightUnit({ unit: 'cm', value: '50', feet: '', inches: '' }, null, 'in'), 'height');
  const edge = value(switchHeightUnit({ unit: 'in', value: '', feet: '1', inches: '8' }, null, 'cm'));
  const stored = heightForStorage(edge.canonical, 'cm').height_value!;
  assert.ok(stored >= 50 && stored <= 300);
});

test('weight state respects explicit draft null and converts profile values into the shared draft unit', () => {
  assert.deepEqual(resolveWeightState({}, null), { current_weight: null, goal_weight: null, weight_unit: 'lb' });
  assert.deepEqual(
    resolveWeightState({ current_weight: null, weight_unit: 'lb' }, { current_weight: 200, goal_weight: 180, weight_unit: 'lb' }),
    { current_weight: null, goal_weight: 180, weight_unit: 'lb' },
  );
  const mixed = resolveWeightState({ weight_unit: 'kg', current_weight: 90 }, { current_weight: 200, goal_weight: 180, weight_unit: 'lb' });
  assert.equal(mixed.current_weight, 90);
  assert.equal(mixed.goal_weight, lbToKg(180));
  assert.equal(mixed.weight_unit, 'kg');
});

test('weight input keeps untouched unrounded stored value and reparses edits strictly', () => {
  const stored = lbToKg(200);
  assert.equal(formatWeight(stored), '90.7');
  assert.equal(formatWeight(null), '');
  assert.equal(formatWeight(180), '180');
  assert.equal(value(resolveWeightInput('90.7', stored, 'kg')), stored);
  assert.equal(value(resolveWeightInput('91', stored, 'kg')), 91);
  assert.equal(value(resolveWeightInput(' ', stored, 'kg')), null);
  invalid(resolveWeightInput('91kg', stored, 'kg'), 'weight');
});

test('weight unit switch converts both stored values and the shared unit atomically without relabeling', () => {
  const state = { current_weight: 200, goal_weight: 180, weight_unit: 'lb' as const };
  const toKg = value(switchWeightUnit(state, 'current_weight', '210', 'kg'));
  assert.deepEqual(toKg.update, { current_weight: lbToKg(210), goal_weight: lbToKg(180), weight_unit: 'kg' });
  assert.equal(toKg.display, formatWeight(lbToKg(210)));
  const back = value(switchWeightUnit(toKg.update, 'goal_weight', formatWeight(toKg.update.goal_weight), 'lb'));
  assert.ok(Math.abs(back.update.goal_weight! - 180) < 1e-6);
  assert.ok(Math.abs(back.update.current_weight! - 210) < 1e-6);
  const nulls = value(switchWeightUnit({ current_weight: null, goal_weight: 180, weight_unit: 'lb' }, 'current_weight', '', 'kg'));
  assert.equal(nulls.update.current_weight, null);
  assert.equal(nulls.update.goal_weight, lbToKg(180));
  const same = value(switchWeightUnit(state, 'goal_weight', '180', 'lb'));
  assert.deepEqual(same.update, state);
  invalid(switchWeightUnit(state, 'current_weight', '2x0', 'kg'), 'weight');
  // Conversions that would leave the SQL-supported range are refused, not clamped.
  invalid(switchWeightUnit(state, 'current_weight', '1000', 'kg'), 'weight');
  invalid(switchWeightUnit({ current_weight: 200, goal_weight: 1000, weight_unit: 'lb' }, 'current_weight', '200', 'kg'), 'weight');
  invalid(switchWeightUnit({ current_weight: 20, goal_weight: null, weight_unit: 'kg' }, 'current_weight', '20', 'lb'), 'weight');
  for (const [lo, hi, unit, other] of [[50, 1000, 'lb', 'kg'], [20, 450, 'kg', 'lb']] as const) {
    for (const input of [String(lo + 5), String(hi - 5)]) {
      const r = switchWeightUnit({ current_weight: null, goal_weight: null, weight_unit: unit }, 'current_weight', input, other);
      if (r.valid) {
        const [min, max] = other === 'lb' ? [50, 1000] : [20, 450];
        assert.ok(r.value.update.current_weight! >= min && r.value.update.current_weight! <= max);
      }
    }
  }
});
