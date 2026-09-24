// WCAG 2.x contrast ratio between two sRGB colors.
// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [linear(r), linear(g), linear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Contrast ratio between two opaque hex colors (`#rgb` or `#rrggbb`), per
 * the WCAG formula: (L1 + 0.05) / (L2 + 0.05), where L1 is the lighter
 * relative luminance. Range: 1 (no contrast) to 21 (black on white).
 *
 * Does not composite alpha — pass the actual rendered opaque color for a
 * foreground/background pair that includes opacity.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
