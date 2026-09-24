/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';
// Neutral accent for dark mode — replaces the blue tint so dark UI stays monochrome.
const accentDark = '#E5E7EB';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Text/icon color to place on top of a `tint`-filled surface (buttons).
    tintForeground: '#ffffff',
    border: '#D6D6D6',
    inputBackground: '#F3F4F6',
    placeholder: '#6B7280',
    headerBackground: '#ffffff',
    cardBackground: '#ffffff',
    secondaryBackground: '#F9FAFB',
    danger: '#EF4444',
    // Text/icon color to place on top of a `danger`-filled surface (error banners).
    dangerForeground: '#ffffff',
    success: '#10B981',
    warning: '#F59E0B',
    // Camera viewfinder surface (barcode scanner) is always dark, by intent,
    // in both light and dark mode — same value in both palettes.
    cameraOverlay: '#000000',
    cameraOverlayText: '#ffffff',
    cameraScrim: 'rgba(0,0,0,0.55)',
    // Tinted surface behind a warning row/button (e.g. "Clear Local Cache").
    warningSurface: '#FFF8E6',
    // Tinted surface behind a danger row/button (e.g. "Log Out").
    dangerSurface: '#FFF1F0',
    // Filled danger button background. `danger` (#EF4444) against white text
    // is ~3.76:1, which fails WCAG AA (4.5:1) for normal text — this darker
    // red is for solid danger buttons with a white/light foreground; keep
    // `danger`/`dangerForeground` for icon/text-only use.
    dangerFill: '#DC2626',
    // Overlay tint for a pressed row/button background.
    pressedSurface: 'rgba(0,0,0,0.05)',
    // Accent for premium/Pro affordances (crown, trophy). Same value in both
    // themes — gold reads clearly on both light and dark surfaces.
    premiumAccent: '#FFD700',
    // `Switch` track color when off.
    switchTrackInactive: '#767577',
    // `Switch` thumb color. Same value in both themes — white reads clearly
    // against both the light and dark track colors.
    switchThumb: '#ffffff',
    // Shadow color for elevated surfaces (e.g. primary CTA buttons).
    shadow: '#000000',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: accentDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Dark mode accent is light, so on-tint text must be dark for contrast.
    tintForeground: '#151718',
    border: '#374151',
    inputBackground: '#374151',
    placeholder: '#9CA3AF',
    headerBackground: '#151718',
    cardBackground: '#1F2937',
    secondaryBackground: '#1F2937',
    danger: '#EF4444',
    // Same red as light mode, so white stays high-contrast on top of it.
    dangerForeground: '#ffffff',
    success: '#10B981',
    warning: '#F59E0B',
    // Same value as light mode — the camera viewfinder is always dark.
    cameraOverlay: '#000000',
    cameraOverlayText: '#ffffff',
    cameraScrim: 'rgba(0,0,0,0.55)',
    warningSurface: '#3d2d00',
    dangerSurface: '#3d1515',
    // Same darker red as light mode — see light.dangerFill for the contrast note.
    dangerFill: '#DC2626',
    // Lighter overlay than light mode so a press is visible against dark surfaces.
    pressedSurface: 'rgba(255,255,255,0.08)',
    // Same value as light mode — gold reads clearly on both light and dark surfaces.
    premiumAccent: '#FFD700',
    switchTrackInactive: '#767577',
    // Same value as light mode — white reads clearly against both track colors.
    switchThumb: '#ffffff',
    shadow: '#000000',
  },
};

/**
 * Accent color resolver. Several screens historically hard-coded a light-blue
 * accent (`#3B82F6`). In dark mode the app stays monochrome, so blue accents
 * resolve to neutral gray instead. Light mode keeps the original blue.
 * `kind: 'text'` is for links/icons/labels; `kind: 'fill'` is for filled
 * button/bubble backgrounds (needs more contrast against white text).
 */
export function accentColor(isDark: boolean, kind: 'text' | 'fill' = 'text'): string {
  if (!isDark) return '#3B82F6';
  return kind === 'fill' ? '#4B5563' : '#D1D5DB';
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
