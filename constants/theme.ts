/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    border: '#E0E0E0',
    borderLight: '#EFEFEF',
    pillBorder: '#D0D0D0',
    inputBorder: '#D6D6D6',
    inputBackground: '#FFFFFF',
    tableHeaderBg: '#F6F6F6',
    tableHeaderBorder: '#E6E6E6',
    tableRowEven: '#FFFFFF',
    tableRowOdd: '#FAFAFA',
    modalCardBg: '#FFFFFF',
    modalItemBorder: '#E6E6E6',
    modalItemSelectedBg: '#F7F7F7',
    modalItemSelectedBorder: '#BDBDBD',
    modalDoneBg: '#F2F2F2',
    modalDoneBorder: '#CFCFCF',
    modalClearBorder: '#D8D8D8',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    border: '#2E3032',
    borderLight: '#23272A',
    pillBorder: '#3A3F42',
    inputBorder: '#3A3F42',
    inputBackground: '#1E2022',
    tableHeaderBg: '#1C1F21',
    tableHeaderBorder: '#2E3032',
    tableRowEven: '#151718',
    tableRowOdd: '#1A1D1F',
    modalCardBg: '#1E2022',
    modalItemBorder: '#2E3032',
    modalItemSelectedBg: '#252829',
    modalItemSelectedBorder: '#4A4F52',
    modalDoneBg: '#252829',
    modalDoneBorder: '#3A3F42',
    modalClearBorder: '#2E3032',
  },
};

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
