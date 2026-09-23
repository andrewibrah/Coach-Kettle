/**
 * Formats raw exercise-library vocabulary (category, body_part, equipment,
 * muscle names) for display. The imported dataset (#7's 1,324-row seed)
 * stores these as lowercase, underscore-joined slugs (e.g. "body_weight",
 * "smith_machine") — rendered raw, they read like database output (#10/#11).
 */

// Token casing only — equipment labels must never rewrite an exercise name.
const NAME_TOKENS: Record<string, string> = { ez: 'EZ', bosu: 'BOSU', skierg: 'SkiErg', trx: 'TRX', jm: 'JM', sz: 'SZ', pov: 'POV' };

/** Display only: never use formatted names for lookup, slugs, or storage. */
export function formatExerciseName(raw: string | null | undefined): string {
  const name = raw?.trim().replace(/\s+/g, ' ');
  if (!name) return '—';
  return name.toLowerCase().replace(/[a-z]+(?:['’][a-z]+)*/g, (word) =>
    Object.hasOwn(NAME_TOKENS, word) ? NAME_TOKENS[word] : word[0].toUpperCase() + word.slice(1)
  );
}

/** Terms whose canonical casing is not simple title-case. */
const OVERRIDES: Record<string, string> = {
  ez_barbell: 'EZ Bar',
  body_weight: 'Bodyweight',
  leverage_machine: 'Leverage Machine',
  smith_machine: 'Smith Machine',
  sled_machine: 'Sled Machine',
  skierg_machine: 'SkiErg',
  olympic_barbell: 'Olympic Barbell',
  upper_body_ergometer: 'Upper-Body Ergometer',
  bosu_ball: 'BOSU Ball',
  stability_ball: 'Stability Ball',
  medicine_ball: 'Medicine Ball',
  resistance_band: 'Resistance Band',
  wheel_roller: 'Ab Wheel',
  trap_bar: 'Trap Bar',
  stationary_bike: 'Stationary Bike',
  cardiovascular_system: 'Cardiovascular System',
  hip_flexors: 'Hip Flexors',
  lower_back: 'Lower Back',
  upper_back: 'Upper Back',
  rotator_cuff: 'Rotator Cuff',
  serratus_anterior: 'Serratus Anterior',
};

export function formatTerm(raw: string | null | undefined): string {
  if (!raw) return '—';
  const key = raw.toLowerCase().trim();
  if (!key) return '—';
  if (Object.hasOwn(OVERRIDES, key)) return OVERRIDES[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTermList(raw: string[] | null | undefined): string {
  return raw?.length ? raw.map(formatTerm).join(', ') : '—';
}
