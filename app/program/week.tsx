import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useProgram } from '@/contexts/ProgramContext';
import type { ProgramExercise } from '@/types/programming';

export default function ProgramWeekScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');

  const { program, currentWeek } = useProgram();

  const week = currentWeek && 'week' in currentWeek ? currentWeek.week : null;
  const days = currentWeek && 'days' in currentWeek ? currentWeek.days : [];

  const subtitle = week?.is_deload ? 'Deload week' : undefined;

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

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader
        title={`Week ${program?.current_week ?? ''}`.trim()}
        subtitle={subtitle}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {(!days || days.length === 0) && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              No days available for this week.
            </ThemedText>
          </View>
        )}

        {days?.map((day) => (
          <View key={day.id} style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.dayTitle}>
              Day {day.day_index} · {day.body_part}
              {day.title ? ` — ${day.title}` : ''}
            </ThemedText>

            {day.exercises.map((ex) => {
              const targets = formatTargets(ex);
              const rest = ex.rest_seconds != null ? `${ex.rest_seconds}s rest` : null;
              const navigable = !!ex.exercise_slug;
              return (
                <Pressable
                  key={ex.id}
                  onPress={() => {
                    if (navigable) {
                      router.push({
                        pathname: '/exercise-library/[slug]',
                        params: { slug: ex.exercise_slug ?? '' },
                      });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.exerciseRow,
                    { borderColor: border },
                    pressed && navigable && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={[styles.exerciseName, { color: textColor }]}>
                    {ex.exercise_name}
                  </ThemedText>
                  <ThemedText style={[styles.exerciseMeta, { color: placeholder }]}>
                    {targets}
                    {rest ? ` · ${rest}` : ''}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  dayTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  exerciseRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  exerciseName: { fontSize: 15, fontWeight: '600' },
  exerciseMeta: { fontSize: 13, marginTop: 2 },
  muted: { fontSize: 13 },
});
