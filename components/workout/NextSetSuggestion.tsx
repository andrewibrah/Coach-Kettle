// Per-row "Suggested next set" pill. Fetches /next-set for the row's exercise
// and renders a compact recommendation: weight × rep-range + strategy + reason.
//
// Designed to be dropped under (or beside) the inline workout row in
// `app/(tabs)/index.tsx`. Re-fetches when the exercise name changes.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchNextSetSuggestion } from '@/lib/programming';
import type { NextSetBaseline, NextSetResult, NextSetSuggestion } from '@/types/programming';

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
  micro_load:       'micro load',
  deload_set:       '↓ back off',
};

/** Signed load change the suggestion actually returns, or null when either load is unknown. */
export function loadDeltaLabel(s: Pick<NextSetSuggestion, 'suggested_weight_lbs' | 'last_top_weight_lbs'>): string | null {
  if (s.suggested_weight_lbs == null || s.last_top_weight_lbs == null) return null;
  const delta = Math.round((s.suggested_weight_lbs - s.last_top_weight_lbs) * 10) / 10;
  return `${delta > 0 ? '+' : ''}${delta} lb`;
}

/** Heaviest set of the prior completed session (ties: most reps). Load is shown unrounded. */
export function lastSessionLabel(baseline: NextSetBaseline): string | null {
  let top: NextSetBaseline['sets'][number] | null = null;
  for (const set of baseline.sets) {
    if (!top || set.weightLbs > top.weightLbs || (set.weightLbs === top.weightLbs && set.reps > top.reps)) top = set;
  }
  return top ? `Last session: ${top.weightLbs} lb × ${top.reps}` : null;
}

export function NextSetSuggestionPill({ exercise, onUseWeight, compact = true }: Props) {
  const [result, setResult] = useState<NextSetResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Keyed on the normalized name: a casing-only edit neither refetches nor
  // cancels the in-flight request (which previously left Loading forever).
  const exerciseKey = exercise.trim().toLowerCase();
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    if (!exerciseKey) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchNextSetSuggestion(exerciseKey)
      .then((r) => { if (!cancelled) setResult(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [exerciseKey]);

  if (loading) {
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.label, { color: textColor }]}>Loading suggestion…</ThemedText>
      </View>
    );
  }

  if (!result) return null;

  if (result.status !== 'suggestion') {
    const last = result.status === 'unavailable' && result.baseline ? lastSessionLabel(result.baseline) : null;
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.label, { color: textColor }]}>
            {result.status === 'no_history' ? 'No previous session' : last ?? 'Suggestions unavailable'}
          </ThemedText>
          {last && (
            <ThemedText style={[styles.rationale, { color: textColor }]}>Suggestions off</ThemedText>
          )}
        </View>
      </View>
    );
  }

  const data = result.suggestion;
  const weight = data.suggested_weight_lbs;
  const reps = `${data.suggested_reps_low}–${data.suggested_reps_high}`;
  const strategy = (data.strategy === 'micro_load' && loadDeltaLabel(data)) || (STRATEGY_LABEL[data.strategy] ?? data.strategy);

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
