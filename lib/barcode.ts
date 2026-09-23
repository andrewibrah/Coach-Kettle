// Pure GTIN (barcode) normalization. No React Native / Deno imports so this is
// unit-testable with `node --test "lib/__tests__/*.test.ts"`.
//
// Everything normalizes to a 13-digit GTIN-13 string, which is the key space
// Open Food Facts uses and therefore our cache key. GTIN-8 / UPC-A / UPC-E all
// zero-extend or expand into GTIN-13.

/** Barcode symbologies we ask the scanner for. */
export const SCANNABLE_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'] as const;
export type ScannableBarcodeType = (typeof SCANNABLE_BARCODE_TYPES)[number];

/**
 * Standard GTIN mod-10 check digit for a code WITHOUT its check digit.
 * Weights alternate 3/1 from the rightmost body digit leftwards, which makes
 * this correct for GTIN-8, -12, -13 and -14 without special-casing length.
 */
export function gtinCheckDigit(body: string): number | null {
  if (!/^\d+$/.test(body)) return null;
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    // Rightmost body digit has weight 3, then alternating leftwards.
    const weight = (body.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `code` is all digits and its trailing check digit is consistent. */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  const expected = gtinCheckDigit(code.slice(0, -1));
  return expected !== null && expected === Number(code[code.length - 1]);
}

/**
 * Expand a UPC-E code to its 12-digit UPC-A form.
 *
 * Accepts the 8-digit form (number system + 6 payload + check digit), the
 * 7-digit form (number system + 6 payload) and the bare 6-digit payload.
 * When a check digit is present the expansion is verified against it, so a
 * misread — or a wrong expansion rule — is rejected instead of silently
 * querying the wrong product.
 */
export function expandUpcE(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  let numberSystem: string;
  let payload: string;
  let check: string | null;

  if (digits.length === 6) {
    numberSystem = '0';
    payload = digits;
    check = null;
  } else if (digits.length === 7) {
    numberSystem = digits[0];
    payload = digits.slice(1);
    check = null;
  } else if (digits.length === 8) {
    numberSystem = digits[0];
    payload = digits.slice(1, 7);
    check = digits[7];
  } else {
    return null;
  }

  // UPC-E is only defined for number system 0 and 1.
  if (numberSystem !== '0' && numberSystem !== '1') return null;

  const [d1, d2, d3, d4, d5, d6] = payload.split('');
  let body: string; // 11 digits: number system + 10 manufacturer/product digits
  switch (d6) {
    case '0':
    case '1':
    case '2':
      body = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case '3':
      body = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case '4':
      body = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default: // 5-9
      body = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
      break;
  }

  const computed = gtinCheckDigit(body);
  if (computed === null) return null;
  if (check !== null && String(computed) !== check) return null;
  return `${body}${computed}`;
}

/**
 * Normalize any scanned barcode to a 13-digit GTIN-13, or null if it is not a
 * plausible retail product code.
 *
 * `type` is the symbology reported by the scanner. It matters for 8-digit
 * codes, which are ambiguous between EAN-8 and UPC-E; without it we prefer the
 * EAN-8 reading when its check digit validates, then fall back to UPC-E.
 */
export function normalizeBarcode(raw: string, type?: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 14) return null;

  const symbology = (type ?? '').toLowerCase();

  // Explicit UPC-E from the scanner.
  if (symbology.includes('upc_e') || symbology.includes('upce')) {
    // Some platforms hand back an ALREADY-EXPANDED payload under the UPC-E
    // symbology. expo-camera's iOS bridge strips a leading zero only for
    // `.ean13` (BarcodeScannerUtils.swift), never for `.upce`, so the payload
    // length is not guaranteed to be the compressed 6-8 digit form. Treat a
    // 12/13-digit UPC-E payload as already expanded rather than rejecting every
    // such scan as "not a product code".
    if (digits.length >= 12) {
      return hasValidCheckDigit(digits) ? digits.padStart(13, '0') : null;
    }
    const upcA = expandUpcE(digits);
    return upcA ? `0${upcA}` : null;
  }

  if (digits.length === 6 || digits.length === 7) {
    // Only ever a compressed UPC-E in practice.
    const upcA = expandUpcE(digits);
    return upcA ? `0${upcA}` : null;
  }

  if (digits.length === 8) {
    // Ambiguous. EAN-8 is a complete GTIN-8, so prefer it when its check digit
    // validates; otherwise try UPC-E expansion.
    if (symbology.includes('ean8') || symbology.includes('ean_8')) {
      return hasValidCheckDigit(digits) ? digits.padStart(13, '0') : null;
    }
    if (hasValidCheckDigit(digits)) return digits.padStart(13, '0');
    const upcA = expandUpcE(digits);
    return upcA ? `0${upcA}` : null;
  }

  if (digits.length === 12 || digits.length === 13) {
    // UPC-A (12) zero-extends into GTIN-13.
    if (!hasValidCheckDigit(digits)) return null;
    return digits.padStart(13, '0');
  }

  if (digits.length === 14) {
    // ITF-14 is a case/carton code. Only a leading-zero one denotes the same
    // consumer unit as its GTIN-13; anything else is a shipping container that
    // will never be in a consumer food database.
    if (!hasValidCheckDigit(digits)) return null;
    if (digits[0] !== '0') return null;
    const inner = digits.slice(1);
    return hasValidCheckDigit(inner) ? inner : null;
  }

  // Lengths 9, 10 and 11 are not valid retail GTINs.
  return null;
}

/** Shape check applied again server-side before any URL interpolation. */
export function isLookupSafeBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

/**
 * Combine a brand and a product name without the redundancy that product
 * databases are full of. Open Food Facts' `brands` field is a legal-entity
 * list, so naive concatenation yields "COCA-COLA SERVICES SA/NV Coca-Cola" or
 * "Coke Diet Coke Soft Drink".
 *
 * When either string already implies the other, the product name wins — it is
 * the more specific of the two.
 */
export function formatBrandedFoodName(name: string, brand: string | null): string {
  const cleanName = (name ?? '').trim().replace(/\s+/g, ' ');
  const cleanBrand = (brand ?? '').trim().replace(/\s+/g, ' ');
  if (!cleanBrand) return cleanName.slice(0, 200);
  if (!cleanName) return cleanBrand.slice(0, 200);
  const lowerName = cleanName.toLowerCase();
  const lowerBrand = cleanBrand.toLowerCase();
  if (lowerName.includes(lowerBrand) || lowerBrand.includes(lowerName)) {
    return cleanName.slice(0, 200);
  }
  return `${cleanBrand} ${cleanName}`.slice(0, 200);
}
