import { test } from 'node:test';
import assert from 'node:assert/strict';

// The mapper lives with the Edge Function (Deno) but has zero imports, so the
// Node test runner can cover it directly. `tsconfig.json` excludes
// supabase/functions/**, making this the only check this logic gets.
import { mapOpenFoodFactsProduct } from '../../supabase/functions/_shared/openFoodFacts.ts';

// ---------------------------------------------------------------------------
// Fixtures captured from the live Open Food Facts v2 API on 2026-09-06.
// Trimmed to the fields the mapper reads; values are verbatim.
// ---------------------------------------------------------------------------

/** Nutella — per 100 g, NO serving quantity, no fiber, sodium in grams. */
const NUTELLA = {
  product_name: 'Nutella',
  brands: 'Nutella, Ferrero, Yum yum',
  quantity: '',
  serving_quantity_unit: 'g',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 539,
    'energy-kj_100g': 2252,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    proteins_100g: 6.3,
    salt_100g: 0.107,
    'saturated-fat_100g': 10.6,
    sodium_100g: 0.0428,
    sugars_100g: 56.3,
  },
};

/** Coca-Cola — per 100 g basis with a 330 ml serving quantity. */
const COCA_COLA = {
  product_name: 'Coca-Cola',
  brands: 'COCA-COLA SERVICES SA/NV, Coca-Cola',
  quantity: '330 ml',
  product_quantity: 330,
  serving_quantity: 330,
  serving_quantity_unit: 'ml',
  serving_size: '1 portion (330 ml)',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 42,
    carbohydrates_100g: 10.6,
    fat_100g: 0,
    proteins_100g: 0,
    salt_100g: 0,
    'saturated-fat_100g': 0,
    sodium_100g: 0,
    sugars_100g: 10.6,
  },
};

/** Diet Coke — legitimately ZERO calories, per 100 ml. */
const DIET_COKE = {
  product_name: 'Diet Coke Soft Drink',
  brands: 'Coca-Cola',
  serving_quantity: 354.9,
  serving_quantity_unit: 'ml',
  serving_size: '1 can (354.9 mL)',
  nutrition_data_per: '100ml',
  nutriments: {
    'energy-kcal_100g': 0,
    carbohydrates_100g: 0,
    fat_100g: 0,
    proteins_100g: 0,
    'saturated-fat_100g': 0,
    sodium_100g: 0.0113000845308538,
    sugars_100g: 0,
  },
};

/** Pringles — 28 g serving, has fiber. */
const PRINGLES = {
  product_name: 'Original Potato Crisps',
  brands: 'Pringles',
  serving_quantity: 28,
  serving_quantity_unit: 'g',
  serving_size: '1 serving (28 g)',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 536,
    carbohydrates_100g: 53.6,
    fat_100g: 32.1,
    proteins_100g: 3.5,
    fiber_100g: 4,
    'saturated-fat_100g': 8.93,
    sodium_100g: 0.536,
    sugars_100g: 3.57,
  },
};

// ---------------------------------------------------------------------------
// The 1000x trap
// ---------------------------------------------------------------------------

test('sodium is converted from grams to milligrams', () => {
  const result = mapOpenFoodFactsProduct('3017620422003', NUTELLA);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  // 0.0428 g per 100 g -> 42.8 mg per 100 g serving.
  assert.equal(result.food.sodium_mg, 42.8);
});

test('sodium falls back to salt / 2.5 when sodium is absent', () => {
  const noSodium = {
    ...NUTELLA,
    nutriments: { ...NUTELLA.nutriments, sodium_100g: undefined },
  };
  const result = mapOpenFoodFactsProduct('3017620422003', noSodium);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  // 0.107 g salt -> 107 mg salt -> 42.8 mg sodium.
  assert.equal(result.food.sodium_mg, 42.8);
});

test('sodium scales with serving size', () => {
  const result = mapOpenFoodFactsProduct('0038000138416', PRINGLES);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  // 0.536 g/100 g -> 536 mg/100 g -> 28 g serving = 150.08 mg.
  assert.equal(result.food.sodium_mg, 150.08);
  assert.ok(result.food.sodium_mg < 20_000, 'must stay inside the DB CHECK bound');
});

// ---------------------------------------------------------------------------
// Zero calories is real data, not missing data
// ---------------------------------------------------------------------------

test('a genuinely zero-calorie product maps as found, not incomplete', () => {
  const result = mapOpenFoodFactsProduct('0049000028911', DIET_COKE);
  assert.equal(result.status, 'found', 'Diet Coke must not be rejected for having 0 kcal');
  if (result.status !== 'found') return;
  assert.equal(result.food.calories, 0);
  assert.equal(result.food.name, 'Diet Coke Soft Drink');
});

// ---------------------------------------------------------------------------
// serving_size_g must never be 0 (would break toServings in log.tsx)
// ---------------------------------------------------------------------------

test('missing serving data falls back to a 100 g basis, never 0', () => {
  const result = mapOpenFoodFactsProduct('3017620422003', NUTELLA);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 100);
  assert.equal(result.food.serving_label, '100 g');
  assert.equal(result.food.basis, '100g');
  // Unscaled: per-100 g values pass straight through.
  assert.equal(result.food.calories, 539);
  assert.equal(result.food.protein_g, 6.3);
});

test('serving_size_g is never zero or negative for any fixture', () => {
  const fixtures = [NUTELLA, COCA_COLA, DIET_COKE, PRINGLES];
  for (const fixture of fixtures) {
    const result = mapOpenFoodFactsProduct('0000000000000', fixture);
    assert.equal(result.status, 'found');
    if (result.status !== 'found') continue;
    assert.ok(result.food.serving_size_g > 0, `${fixture.product_name} serving_size_g must be > 0`);
  }
});

test('an unusable serving unit falls back to the 100 g basis', () => {
  const weird = { ...PRINGLES, serving_quantity: 1, serving_quantity_unit: 'portion' };
  const result = mapOpenFoodFactsProduct('0038000138416', weird);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 100);
});

test('an absurd serving quantity falls back to the 100 g basis', () => {
  for (const quantity of [0, -5, 99_999]) {
    const weird = { ...PRINGLES, serving_quantity: quantity };
    const result = mapOpenFoodFactsProduct('0038000138416', weird);
    assert.equal(result.status, 'found');
    if (result.status !== 'found') continue;
    assert.equal(result.food.serving_size_g, 100, `serving_quantity ${quantity}`);
  }
});

// ---------------------------------------------------------------------------
// Per-serving scaling
// ---------------------------------------------------------------------------

test('macros scale onto the declared serving', () => {
  const result = mapOpenFoodFactsProduct('0038000138416', PRINGLES);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 28);
  assert.equal(result.food.serving_label, '1 serving (28 g)');
  assert.equal(result.food.basis, 'serving');
  assert.equal(result.food.calories, 150.08);   // 536 * 0.28
  assert.equal(result.food.protein_g, 0.98);    // 3.5 * 0.28
  assert.equal(result.food.carbs_g, 15.01);     // 53.6 * 0.28
  assert.equal(result.food.fat_g, 8.99);        // 32.1 * 0.28
  assert.equal(result.food.fiber_g, 1.12);      // 4 * 0.28
});

test('a 330 ml serving scales the whole container', () => {
  const result = mapOpenFoodFactsProduct('5449000000996', COCA_COLA);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 330);
  assert.equal(result.food.calories, 138.6);   // 42 * 3.3
  assert.equal(result.food.carbs_g, 34.98);    // 10.6 * 3.3
});

// ---------------------------------------------------------------------------
// Absent fields
// ---------------------------------------------------------------------------

test('absent fiber defaults to 0 rather than NaN', () => {
  const result = mapOpenFoodFactsProduct('3017620422003', NUTELLA);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.fiber_g, 0);
  assert.ok(Number.isFinite(result.food.fiber_g));
});

test('every numeric field is finite and non-negative for every fixture', () => {
  const numericFields = [
    'serving_size_g', 'calories', 'protein_g', 'carbs_g', 'fat_g',
    'fiber_g', 'saturated_fat_g', 'sugar_g', 'sodium_mg',
  ] as const;
  for (const fixture of [NUTELLA, COCA_COLA, DIET_COKE, PRINGLES]) {
    const result = mapOpenFoodFactsProduct('0000000000000', fixture);
    assert.equal(result.status, 'found');
    if (result.status !== 'found') continue;
    for (const field of numericFields) {
      const value = result.food[field];
      assert.ok(Number.isFinite(value), `${fixture.product_name}.${field} must be finite`);
      assert.ok(value >= 0, `${fixture.product_name}.${field} must be >= 0`);
    }
  }
});

// ---------------------------------------------------------------------------
// Energy fallbacks
// ---------------------------------------------------------------------------

test('kJ is converted when kcal is absent', () => {
  const kjOnly = {
    ...NUTELLA,
    nutriments: { 'energy-kj_100g': 2252, proteins_100g: 6.3 },
  };
  const result = mapOpenFoodFactsProduct('3017620422003', kjOnly);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.calories, 538.24); // 2252 / 4.184
});

test('numeric strings are accepted', () => {
  const stringy = {
    ...NUTELLA,
    nutriments: { ...NUTELLA.nutriments, 'energy-kcal_100g': '539', proteins_100g: '6.3' },
  };
  const result = mapOpenFoodFactsProduct('3017620422003', stringy);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.calories, 539);
  assert.equal(result.food.protein_g, 6.3);
});

// ---------------------------------------------------------------------------
// Incomplete products route to manual entry
// ---------------------------------------------------------------------------

test('a product with no energy data is incomplete but still surfaces its name', () => {
  const noEnergy = { product_name: 'Mystery Bar', brands: 'Acme, Other', nutriments: {} };
  const result = mapOpenFoodFactsProduct('0000000000000', noEnergy);
  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.equal(result.name, 'Mystery Bar');
  assert.equal(result.brand, 'Acme');
});

test('a product with no name is incomplete even with full nutrition', () => {
  const noName = { brands: 'Acme', nutriments: NUTELLA.nutriments };
  const result = mapOpenFoodFactsProduct('0000000000000', noName);
  assert.equal(result.status, 'incomplete');
});

test('a blank product name is treated as missing', () => {
  const blank = { product_name: '   ', brands: 'Acme', nutriments: NUTELLA.nutriments };
  const result = mapOpenFoodFactsProduct('0000000000000', blank);
  assert.equal(result.status, 'incomplete');
});

test('product_name_en and generic_name are used as fallbacks', () => {
  const enOnly = { product_name_en: 'English Name', nutriments: NUTELLA.nutriments };
  const result = mapOpenFoodFactsProduct('0000000000000', enOnly);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.name, 'English Name');
});

test('malformed input never throws', () => {
  for (const input of [null, undefined, 42, 'string', [], { nutriments: 'not-an-object' }]) {
    const result = mapOpenFoodFactsProduct('0000000000000', input);
    assert.ok(result.status === 'incomplete' || result.status === 'found');
  }
});

// ---------------------------------------------------------------------------
// Brand handling
// ---------------------------------------------------------------------------

test('only the primary brand is kept from a comma-separated list', () => {
  const result = mapOpenFoodFactsProduct('3017620422003', NUTELLA);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.brand, 'Nutella');
});

test('a missing brand is null, not an empty string', () => {
  const noBrand = { ...NUTELLA, brands: undefined };
  const result = mapOpenFoodFactsProduct('3017620422003', noBrand);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.brand, null);
});

// ---------------------------------------------------------------------------
// DB CHECK bounds (an out-of-range value would 500 on insert)
// ---------------------------------------------------------------------------

test('absurd source values are clamped inside the foods CHECK constraints', () => {
  const absurd = {
    product_name: 'Corrupted Entry',
    serving_quantity: 1000,
    serving_quantity_unit: 'g',
    nutriments: {
      'energy-kcal_100g': 90_000,
      proteins_100g: 9_000,
      carbohydrates_100g: 9_000,
      fat_100g: 9_000,
      fiber_100g: 9_000,
      'saturated-fat_100g': 9_000,
      sugars_100g: 9_000,
      sodium_100g: 9_000,
    },
  };
  const result = mapOpenFoodFactsProduct('0000000000000', absurd);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.ok(result.food.calories <= 10_000);
  assert.ok(result.food.protein_g <= 500);
  assert.ok(result.food.carbs_g <= 1_000);
  assert.ok(result.food.fat_g <= 500);
  assert.ok(result.food.fiber_g <= 200);
  assert.ok(result.food.saturated_fat_g <= 300);
  assert.ok(result.food.sugar_g <= 500);
  assert.ok(result.food.sodium_mg <= 20_000);
});

test('negative source values are floored at 0', () => {
  const negative = {
    product_name: 'Bad Data',
    nutriments: { 'energy-kcal_100g': 100, proteins_100g: -50 },
  };
  const result = mapOpenFoodFactsProduct('0000000000000', negative);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.protein_g, 0);
});

// ---------------------------------------------------------------------------
// Implausible serving sizes (regression: silent calorie under-reporting)
//
// Real payload from barcode 0044000032029, fetched 2026-09-06. Upstream
// declares a 3 g serving for a 471 kcal/100 g cookie, which mapped to a
// 14-calorie "serving" of Oreos.
// ---------------------------------------------------------------------------

const OREO_BAD_SERVING = {
  product_name: 'oreo cookies shelf',
  brands: 'Oreo',
  serving_size: '3g',
  serving_quantity: 3,
  serving_quantity_unit: 'g',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 471,
    carbohydrates_100g: 73.5,
    fat_100g: 20.6,
    proteins_100g: 2.94,
    fiber_100g: 2.9,
    'saturated-fat_100g': 5.88,
    sugars_100g: 41.2,
    sodium_100g: 0.383,
  },
};

test('an implausibly small serving size falls back to the declared 100 g basis', () => {
  const result = mapOpenFoodFactsProduct('0044000032029', OREO_BAD_SERVING);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 100, 'must not trust a 3 g cookie serving');
  assert.equal(result.food.calories, 471, 'must not report 14 calories for Oreos');
  assert.equal(result.food.basis, '100g');
});

test('serving sizes at or above the plausibility floor are still trusted', () => {
  const smallButReal = { ...OREO_BAD_SERVING, serving_quantity: 34, serving_size: '3 cookies (34 g)' };
  const result = mapOpenFoodFactsProduct('0044000032029', smallButReal);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.serving_size_g, 34);
  assert.equal(result.food.calories, 160.14); // 471 * 0.34
  assert.equal(result.food.basis, 'serving');
});

// ---------------------------------------------------------------------------
// Energy unit handling (regression: 4.184x over-report)
// ---------------------------------------------------------------------------

test('energy_100g is treated as kJ even when energy_unit claims kcal', () => {
  // energy_unit describes what the contributor typed for energy_value, NOT the
  // unit of energy_100g. Verified: Pringles has energy_unit 'kJ' with
  // energy_100g === energy-kj_100g === 2244.5 against 536 kcal.
  const misleading = {
    product_name: 'Contributor Entered Kcal',
    nutriments: { energy_100g: 2244.5, energy_unit: 'kcal' },
  };
  const result = mapOpenFoodFactsProduct('0000000000000', misleading);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.calories, 536.45); // 2244.5 / 4.184, NOT 2244.5
});

test('un-suffixed nutriment keys are ignored (they are in the declared basis)', () => {
  // A per-serving-basis product whose only protein figure is the bare key must
  // NOT have that value scaled a second time onto the serving.
  const bareOnly = {
    product_name: 'Bare Keys Only',
    serving_quantity: 50,
    serving_quantity_unit: 'g',
    nutriments: { 'energy-kcal_100g': 200, proteins: 40, sodium: 1, sugars: 10 },
  };
  const result = mapOpenFoodFactsProduct('0000000000000', bareOnly);
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.equal(result.food.protein_g, 0, 'bare `proteins` must not be read');
  assert.equal(result.food.sodium_mg, 0, 'bare `sodium` must not be read');
  assert.equal(result.food.sugar_g, 0, 'bare `sugars` must not be read');
  assert.equal(result.food.calories, 100); // 200 * 0.5, from the _100g key
});
