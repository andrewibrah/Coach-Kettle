// Dismissible "Start Rest" prompt (#3). Shown instead of auto-starting the
// rest timer when the user has auto_start_rest_timer off — logging a set is
// data entry, not a claim that rest started, so the timer starts only on a
// tap. Auto-expires so it never lingers as clutter.

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { formatTime } from '@/lib/restTimer';

const AUTO_EXPIRE_MS = 45_000;

export interface RestPromptInfo {
  exercise: string;
  suggestedSec: number;
  at: number;
}

interface Props {
  prompt: RestPromptInfo;
  onStart: () => void;
  onDismiss: () => void;
}

export function StartRestPrompt({ prompt, onStart, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const cardBg = useThemeColor({}, 'cardBackground');
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');

  // Auto-expire so a forgotten prompt doesn't sit on screen indefinitely.
  useEffect(() => {
    const remaining = AUTO_EXPIRE_MS - (Date.now() - prompt.at);
    if (remaining <= 0) {
      onDismiss();
      return;
    }
    const t = setTimeout(onDismiss, remaining);
    return () => clearTimeout(t);
  }, [prompt.at, onDismiss]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        onPress={onStart}
        style={[styles.chip, { backgroundColor: cardBg, borderColor }]}
        accessibilityRole="button"
        accessibilityLabel={`Start rest, ${formatTime(prompt.suggestedSec)}`}
      >
        <ThemedText style={[styles.label, { color: textColor }]} numberOfLines={1}>
          Start rest · {formatTime(prompt.suggestedSec)}
        </ThemedText>
        <ThemedText style={[styles.sub, { color: placeholder }]} numberOfLines={1}>
          {prompt.exercise}
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={[styles.dismiss, { backgroundColor: cardBg, borderColor }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss start rest prompt"
      >
        <ThemedText style={{ color: placeholder, fontSize: 16 }}>✕</ThemedText>
      </Pressable>
      <View pointerEvents="none" style={[styles.accent, { backgroundColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flex: 1,
    flexDirection: 'column',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
  dismiss: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
