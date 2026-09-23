/**
 * Dynamic Type breakpoints (pure — no React Native import so it is unit testable).
 *
 * iOS reports Dynamic Type through `fontScale`. For body text the practical
 * range is ~1.0 at the default size up to ~3.1 at Accessibility Extra Extra
 * Extra Large (AX5). We adapt layout at two thresholds rather than capping or
 * disabling font scaling, per Apple's typography guidance: stack constrained
 * rows instead of truncating them.
 */
export const LARGE_TEXT_SCALE = 1.35;
export const HUGE_TEXT_SCALE = 2.0;

/** Cap applied to *spacing* only — never to font size. */
export const MAX_SPACING_SCALE = 2;

export type LargeTextLayout = {
  /** Raw Dynamic Type scale reported by the OS. */
  fontScale: number;
  /** At or above the "accessibility sizes" threshold — stack constrained rows. */
  isLargeText: boolean;
  /** Very large sizes — drop decorative chrome and give values a full line. */
  isHugeText: boolean;
  /**
   * Scale a spacing / min-size value with the text, capped so padding does not
   * run away at AX5. Use for hit targets and min widths, not for fontSize.
   */
  scaleSpace: (value: number) => number;
};

export function computeLargeTextLayout(fontScale: number): LargeTextLayout {
  // Guard against 0 / NaN / undefined from a platform that does not report it.
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return {
    fontScale: safeScale,
    isLargeText: safeScale >= LARGE_TEXT_SCALE,
    isHugeText: safeScale >= HUGE_TEXT_SCALE,
    scaleSpace: (value: number) =>
      Math.round(value * Math.min(safeScale, MAX_SPACING_SCALE)),
  };
}
