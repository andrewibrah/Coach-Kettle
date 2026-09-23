export type ValidationResult<T, F extends string> =
  | { valid: true; value: T; errors: Partial<Record<F, string>> }
  | { valid: false; errors: Partial<Record<F, string>> };

function success<T, F extends string>(value: T): ValidationResult<T, F> {
  return { valid: true, value, errors: {} };
}

function failure<F extends string>(field: F, message: string): ValidationResult<never, F> {
  return { valid: false, errors: { [field]: message } as Record<F, string> };
}

// Decimal notation only; Number() alone also accepts hex and empty strings.
export function parseFiniteNumber<F extends string>(input: string, field: F, label: string): ValidationResult<number, F> {
  const text = input.trim();
  const value = Number(text);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) && Number.isFinite(value)
    ? success(value)
    : failure(field, `${label} must be a finite number.`);
}

function integer<F extends string>(input: string, field: F, label: string, minimum = 1): ValidationResult<number, F> {
  const result = parseFiniteNumber(input, field, label);
  if (!result.valid) return result;
  // 2147483647 = int4 max; complete_onboarding_atomic rejects anything larger.
  return Number.isSafeInteger(result.value) && result.value >= minimum && result.value <= 2147483647
    ? result
    : failure(field, `${label} must be ${minimum === 0 ? 'a nonnegative' : 'a positive'} integer.`);
}

function optionalRange<F extends string>(input: string, field: F, label: string, min: number, max: number): ValidationResult<number | null, F> {
  if (!input.trim()) return success(null);
  const result = parseFiniteNumber(input, field, label);
  if (!result.valid) return result;
  return result.value >= min && result.value <= max
    ? result : failure(field, `${label} must be between ${min} and ${max}.`);
}

export function validateAge(input: string): ValidationResult<number | null, 'age'> {
  const result = optionalRange(input, 'age', 'Age', 13, 120);
  if (!result.valid || result.value === null) return result;
  return Number.isSafeInteger(result.value) ? result : failure('age', 'Age must be a whole number.');
}

/** Approximate birth date policy, not an exact DOB. The caller supplies the year. */
export function approximateBirthDate(age: number, currentYear: number): string {
  if (!Number.isInteger(age) || age < 13 || age > 120 || !Number.isInteger(currentYear)
    || currentYear - age < 1 || currentYear > 9999) throw new RangeError('Invalid age or current year.');
  return `${String(currentYear - age).padStart(4, '0')}-01-01`;
}

export function cmToInches(cm: number): number { return cm / 2.54; }
export function inchesToCm(inches: number): number { return inches * 2.54; }

/** Both height validators return unrounded canonical inches. */
export function validateHeightCm(input: string): ValidationResult<number | null, 'height'> {
  const result = optionalRange(input, 'height', 'Height (cm)', 50, 300);
  return result.valid ? success(result.value === null ? null : cmToInches(result.value)) : result;
}

export function validateHeightImperial(feet: string, inches: string): ValidationResult<number | null, 'feet' | 'inches' | 'height'> {
  if (!feet.trim() && !inches.trim()) return success(null);
  const ft = integer(feet.trim() || '0', 'feet', 'Feet', 0);
  const inch = integer(inches.trim() || '0', 'inches', 'Inches', 0);
  if (!ft.valid || !inch.valid) return { valid: false, errors: { ...ft.errors, ...inch.errors } };
  const total = ft.value * 12 + inch.value;
  return Number.isFinite(total) && total >= 20 && total <= 120
    ? success(total) : failure('height', 'Height must be between 20 and 120 inches.');
}

export type HeightUnit = 'cm' | 'in';
/** Keep canonicalInches in state; display strings must not be fed back on unit toggles. */
export function displayHeight(canonicalInches: number | null, unit: HeightUnit): { value: string; feet: string; inches: string } {
  if (canonicalInches === null) return { value: '', feet: '', inches: '' };
  const rounded = Math.round(canonicalInches);
  return {
    value: String(unit === 'cm' ? Math.round(inchesToCm(canonicalInches)) : rounded),
    feet: String(Math.floor(rounded / 12)),
    inches: String(rounded % 12),
  };
}

export type WeightUnit = 'lb' | 'kg';
export function validateWeight(input: string, unit: WeightUnit): ValidationResult<number | null, 'weight'> {
  return optionalRange(input, 'weight', `Weight (${unit})`, unit === 'lb' ? 50 : 20, unit === 'lb' ? 1000 : 450);
}
export function lbToKg(lb: number): number { return lb * 0.45359237; }
export function kgToLb(kg: number): number { return kg / 0.45359237; }
export type WeightPair = Readonly<{ current_weight: number | null; goal_weight: number | null }>;
/** Convert both fields using the same old unit; null is deliberately never defaulted. */
export function convertWeightPair(values: WeightPair, oldUnit: WeightUnit, newUnit: WeightUnit): WeightPair & { weight_unit: WeightUnit } {
  const convert = (value: number | null) => value === null || oldUnit === newUnit
    ? value : newUnit === 'kg' ? lbToKg(value) : kgToLb(value);
  return { current_weight: convert(values.current_weight), goal_weight: convert(values.goal_weight), weight_unit: newUnit };
}

declare const validPR: unique symbol;
export type ParsedPRPair = Readonly<{ weight: number; reps: number; [validPR]: true }>;
export function validatePRPair(weight: string, reps: string): ValidationResult<ParsedPRPair | null, 'weight' | 'reps'> {
  if (!weight.trim() && !reps.trim()) return success(null);
  const w = weight.trim() ? parseFiniteNumber(weight, 'weight', 'PR weight') : failure('weight', 'PR weight is required.');
  const r = reps.trim() ? integer(reps, 'reps', 'PR reps') : failure('reps', 'PR reps are required.');
  const errors = { ...w.errors, ...r.errors };
  if (w.valid && w.value <= 0) errors.weight = 'PR weight must be positive.';
  if (!w.valid || !r.valid || errors.weight) return { valid: false, errors };
  const estimate = r.value === 1 ? w.value : w.value * (1 + r.value / 30);
  if (!Number.isFinite(estimate)) return failure('weight', 'PR weight and reps must produce a finite estimated one-rep max.');
  return success(Object.freeze({ weight: w.value, reps: r.value }) as ParsedPRPair);
}

/** Epley estimate, in the same weight unit as the validated pair. */
export function estimatedOneRepMax(pair: ParsedPRPair): number {
  const estimate = pair.reps === 1 ? pair.weight : pair.weight * (1 + pair.reps / 30);
  if (!Number.isFinite(estimate)) throw new RangeError('Estimated one-rep max must be finite.');
  return estimate;
}

export function validateTemplateLift(name: string, sets: string, reps: string): ValidationResult<{ name: string; sets: number; reps: number }, 'name' | 'sets' | 'reps'> {
  const s = integer(sets, 'sets', 'Sets');
  const r = integer(reps, 'reps', 'Reps');
  const errors = { ...s.errors, ...r.errors, ...(!name.trim() ? { name: 'Lift name is required.' } : {}) };
  if (!s.valid || !r.valid || !name.trim()) return { valid: false, errors };
  return success({ name: name.trim(), sets: s.value, reps: r.value });
}

// ---- Screen helpers: SQL bounds are those enforced by complete_onboarding_atomic. ----

const HEIGHT_BOUNDS: Record<HeightUnit, readonly [number, number]> = { cm: [50, 300], in: [20, 120] };
const WEIGHT_BOUNDS: Record<WeightUnit, readonly [number, number]> = { lb: [50, 1000], kg: [20, 450] };
// Strip floating-point noise from height round trips (e.g. 50 cm -> in -> cm) without display rounding.
const stored = (value: number) => Math.round(value * 1e6) / 1e6;

/** Age shown for an approximate DOB; reads the year from the string (Date() would shift by timezone). */
export function ageFromApproximateBirthDate(dob: string | null | undefined, currentYear: number): string {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dob ?? '');
  return match ? String(currentYear - Number(match[1])) : '';
}

export function heightToCanonical(value: number | null | undefined, unit: HeightUnit | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return unit === 'cm' ? cmToInches(value) : value;
}

export function heightForStorage(canonicalInches: number | null, unit: HeightUnit): { height_value: number | null; height_unit: HeightUnit | null } {
  if (canonicalInches === null) return { height_value: null, height_unit: null };
  return { height_value: stored(unit === 'cm' ? inchesToCm(canonicalInches) : canonicalInches), height_unit: unit };
}

export type HeightInputs = Readonly<{ unit: HeightUnit; value: string; feet: string; inches: string }>;

/** Parse the visible inputs strictly; an untouched display of `prior` keeps the unrounded prior value. */
export function resolveHeightInput(inputs: HeightInputs, prior: number | null): ValidationResult<number | null, 'feet' | 'inches' | 'height'> {
  const shown = displayHeight(prior, inputs.unit);
  const untouched = inputs.unit === 'cm'
    ? inputs.value.trim() === shown.value
    : inputs.feet.trim() === shown.feet && inputs.inches.trim() === shown.inches;
  if (prior !== null && untouched) return success(prior);
  return inputs.unit === 'cm' ? validateHeightCm(inputs.value) : validateHeightImperial(inputs.feet, inputs.inches);
}

/** Convert on unit change; invalid input or a value outside the new unit's bounds keeps the old unit. */
export function switchHeightUnit(inputs: HeightInputs, prior: number | null, newUnit: HeightUnit)
  : ValidationResult<{ canonical: number | null; display: { value: string; feet: string; inches: string } }, 'feet' | 'inches' | 'height'> {
  const resolved = resolveHeightInput(inputs, prior);
  if (!resolved.valid) return resolved;
  const canonical = resolved.value;
  if (canonical !== null) {
    const value = heightForStorage(canonical, newUnit).height_value!;
    const [min, max] = HEIGHT_BOUNDS[newUnit];
    if (value < min || value > max) {
      return failure('height', newUnit === 'cm'
        ? `Height must be between ${min} and ${max} cm.`
        : `Height must be between ${min} and ${max} inches.`);
    }
  }
  return success({ canonical, display: displayHeight(canonical, newUnit) });
}

export type WeightState = WeightPair & Readonly<{ weight_unit: WeightUnit }>;
type WeightSource = Readonly<{ current_weight?: number | null; goal_weight?: number | null; weight_unit?: WeightUnit | null }>;

/** Draft wins per field, including explicit null; profile values are converted into the shared draft unit. */
export function resolveWeightState(draft: WeightSource, profile: WeightSource | null | undefined): WeightState {
  const unit = draft.weight_unit ?? profile?.weight_unit ?? 'lb';
  const profileUnit = profile?.weight_unit ?? unit;
  const pick = (key: 'current_weight' | 'goal_weight') => {
    if (draft[key] !== undefined) return draft[key] ?? null;
    const value = profile?.[key];
    return value === null || value === undefined ? null : convertWeightPair({ current_weight: value, goal_weight: null }, profileUnit, unit).current_weight;
  };
  return { current_weight: pick('current_weight'), goal_weight: pick('goal_weight'), weight_unit: unit };
}

export function formatWeight(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 10) / 10);
}

/** Strict parse of the visible weight; an untouched display of `prior` keeps the unrounded value. */
export function resolveWeightInput(input: string, prior: number | null, unit: WeightUnit): ValidationResult<number | null, 'weight'> {
  if (prior !== null && input.trim() === formatWeight(prior)) return success(prior);
  return validateWeight(input, unit);
}

/** Convert both stored weights and the shared unit together; refuse if either leaves the new unit's bounds. */
export function switchWeightUnit(state: WeightState, field: 'current_weight' | 'goal_weight', input: string, newUnit: WeightUnit)
  : ValidationResult<{ update: WeightState; display: string }, 'weight'> {
  const edited = resolveWeightInput(input, state[field], state.weight_unit);
  if (!edited.valid) return edited;
  const converted = convertWeightPair({ ...state, [field]: edited.value }, state.weight_unit, newUnit);
  const update = { current_weight: converted.current_weight, goal_weight: converted.goal_weight, weight_unit: newUnit };
  const [min, max] = WEIGHT_BOUNDS[newUnit];
  for (const key of ['current_weight', 'goal_weight'] as const) {
    const value = update[key];
    if (value !== null && (value < min || value > max)) {
      return failure('weight', `${key === 'current_weight' ? 'Current' : 'Goal'} weight must be between ${min} and ${max} ${newUnit} to switch units.`);
    }
  }
  return success({ update, display: formatWeight(update[field]) });
}
