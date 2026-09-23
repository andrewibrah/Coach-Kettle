/**
 * Pure, fail-closed validation of the meal-plan provider JSON (no app imports).
 * Contract: existing { meals: [...] } with REQUIRED `date: YYYY-MM-DD` added to
 * each meal; day_of_week remains 0=Sunday and must agree with that date.
 * Caller supplies seven consecutive authoritative dates, training flags and
 * complete calorie/P/C/F targets. Never derive these from model output/profile.
 *
 * Existing meal-plan/index.ts prompt establishes ±5% daily target tolerance.
 * Callers MUST explicitly supply policy; tighter target tolerance is permitted.
 * No existing arithmetic consistency tolerance was found. Suggested caller
 * policy: 2 kcal / 0.2g per meal, solely for rounding consistency, NOT clinical
 * accuracy. Caps allow at most 1 kcal / 0.1g rounded per each of 12 items plus
 * the declared meal total (13 kcal / 1.3g). No implicit defaults or clamps.
 * Compare both summed item and declared meal daily macros to the day target.
 * There is no declared day-total field in the existing contract. Unknown fields,
 * including invented day totals, are rejected rather than silently discarded.
 * Fiber is meal-only in PlannedMealItem; validate its finite nonnegative value,
 * but do not pretend item fiber, saturated fat or 4/4/9 energy are verified.
 *
 * Resource limits retain existing cleaner limits: 12 items, name 80, title 120,
 * description 500 UTF-16 code units. Exactly 28 meals, fixed-depth strict keys;
 * no recursive traversal of arbitrary extras. Caller MUST bound raw provider
 * response bytes BEFORE JSON.parse (suggested 256 KiB) and detect truncation.
 * This validator cannot recover resources already consumed parsing a response.
 *
 * Named foods/positive portions and common placeholder rejection are structural
 * checks only: names cannot prove food identity, nutrient truth, allergy safety,
 * dietary suitability or food/portion plausibility. No allergy-safe claim is
 * made. A trusted food-source/safety layer is a separate integration concern.
 */
export const MEAL_PLAN_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MACROS = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const;
export type MealPlanMacros = Record<typeof MACROS[number], number>;
export interface ExpectedMealPlanDay {
  date: string;
  is_training_day: boolean;
  target: MealPlanMacros;
}
export interface MealPlanValidationPolicy {
  targetRelativeTolerance: number;
  consistencyAbsoluteTolerance: MealPlanMacros;
}
export interface ValidatedMealPlanItem extends MealPlanMacros {
  name: string;
  grams?: number;
  servings?: number;
}
export interface ValidatedMealPlanMeal extends MealPlanMacros {
  date: string;
  day_of_week: number;
  is_training_day: boolean;
  meal_slot: typeof MEAL_PLAN_SLOTS[number];
  title: string;
  description: string;
  fiber_g: number;
  items: ValidatedMealPlanItem[];
}
export interface ValidatedMealPlan { meals: ValidatedMealPlanMeal[] }
export type MealPlanValidationResult =
  | { ok: true; plan: ValidatedMealPlan }
  | { ok: false; error: { code: 'INVALID_MEAL_PLAN'; path: string; reason: string } };

class InvalidPlan extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(reason);
    this.path = path;
  }
}
function requireValid(condition: unknown, path: string, reason: string): asserts condition {
  if (!condition) throw new InvalidPlan(path, reason);
}

// Own enumerable data properties only. Do not execute getters or accept class
// instances/inherited fields. JSON.parse results satisfy these requirements.
function record(value: unknown, required: readonly string[], optional: readonly string[], path: string): Record<string, unknown> {
  requireValid(typeof value === 'object' && value !== null && !Array.isArray(value), path, 'Expected object');
  const proto = Object.getPrototypeOf(value);
  requireValid(proto === Object.prototype || proto === null, path, 'Expected plain object');
  const keys = Reflect.ownKeys(value);
  requireValid(keys.length >= required.length && keys.length <= required.length + optional.length, path, 'Unexpected or missing fields');
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    requireValid(typeof key === 'string' && (required.includes(key) || optional.includes(key)), path, 'Unknown field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValid(descriptor && 'value' in descriptor && descriptor.enumerable, path, 'Expected enumerable data field');
    out[key] = descriptor.value;
  }
  for (const key of required) requireValid(Object.hasOwn(out, key), `${path}.${key}`, 'Missing field');
  return out;
}
function array(value: unknown, min: number, max: number, path: string): unknown[] {
  requireValid(Array.isArray(value) && value.length >= min && value.length <= max, path, 'Invalid array length');
  requireValid(Reflect.ownKeys(value).length === value.length + 1, path, 'Sparse array or extra fields');
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireValid(descriptor && 'value' in descriptor && descriptor.enumerable, `${path}[${i}]`, 'Expected array data element');
    out.push(descriptor.value);
  }
  return out;
}
function number(value: unknown, path: string, positive = false): number {
  requireValid(typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0), path, 'Expected finite numeric value in range');
  return value;
}
function text(value: unknown, max: number, path: string, nonblank = true): string {
  requireValid(typeof value === 'string' && value.length <= max && (!nonblank || value.trim().length > 0), path, 'Invalid text');
  return value;
}
function isoDate(value: unknown, path: string): string {
  requireValid(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000'), path, 'Expected ISO calendar date');
  const date = new Date(`${value}T00:00:00.000Z`);
  requireValid(Number.isFinite(date.getTime()) && date.toISOString().substring(0, 10) === value, path, 'Invalid calendar date');
  return value;
}
function macros(value: Record<string, unknown>, path: string): MealPlanMacros {
  return {
    calories: number(value.calories, `${path}.calories`, true),
    protein_g: number(value.protein_g, `${path}.protein_g`),
    carbs_g: number(value.carbs_g, `${path}.carbs_g`),
    fat_g: number(value.fat_g, `${path}.fat_g`),
  };
}
function zero(): MealPlanMacros { return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }; }
function add(sum: MealPlanMacros, value: MealPlanMacros, path: string): void {
  for (const key of MACROS) sum[key] = number(sum[key] + value[key], path);
}
function within(actual: number, expected: number, tolerance: number): boolean {
  // Only floating point summation noise, not an extra nutritional tolerance.
  const epsilon = Number.EPSILON * Math.max(1, actual, expected) * 32;
  return Math.abs(actual - expected) <= tolerance + epsilon;
}

/** Returns a detached validated plan or one bounded error; never partial meals. */
export function validateMealPlan(input: unknown, expectedDays: unknown, policy: unknown): MealPlanValidationResult {
  try {
    const p = record(policy, ['targetRelativeTolerance', 'consistencyAbsoluteTolerance'], [], 'policy');
    const relative = number(p.targetRelativeTolerance, 'policy.targetRelativeTolerance');
    requireValid(relative <= 0.05, 'policy.targetRelativeTolerance', 'Must not exceed existing 5% target policy');
    const rounding = record(p.consistencyAbsoluteTolerance, MACROS, [], 'policy.consistencyAbsoluteTolerance');
    const tolerance = zero();
    for (const key of MACROS) {
      tolerance[key] = number(rounding[key], `policy.consistencyAbsoluteTolerance.${key}`);
      requireValid(tolerance[key] <= (key === 'calories' ? 13 : 1.3), 'policy.consistencyAbsoluteTolerance', 'Exceeds rounding-only ceiling');
    }
    const expected = new Map<string, ExpectedMealPlanDay>();
    for (const [i, raw] of array(expectedDays, 7, 7, 'expectedDays').entries()) {
      const path = `expectedDays[${i}]`;
      const day = record(raw, ['date', 'is_training_day', 'target'], [], path);
      const date = isoDate(day.date, `${path}.date`);
      requireValid(!expected.has(date), path, 'Duplicate expected date');
      requireValid(typeof day.is_training_day === 'boolean', path, 'Expected authoritative training flag');
      const target = macros(record(day.target, MACROS, [], `${path}.target`), `${path}.target`);
      expected.set(date, { date, is_training_day: day.is_training_day, target });
    }
    const dates = [...expected.keys()].sort();
    for (let i = 1; i < dates.length; i++) {
      requireValid(Date.parse(dates[i]) - Date.parse(dates[i - 1]) === 86400000, 'expectedDays', 'Expected seven consecutive dates');
    }
    const root = record(input, ['meals'], [], 'plan');
    const seen = new Set<string>();
    const mealTotals = new Map(dates.map(date => [date, zero()]));
    const itemTotals = new Map(dates.map(date => [date, zero()]));
    const meals: ValidatedMealPlanMeal[] = [];
    for (const [i, raw] of array(root.meals, 28, 28, 'plan.meals').entries()) {
      const path = `plan.meals[${i}]`;
      const meal = record(raw, ['date', 'day_of_week', 'is_training_day', 'meal_slot', 'title', 'description', ...MACROS, 'fiber_g', 'items'], [], path);
      const date = isoDate(meal.date, `${path}.date`);
      const day = expected.get(date);
      requireValid(day, `${path}.date`, 'Unexpected date');
      requireValid(meal.day_of_week === new Date(`${date}T00:00:00Z`).getUTCDay(), path, 'Weekday disagrees with date');
      requireValid(meal.is_training_day === day.is_training_day, path, 'Training flag disagrees with authoritative day');
      requireValid(typeof meal.meal_slot === 'string' && MEAL_PLAN_SLOTS.some(slot => slot === meal.meal_slot), path, 'Invalid meal slot');
      const slot = meal.meal_slot as ValidatedMealPlanMeal['meal_slot'];
      const identity = `${date}/${slot}`;
      requireValid(!seen.has(identity), path, 'Duplicate date/slot');
      seen.add(identity);
      const totals = macros(meal, path);
      const sum = zero();
      const items: ValidatedMealPlanItem[] = [];
      for (const [j, rawItem] of array(meal.items, 1, 12, `${path}.items`).entries()) {
        const itemPath = `${path}.items[${j}]`;
        const item = record(rawItem, ['name', ...MACROS], ['grams', 'servings'], itemPath);
        const name = text(item.name, 80, `${itemPath}.name`);
        const label = name.trim().toLowerCase();
        requireValid(!['food', 'meal', 'tbd', 'n/a', '...', 'unknown'].includes(label) && !label.includes('placeholder'), `${itemPath}.name`, 'Placeholder food');
        requireValid(Object.hasOwn(item, 'grams') || Object.hasOwn(item, 'servings'), itemPath, 'Missing portion');
        const portion: { grams?: number; servings?: number } = {};
        for (const key of ['grams', 'servings'] as const) {
          if (Object.hasOwn(item, key)) portion[key] = number(item[key], `${itemPath}.${key}`, true);
        }
        const nutrients = macros(item, itemPath);
        add(sum, nutrients, itemPath);
        items.push({ name, ...portion, ...nutrients });
      }
      for (const key of MACROS) requireValid(within(totals[key], sum[key], tolerance[key]), `${path}.${key}`, 'Item sum disagrees with meal total');
      add(mealTotals.get(date)!, totals, path);
      add(itemTotals.get(date)!, sum, path);
      meals.push({ date, day_of_week: meal.day_of_week as number, is_training_day: day.is_training_day,
        meal_slot: slot, title: text(meal.title, 120, `${path}.title`),
        description: text(meal.description, 500, `${path}.description`, false),
        ...totals, fiber_g: number(meal.fiber_g, `${path}.fiber_g`), items });
    }
    for (const date of dates) {
      for (const slot of MEAL_PLAN_SLOTS) requireValid(seen.has(`${date}/${slot}`), 'plan.meals', 'Missing date/slot');
      const target = expected.get(date)!.target;
      for (const key of MACROS) {
        const allowed = target[key] * relative;
        requireValid(within(mealTotals.get(date)![key], target[key], allowed) && within(itemTotals.get(date)![key], target[key], allowed), `plan.${date}.${key}`, 'Day sum disagrees with authoritative target');
      }
    }
    return { ok: true, plan: { meals } };
  } catch (error) {
    return { ok: false, error: { code: 'INVALID_MEAL_PLAN', path: error instanceof InvalidPlan ? error.path : 'plan', reason: error instanceof InvalidPlan ? error.message : 'Malformed data' } };
  }
}
