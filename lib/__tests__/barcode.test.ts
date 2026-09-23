import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gtinCheckDigit,
  hasValidCheckDigit,
  expandUpcE,
  normalizeBarcode,
  isLookupSafeBarcode,
  formatBrandedFoodName,
} from '../barcode.ts';

// ---------- check digit ----------

test('gtinCheckDigit matches known-good GTINs', () => {
  // Real products; the final digit of each is the published check digit.
  assert.equal(gtinCheckDigit('301762042200'), 3);  // Nutella 3017620422003
  assert.equal(gtinCheckDigit('544900000099'), 6);  // Coca-Cola 5449000000996
  assert.equal(gtinCheckDigit('04900002891'), 1);   // Diet Coke UPC-A 049000028911
  assert.equal(gtinCheckDigit('03800013841'), 6);   // Pringles UPC-A 038000138416
});

test('gtinCheckDigit rejects non-numeric and empty input', () => {
  assert.equal(gtinCheckDigit('12a45'), null);
  assert.equal(gtinCheckDigit(''), null);
  assert.equal(gtinCheckDigit(' 123'), null);
});

test('hasValidCheckDigit accepts valid and rejects corrupted codes', () => {
  assert.equal(hasValidCheckDigit('3017620422003'), true);
  assert.equal(hasValidCheckDigit('049000028911'), true);
  // Single-digit corruption must be caught.
  assert.equal(hasValidCheckDigit('3017620422004'), false);
  assert.equal(hasValidCheckDigit('049000028912'), false);
  assert.equal(hasValidCheckDigit('abc'), false);
  assert.equal(hasValidCheckDigit('123'), false);
});

// ---------- UPC-E expansion ----------

test('expandUpcE applies the correct rule per trailing digit', () => {
  // Expansions are independently verified: the check digit recomputed from the
  // expanded UPC-A must equal the check digit carried in the source UPC-E.
  const cases: [string, string][] = [
    ['05310003', '053000001003'], // d6 = 0 -> d1 d2 d6, four zeros, d3 d4 d5
    ['04252614', '042100005264'], // d6 = 1 -> same rule as 0 and 2
    ['01245733', '012400000573'], // d6 = 3 -> d1 d2 d3, five zeros, d4 d5
    ['01234543', '012340000053'], // d6 = 4 -> d1..d4, five zeros, d5
    ['00123457', '001234000057'], // d6 = 5 -> d1..d5, four zeros, d6
    ['01234565', '012345000065'], // d6 = 6 -> same rule as 5 and 7-9
  ];
  for (const [upce, expected] of cases) {
    const result = expandUpcE(upce);
    assert.equal(result, expected, `UPC-E ${upce}`);
    assert.equal(hasValidCheckDigit(result!), true, `expansion of ${upce} must be a valid GTIN`);
    // Self-verification: the source UPC-E's own check digit must survive.
    assert.equal(result![11], upce[7], `check digit of ${upce} must be preserved`);
  }
});

test('expandUpcE rejects a UPC-E whose own check digit contradicts the expansion', () => {
  // Same payload as 04252614 but with a deliberately wrong check digit.
  assert.equal(expandUpcE('04252610'), null);
});

test('expandUpcE only accepts number system 0 and 1', () => {
  assert.equal(expandUpcE('54252614'), null);
  assert.equal(expandUpcE('94252619'), null);
});

test('expandUpcE handles 6- and 7-digit forms by computing the check digit', () => {
  const six = expandUpcE('425261');
  assert.ok(six && hasValidCheckDigit(six));
  const seven = expandUpcE('0425261');
  assert.equal(seven, six);
});

test('expandUpcE rejects wrong lengths', () => {
  assert.equal(expandUpcE('12345'), null);
  assert.equal(expandUpcE('123456789'), null);
  assert.equal(expandUpcE(''), null);
});

// ---------- normalization ----------

test('normalizeBarcode pads UPC-A to GTIN-13', () => {
  assert.equal(normalizeBarcode('049000028911', 'upc_a'), '0049000028911');
  assert.equal(normalizeBarcode('038000138416', 'upc_a'), '0038000138416');
});

test('normalizeBarcode passes EAN-13 through unchanged', () => {
  assert.equal(normalizeBarcode('3017620422003', 'ean13'), '3017620422003');
  assert.equal(normalizeBarcode('5449000000996', 'ean13'), '5449000000996');
});

test('normalizeBarcode zero-extends EAN-8', () => {
  // 96385074 is a canonical valid EAN-8.
  assert.equal(hasValidCheckDigit('96385074'), true);
  assert.equal(normalizeBarcode('96385074', 'ean8'), '0000096385074');
});

test('normalizeBarcode expands an explicitly-typed UPC-E', () => {
  assert.equal(normalizeBarcode('04252614', 'upc_e'), '0042100005264');
});

test('normalizeBarcode strips separators and whitespace', () => {
  assert.equal(normalizeBarcode(' 3017620422003 ', 'ean13'), '3017620422003');
  assert.equal(normalizeBarcode('3-017620-422003', 'ean13'), '3017620422003');
});

test('normalizeBarcode rejects codes that fail their check digit', () => {
  assert.equal(normalizeBarcode('3017620422004', 'ean13'), null);
  assert.equal(normalizeBarcode('049000028912', 'upc_a'), null);
});

test('normalizeBarcode rejects impossible lengths', () => {
  assert.equal(normalizeBarcode('12345', 'ean13'), null);          // too short
  assert.equal(normalizeBarcode('123456789', 'ean13'), null);      // 9 digits
  assert.equal(normalizeBarcode('1234567890', 'ean13'), null);     // 10 digits
  assert.equal(normalizeBarcode('12345678901', 'ean13'), null);    // 11 digits
  assert.equal(normalizeBarcode('123456789012345', 'ean13'), null); // 15 digits
  assert.equal(normalizeBarcode('', 'ean13'), null);
});

test('normalizeBarcode unwraps a leading-zero ITF-14 to its GTIN-13', () => {
  // ITF-14 of Nutella: indicator 0 + the GTIN-13's 12-digit body + check digit.
  // Prepending a zero leaves every other digit's mod-10 weight unchanged, so
  // the check digit is necessarily identical to the GTIN-13's.
  const itf14 = '03017620422003';
  assert.equal(hasValidCheckDigit(itf14), true);
  assert.equal(normalizeBarcode(itf14, 'itf14'), '3017620422003');
});

test('normalizeBarcode rejects a case-level ITF-14 (non-zero indicator)', () => {
  // Indicator 1 denotes a shipping carton, never a consumer unit.
  const carton = `1301762042200${gtinCheckDigit('1301762042200')}`;
  assert.equal(hasValidCheckDigit(carton), true);
  assert.equal(normalizeBarcode(carton, 'itf14'), null);
});

test('normalizeBarcode handles an 8-digit code with no type hint', () => {
  // Valid EAN-8 wins when its own check digit validates.
  assert.equal(hasValidCheckDigit('96385074'), true);
  assert.equal(normalizeBarcode('96385074'), '0000096385074');
  // 04252614 is NOT a valid EAN-8, so it correctly falls through to UPC-E.
  assert.equal(hasValidCheckDigit('04252614'), false);
  assert.equal(normalizeBarcode('04252614'), '0042100005264');
});

test('normalizeBarcode never returns a value that is not 13 digits', () => {
  const inputs = ['049000028911', '3017620422003', '96385074', '04252614', '03017620422000'];
  for (const input of inputs) {
    const result = normalizeBarcode(input);
    if (result !== null) {
      assert.match(result, /^\d{13}$/, `${input} -> ${result}`);
    }
  }
});

// ---------- server-side guard ----------

test('isLookupSafeBarcode blocks anything that could alter a URL', () => {
  assert.equal(isLookupSafeBarcode('3017620422003'), true);
  assert.equal(isLookupSafeBarcode('00000000'), true);
  assert.equal(isLookupSafeBarcode('123'), false);
  assert.equal(isLookupSafeBarcode('301762042200X'), false);
  assert.equal(isLookupSafeBarcode('../../admin'), false);
  assert.equal(isLookupSafeBarcode('3017620422003?fields=all'), false);
  assert.equal(isLookupSafeBarcode(''), false);
});

// ---------- branded name formatting ----------

test('formatBrandedFoodName drops a brand the name already implies', () => {
  // Real upstream values — `brands` is a legal-entity list.
  assert.equal(formatBrandedFoodName('Coca-Cola', 'COCA-COLA SERVICES SA/NV'), 'Coca-Cola');
  assert.equal(formatBrandedFoodName('Diet Coke Soft Drink', 'Coke'), 'Diet Coke Soft Drink');
  assert.equal(formatBrandedFoodName('Nutella', 'Nutella'), 'Nutella');
  assert.equal(formatBrandedFoodName('Monster Energy', 'Monster Energy'), 'Monster Energy');
});

test('formatBrandedFoodName prefixes a genuinely distinct brand', () => {
  assert.equal(
    formatBrandedFoodName('Original Potato Crisps', 'Pringles'),
    'Pringles Original Potato Crisps',
  );
  assert.equal(formatBrandedFoodName('Napoletana', 'Barilla'), 'Barilla Napoletana');
});

test('formatBrandedFoodName is case-insensitive when comparing', () => {
  assert.equal(formatBrandedFoodName('PRINGLES Original', 'Pringles'), 'PRINGLES Original');
});

test('formatBrandedFoodName handles missing pieces and whitespace', () => {
  assert.equal(formatBrandedFoodName('Nutella', null), 'Nutella');
  assert.equal(formatBrandedFoodName('  Nutella  ', null), 'Nutella');
  assert.equal(formatBrandedFoodName('Original   Crisps', 'Pringles'), 'Pringles Original Crisps');
  assert.equal(formatBrandedFoodName('', 'Pringles'), 'Pringles');
  assert.equal(formatBrandedFoodName('', null), '');
});

test('formatBrandedFoodName stays within the food_name column budget', () => {
  const long = formatBrandedFoodName('x'.repeat(300), 'Brand');
  assert.ok(long.length <= 200);
});

// ---------- platform symbology strings (regression guards) ----------

test('normalizeBarcode accepts the symbology strings each platform actually emits', () => {
  // iOS AVFoundation / Vision report e.g. "VNBarcodeSymbologyUPCE" and
  // "org.gs1.UPC-E"; Android MLKit reports "upc_e". All must route to UPC-E
  // handling. A refactor to `type === 'upc_e'` would silently break iOS.
  for (const symbology of ['upc_e', 'UPC_E', 'VNBarcodeSymbologyUPCE', 'org.gs1.UPC-E', 'upce']) {
    assert.equal(normalizeBarcode('04252614', symbology), '0042100005264', symbology);
  }
  for (const symbology of ['ean8', 'EAN_8', 'VNBarcodeSymbologyEAN8']) {
    assert.equal(normalizeBarcode('96385074', symbology), '0000096385074', symbology);
  }
});

test('an already-expanded UPC-E payload is accepted, not rejected', () => {
  // expo-camera's iOS bridge strips a leading zero only for `.ean13`, never for
  // `.upce`, so a UPC-E scan can arrive already expanded. Rejecting it would
  // make every UPC-E scan fail as "not a recognizable product code".
  assert.equal(normalizeBarcode('042100005264', 'upc_e'), '0042100005264');
  assert.equal(normalizeBarcode('0042100005264', 'upc_e'), '0042100005264');
  // A corrupt expanded payload is still rejected.
  assert.equal(normalizeBarcode('042100005265', 'upc_e'), null);
});

test('the compressed and expanded forms of one UPC-E agree', () => {
  assert.equal(
    normalizeBarcode('04252614', 'upc_e'),
    normalizeBarcode('042100005264', 'upc_e'),
  );
});
