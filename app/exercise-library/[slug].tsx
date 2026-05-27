import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getExerciseBySlug } from '@/lib/exerciseLibrary';
import type { Exercise } from '@/types/exercise';

export default function ExerciseDetailScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');

  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ex = await getExerciseBySlug(String(slug));
        if (!cancelled) setExercise(ex);
      } catch {
        if (!cancelled) setExercise(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ScreenHeader title="Exercise" />
        <ActivityIndicator color={tint} style={{ marginTop: 24 }} />
      </ThemedView>
    );
  }

  if (!exercise) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ScreenHeader title="Exercise" />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              Exercise not found
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title={exercise.name} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Overview</ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Body part: {exercise.body_part}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Category: {exercise.category}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Difficulty: {exercise.difficulty}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Equipment: {exercise.equipment.length > 0 ? exercise.equipment.join(', ') : '—'}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Why this exercise</ThemedText>
          <ThemedText style={[styles.body, { color: textColor }]}>
            {exercise.description ?? 'No description available.'}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Cues</ThemedText>
          {exercise.cues.length === 0 ? (
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              No cues available.
            </ThemedText>
          ) : (
            exercise.cues.map((c, i) => (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={[styles.bullet, { color: textColor }]}>•</ThemedText>
                <ThemedText style={[styles.bulletText, { color: textColor }]}>{c}</ThemedText>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Common mistakes</ThemedText>
          {exercise.common_mistakes.length === 0 ? (
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              No common mistakes listed.
            </ThemedText>
          ) : (
            exercise.common_mistakes.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={[styles.bullet, { color: textColor }]}>•</ThemedText>
                <ThemedText style={[styles.bulletText, { color: textColor }]}>{m}</ThemedText>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Muscles worked</ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Primary: {exercise.primary_muscles.length > 0 ? exercise.primary_muscles.join(', ') : '—'}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Secondary: {exercise.secondary_muscles.length > 0 ? exercise.secondary_muscles.join(', ') : '—'}
          </ThemedText>
        </View>

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  row: { fontSize: 14, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { fontSize: 14, marginRight: 8, lineHeight: 20 },
  bulletText: { fontSize: 14, flex: 1, lineHeight: 20 },
  muted: { fontSize: 13 },
});
