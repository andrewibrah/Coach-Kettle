import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatProgramDayLabel } from '../programFormat.ts';

// ---------- Real seeded template rows (#12) ----------

// 6-day template (0035_programming_engine.sql:240-278)
test('6-day template: body_part is a prefix of title on every day -> title alone', () => {
  const cases: [string, string, string][] = [
    ['Push', 'Push (Heavy)', 'Push (Heavy)'],
    ['Pull', 'Pull (Heavy)', 'Pull (Heavy)'],
    ['Shoulders', 'Shoulders + Arms', 'Shoulders + Arms'],
    ['Legs', 'Legs (Heavy)', 'Legs (Heavy)'],
    ['Push', 'Push (Volume)', 'Push (Volume)'],
    ['Pull', 'Pull (Volume) + Legs Light', 'Pull (Volume) + Legs Light'],
  ];
  for (const [body_part, title, expected] of cases) {
    assert.equal(formatProgramDayLabel({ body_part, title }), expected, `${body_part} + ${title}`);
  }
});

// 3-day template (0035:168-191) — body_part and title identical
test('3-day template: identical body_part and title collapse to one copy', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'Push', title: 'Push' }), 'Push');
  assert.equal(formatProgramDayLabel({ body_part: 'Pull', title: 'Pull' }), 'Pull');
  assert.equal(formatProgramDayLabel({ body_part: 'Legs', title: 'Legs' }), 'Legs');
});

// 5-day template (0035:201-231) — genuinely complementary values, both wanted
test('5-day template: complementary body_part and title are both shown', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'Push', title: 'Chest + Triceps' }), 'Push — Chest + Triceps');
  assert.equal(formatProgramDayLabel({ body_part: 'Pull', title: 'Back + Biceps' }), 'Pull — Back + Biceps');
  assert.equal(formatProgramDayLabel({ body_part: 'Shoulders', title: 'Shoulders' }), 'Shoulders');
  assert.equal(formatProgramDayLabel({ body_part: 'Legs', title: 'Legs' }), 'Legs');
  assert.equal(formatProgramDayLabel({ body_part: 'Abs', title: 'Conditioning + Core' }), 'Abs — Conditioning + Core');
});

// Full Body templates seeded for #7
test('Full Body template (#7): title alone, not "Full Body — Full Body A"', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'Full Body', title: 'Full Body A' }), 'Full Body A');
  assert.equal(formatProgramDayLabel({ body_part: 'Full Body', title: 'Full Body B' }), 'Full Body B');
});

// Upper/Lower template seeded for #7
test('Upper/Lower template (#7): title alone', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'Upper', title: 'Upper A' }), 'Upper A');
  assert.equal(formatProgramDayLabel({ body_part: 'Lower', title: 'Lower B' }), 'Lower B');
});

// ---------- Null / empty inputs ----------

test('null/empty title falls back to body_part', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'Push', title: null }), 'Push');
  assert.equal(formatProgramDayLabel({ body_part: 'Push', title: '' }), 'Push');
  assert.equal(formatProgramDayLabel({ body_part: 'Push', title: '   ' }), 'Push');
});

test('empty body_part falls back to title', () => {
  assert.equal(formatProgramDayLabel({ body_part: '', title: 'Push (Heavy)' }), 'Push (Heavy)');
  assert.equal(formatProgramDayLabel({ body_part: null as unknown as string, title: 'Push (Heavy)' }), 'Push (Heavy)');
});

test('both empty falls back to "Workout"', () => {
  assert.equal(formatProgramDayLabel({ body_part: '', title: '' }), 'Workout');
  assert.equal(formatProgramDayLabel({ body_part: null as unknown as string, title: null }), 'Workout');
});

// ---------- Case, whitespace, underscore variants (h_debug framing) ----------

test('case differences between body_part and title are still recognized as duplicate', () => {
  assert.equal(formatProgramDayLabel({ body_part: 'push', title: 'Push (Heavy)' }), 'Push (Heavy)');
  assert.equal(formatProgramDayLabel({ body_part: 'PUSH', title: 'push (heavy)' }), 'push (heavy)');
});

test('surrounding whitespace on body_part/title is trimmed before comparison', () => {
  assert.equal(formatProgramDayLabel({ body_part: '  Pull  ', title: '  Pull (Heavy)  ' }), 'Pull (Heavy)');
  assert.equal(formatProgramDayLabel({ body_part: ' Push ', title: ' Chest + Triceps ' }), 'Push — Chest + Triceps');
});

test('underscore-formatted body_part values are treated literally (formatting is a separate concern)', () => {
  // formatProgramDayLabel only de-duplicates; it does not reformat underscores
  // (that is exerciseFormat's job, see #10/#11). "full_body" does not equal
  // or prefix "Full Body A", so both are shown as given.
  assert.equal(formatProgramDayLabel({ body_part: 'full_body', title: 'Full Body A' }), 'full_body — Full Body A');
});

test('title that mentions the body part mid-string (not as a prefix) keeps both', () => {
  // "includes" would have incorrectly collapsed this; startsWith does not.
  assert.equal(formatProgramDayLabel({ body_part: 'Pull', title: 'Accessory Pull Work' }), 'Pull — Accessory Pull Work');
});
