// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  'line.3.horizontal': 'menu',
  'clock.fill': 'history',
  'questionmark.circle': 'help-outline',
  'xmark.circle.fill': 'close',
  'trash': 'delete',
  'trash.fill': 'delete',
  'sparkles': 'auto_awesome',
  'xmark': 'close',
  'plus': 'add',
  'checkmark': 'check',
  'checkmark.circle.fill': 'check-circle',
  'person.fill': 'person',
  'trophy.fill': 'emoji-events',
  'gear': 'settings',
  'lock.shield': 'security',
  'exclamationmark.triangle': 'warning',
  'rectangle.portrait.and.arrow.right': 'logout',
  'chart.line.uptrend.xyaxis': 'trending-up',
  'pencil': 'edit',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'info.circle': 'info-outline',
  'doc.text.fill': 'description',
  'bubble.left.and.bubble.right.fill': 'forum',
  'chart.bar.fill': 'bar-chart',
  'crown.fill': 'workspace-premium',
  'arrow.clockwise': 'refresh',
  'minus.circle.fill': 'remove-circle',
  'play.fill': 'play-arrow',
  'fork.knife': 'restaurant',
  'bell.fill': 'notifications',
  'camera.fill': 'photo-camera',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name] as ComponentProps<typeof MaterialIcons>['name']}
      style={style}
    />
  );
}
