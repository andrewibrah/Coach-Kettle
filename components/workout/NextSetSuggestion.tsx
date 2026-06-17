// Per-row "Suggested next set" pill. Fetches /next-set for the row's exercise
// and renders a compact recommendation: weight × rep-range + strategy + reason.
//
// Designed to be dropped under (or beside) the inline workout row in
// `app/(tabs)/index.tsx`. Re-fetches when the exercise name changes.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchNextSetSuggestion } from '@/lib/programming';
import type { NextSetSuggestion } from '@/types/programming';

type Props = {
  exercise: string;
  /** Optional callback when the user taps "use" — receives suggested weight. */
  onUseWeight?: (weightLbs: number) => void;
  /** Compact mode for tight rows (default true). */
  compact?: boolean;
};

const STRATEGY_LABEL: Record<NextSetSuggestion['strategy'], string> = {
  no_history:       'no history',
  hold:             'hold',
  increase_weight:  '↑ load',
  micro_load:       '+2.5 lb',
  deload_set:       '↓ back off',
};

export function NextSetSuggestionPill({ exercise, onUseWeight, compact = true }: Props) {
  const [data, setData] = useState<NextSetSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const lastExerciseRef = useRef<string>('');
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    const trimmed = exercise.trim();
    if (!trimmed) {
      setData(null);
      return;
    }
    if (trimmed.toLowerCase() === lastExerciseRef.current) return;
    lastExerciseRef.current = trimmed.toLowerCase();

    let cancelled = false;
    setLoading(true);
    fetchNextSetSuggestion(trimmed)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [exercise]);

  if (loading) {
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.label, { color: textColor }]}>Loading suggestion…</ThemedText>
      </View>
    );
  }

  if (!data) return null;

  const weight = data.suggested_weight_lbs;
  const reps = `${data.suggested_reps_low}–${data.suggested_reps_high}`;
  const strategy = STRATEGY_LABEL[data.strategy] ?? data.strategy;

  return (
    <View style={[styles.pill, { backgroundColor: cardBg }]}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.label, { color: textColor }]}>
          {weight != null ? `${Math.round(weight)} lb × ${reps}` : `Try ${reps} reps`} <ThemedText style={{ opacity: 0.6 }}>({strategy})</ThemedText>
        </ThemedText>
        {!compact && (
          <ThemedText style={[styles.rationale, { color: textColor }]} numberOfLines={2}>
            {data.rationale}
          </ThemedText>
        )}
      </View>
      {weight != null && onUseWeight && (
        <Pressable
          onPress={() => onUseWeight(weight)}
          style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`Use suggested weight ${Math.round(weight)} lbs`}
        >
          <ThemedText style={[styles.useText, { color: tint }]}>Use</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: '600' },
  rationale: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  useBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  useText: { fontSize: 13, fontWeight: '700' },
});
