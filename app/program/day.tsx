import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useProgram } from '@/contexts/ProgramContext';
import { fetchNextSetSuggestion } from '@/lib/programming';
import type { NextSetSuggestion, ProgramExercise } from '@/types/programming';

export default function ProgramDayScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');

  const { dayId, dayIndex } = useLocalSearchParams<{ dayId: string; dayIndex: string }>();
  const { currentWeek } = useProgram();

  const day = useMemo(() => {
    const days = currentWeek && 'days' in currentWeek ? currentWeek.days : [];
    if (!days || days.length === 0) return null;
    if (dayId) {
      const m = days.find((d) => d.id === dayId);
      if (m) return m;
    }
    if (dayIndex) {
      const idx = parseInt(String(dayIndex), 10);
      if (!Number.isNaN(idx)) {
        const m = days.find((d) => d.day_index === idx);
        if (m) return m;
      }
    }
    return null;
  }, [currentWeek, dayId, dayIndex]);

  const [suggestions, setSuggestions] = useState<Record<string, NextSetSuggestion | null>>({});

  useEffect(() => {
    if (!day) return;
    let cancelled = false;
    (async () => {
      for (const ex of day.exercises) {
        try {
          const s = await fetchNextSetSuggestion(ex.exercise_name);
          if (cancelled) return;
          setSuggestions((prev) => ({ ...prev, [ex.id]: s }));
        } catch {
          if (cancelled) return;
          setSuggestions((prev) => ({ ...prev, [ex.id]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day]);

  const formatTargets = (ex: ProgramExercise) => {
    const reps =
      ex.target_reps_low != null && ex.target_reps_high != null
        ? `${ex.target_reps_low}–${ex.target_reps_high}`
        : ex.target_reps_low != null
        ? `${ex.target_reps_low}`
        : '—';
    const weightSuffix = ex.target_weight_lbs ? ` @ ${ex.target_weight_lbs}lb` : '';
    return `${ex.target_sets}×${reps}${weightSuffix}`;
  };

  if (!day) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ScreenHeader title="Day" />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.muted, { color: placeholder }]}>Day not found</ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title={`Day ${day.day_index} — ${day.body_part}`} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {day.exercises.map((ex) => {
          const s = suggestions[ex.id];
          const rest = ex.rest_seconds != null ? ` · ${ex.rest_seconds}s rest` : '';
          return (
            <View key={ex.id} style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.exerciseName, { color: textColor }]}>
                {ex.exercise_name}
              </ThemedText>
              <ThemedText style={[styles.exerciseMeta, { color: placeholder }]}>
                {formatTargets(ex)}
                {rest}
              </ThemedText>
              <View style={[styles.suggestPill, { borderColor: tint }]}>
                {s ? (
                  <>
                    <ThemedText style={[styles.suggestText, { color: tint }]}>
                      Suggest: {s.suggested_weight_lbs ?? '—'} lb × {s.suggested_reps_low}-{s.suggested_reps_high}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>{s.rationale}</ThemedText>
                  </>
                ) : (
                  <ThemedText style={[styles.suggestText, { color: tint }]}>
                    Suggest: loading…
                  </ThemedText>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  exerciseName: { fontSize: 16, fontWeight: '700' },
  exerciseMeta: { fontSize: 13, marginTop: 4 },
  suggestPill: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  suggestText: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  muted: { fontSize: 13 },
});
