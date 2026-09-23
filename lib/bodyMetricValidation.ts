// Bounds match 0036_progress_tracking.sql and the authoritative Edge validator.
export const BODY_METRIC_FIELDS = [
  { key: 'weight_lbs', label: 'Weight', unit: 'lb', min: 50, max: 800 },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', min: 2, max: 60 },
  { key: 'waist_in', label: 'Waist', unit: 'in', min: 15, max: 80 },
  { key: 'chest_in', label: 'Chest', unit: 'in', min: 20, max: 80 },
  { key: 'hips_in', label: 'Hips', unit: 'in', min: 20, max: 80 },
  { key: 'arm_in', label: 'Arm', unit: 'in', min: 5, max: 30 },
  { key: 'thigh_in', label: 'Thigh', unit: 'in', min: 10, max: 50 },
  { key: 'neck_in', label: 'Neck', unit: 'in', min: 8, max: 25 },
] as const;
export type BodyMetricKey = typeof BODY_METRIC_FIELDS[number]['key'];
export type BodyMetricErrors = Partial<Record<BodyMetricKey | 'measured_date' | 'form', string>>;
type Payload = { measured_date: string; notes?: string } & Partial<Record<BodyMetricKey, number>>;

/** Strict full-string whole-number parser (no trailing garbage, no fractions). Returns null if invalid. */
export function parseStrictInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function isBodyMetricDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Blank/null metrics mean unchanged; any invalid supplied field blocks the whole form. */
export function validateBodyMetricInput(input: Record<string, unknown>):
  | { valid: true; payload: Payload; errors: BodyMetricErrors }
  | { valid: false; payload?: never; errors: BodyMetricErrors } {
  const errors: BodyMetricErrors = {};
  if (!isBodyMetricDate(input.measured_date)) errors.measured_date = 'Enter a real date (YYYY-MM-DD).';
  const payload: Payload = { measured_date: String(input.measured_date ?? '') };
  let count = 0;
  for (const field of BODY_METRIC_FIELDS) {
    const raw = input[field.key];
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) continue;
    const numeric = typeof raw === 'number' || (typeof raw === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()));
    const value = numeric ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      errors[field.key] = `${field.label}: enter ${field.min}–${field.max} ${field.unit}.`;
    } else {
      payload[field.key] = Math.round(value * 100) / 100;
      count++;
    }
  }
  if (!count) errors.form = 'Enter at least one valid measurement.';
  if (Object.keys(errors).length) return { valid: false, errors };
  // Explicit empty notes can clear notes alongside a valid metric; omitted/null leaves unchanged.
  if (typeof input.notes === 'string') payload.notes = input.notes.slice(0, 1000);
  return { valid: true, payload, errors };
}
