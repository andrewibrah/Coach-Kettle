// Integrity only: no effort/medical ranges or inferred loading mode.
export type NumericValue = { kind: 'known'; value: number } | { kind: 'unknown' } | { kind: 'invalid' };
export function numericValue(input: unknown, whole = false): NumericValue {
  if (input === undefined || input === null || (typeof input === 'string' && !input.trim())) return { kind: 'unknown' };
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 && (!whole || Number.isSafeInteger(input))
    ? { kind: 'known', value: input } : { kind: 'invalid' };
  if (typeof input !== 'number' && typeof input !== 'string') return { kind: 'invalid' };
  const token = String(input).trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return { kind: 'invalid' };
  const value = Number(token);
  return Number.isFinite(value) && value >= 0 && (!whole || Number.isSafeInteger(value) && /^\d+$/.test(token))
    ? { kind: 'known', value } : { kind: 'invalid' };
}
export function numericText(input: unknown): string {
  const parsed = numericValue(input);
  if (parsed.kind === 'invalid') throw new Error('Invalid numeric value.');
  if (parsed.kind === 'unknown') return '';
  const text = String(input).trim();
  if (typeof input !== 'number' || !/[eE]/.test(text)) return text;
  const [coefficient, exponent] = text.toLowerCase().split('e');
  const [integer, fraction = ''] = coefficient.split('.');
  const digits = integer + fraction;
  const point = integer.length + Number(exponent);
  if (point <= 0) return '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return digits.slice(0, point) + '.' + digits.slice(point);
}
export function validateWorkoutRow(input: unknown, complete = false): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Set must be an object.';
  const row = input as Record<string, unknown>;
  if (typeof row.exercise !== 'string' || !row.exercise.trim()) return 'Exercise is required.';
  for (const flag of ['isCardio', 'isRest']) if (row[flag] !== undefined && typeof row[flag] !== 'boolean') return `${flag} must be true or false.`;
  if (row.set !== undefined && numericValue(row.set, true).kind !== 'known') return 'Set number must be a whole non-negative safe integer.';
  for (const [field, allowed] of [
    ['performance', ['planned', 'performed']],
    ['setKind', ['work', 'warmup', 'backoff', 'drop', 'superset', 'cardio']],
    ['status', ['syncing', 'committed']],
    ['distanceUnit', ['miles', 'km', 'meters']],
  ] as const) if (row[field] !== undefined && (typeof row[field] !== 'string' || !(allowed as readonly string[]).includes(row[field] as string))) return `Unsupported ${field}.`;
  for (const field of ['id', 'notes', 'pendingInput']) if (row[field] !== undefined && typeof row[field] !== 'string') return `${field} must be text.`;
  if (row.id !== undefined && !(row.id as string).trim()) return 'Id must not be empty.';
  if (row.timestamp !== undefined && (typeof row.timestamp !== 'number' || numericValue(row.timestamp).kind !== 'known')) return 'Timestamp must be finite and non-negative.';
  if (row.plannedTarget !== undefined) {
    const target = row.plannedTarget;
    if (!target || typeof target !== 'object' || Array.isArray(target)) return 'Planned target must be an object.';
    const t = target as Record<string, unknown>;
    if (typeof t.reps !== 'string' || numericValue(t.reps, true).kind === 'invalid' ||
        t.weightLbs !== undefined && (typeof t.weightLbs !== 'string' || numericValue(t.weightLbs).kind === 'invalid')) return 'Invalid planned target quantities.';
  }
  for (const field of ['durationMins', 'distance', 'heartRate', 'calories', 'level']) {
    if (row[field] !== undefined && (typeof row[field] !== 'number' || numericValue(row[field]).kind !== 'known')) return `${field} must be a finite non-negative number.`;
  }
  if (row.isCardio) {
    for (const field of ['weightLbs', 'reps']) if (row[field] !== undefined && row[field] !== null &&
      typeof row[field] !== 'string' && (typeof row[field] !== 'number' || numericValue(row[field]).kind !== 'known')) return `${field} must be a scalar display value.`;
  } else {
    for (const [field, whole] of [['weightLbs', false], ['reps', true]] as const) {
      const n = numericValue(row[field], whole);
      if (n.kind === 'invalid' || complete && n.kind === 'unknown') return field === 'reps'
        ? 'Reps must be a whole non-negative safe integer.' : 'Weight must be a finite non-negative number in pounds (no units).';
    }
  }
  return null;
}
/** Explicit zero is retained, but zero reps/unknown/planned/warmup/cardio are not strength evidence. */
export function isStrengthEvidence(input: unknown): boolean {
  if (validateWorkoutRow(input, true)) return false;
  const row = input as Record<string, unknown>;
  const reps = numericValue(row.reps, true);
  const set = numericValue(row.set, true);
  return !row.isRest && !row.isCardio && row.status !== 'syncing' && row.performance !== 'planned' &&
    row.setKind !== 'warmup' && row.setKind !== 'cardio' && !(set.kind === 'known' && set.value === 0) &&
    reps.kind === 'known' && reps.value > 0;
}
