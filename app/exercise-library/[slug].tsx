import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getExerciseBySlug } from '@/lib/exerciseLibrary';
import { formatExerciseName, formatTerm, formatTermList } from '@/lib/exerciseFormat';
import type { Exercise } from '@/types/exercise';

// Media licensing is contested — ship text-only until a licensed media set exists.
const SHOW_EXERCISE_MEDIA = false;

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
      } catch (e) {
        console.warn('[exercise-library/slug] load failed', e);
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

  // English-only for now (dataset ships 6 locales; surface en, fall through gracefully).
  const rawEn = exercise.instructions?.en;
  const instructionsEn = Array.isArray(rawEn) ? rawEn.join('\n') : (rawEn ?? null);

  // The dataset lists some muscles as both primary and secondary. Repeating them
  // reads as a data error, so a muscle already shown as primary is dropped here.
  const primaryKeys = new Set(exercise.primary_muscles.map((m) => m.toLowerCase().trim()));
  const secondaryMuscles = exercise.secondary_muscles.filter(
    (m) => !primaryKeys.has(m.toLowerCase().trim())
  );

  // Media (GIF) is licensing-contested — default OFF, only media_id is stored.
  const gifUrl = SHOW_EXERCISE_MEDIA && exercise.media_id
    ? `https://static.exercisedb.dev/media/${exercise.media_id}.gif`
    : null;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title={formatExerciseName(exercise.name)} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {gifUrl && (
          <Image
            source={{ uri: gifUrl }}
            style={styles.media}
            resizeMode="contain"
            accessibilityLabel={`${formatExerciseName(exercise.name)} demonstration`}
          />
        )}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Overview</ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Body part: {formatTerm(exercise.body_part)}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Category: {formatTerm(exercise.category)}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Difficulty: {formatTerm(exercise.difficulty)}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Equipment: {formatTermList(exercise.equipment)}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Why this exercise</ThemedText>
          <ThemedText style={[styles.body, { color: textColor }]}>
            {exercise.description ?? 'No description available.'}
          </ThemedText>
        </View>

        {exercise.cues.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.cardTitle}>Cues</ThemedText>
            {exercise.cues.map((c, i) => (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={[styles.bullet, { color: textColor }]}>•</ThemedText>
                <ThemedText style={[styles.bulletText, { color: textColor }]}>{c}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {exercise.common_mistakes.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.cardTitle}>Common mistakes</ThemedText>
            {exercise.common_mistakes.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={[styles.bullet, { color: textColor }]}>•</ThemedText>
                <ThemedText style={[styles.bulletText, { color: textColor }]}>{m}</ThemedText>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>Muscles worked</ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Primary: {formatTermList(exercise.primary_muscles)}
          </ThemedText>
          <ThemedText style={[styles.row, { color: textColor }]}>
            Secondary: {formatTermList(secondaryMuscles)}
          </ThemedText>
        </View>

        {instructionsEn && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.cardTitle}>Instructions</ThemedText>
            <ThemedText style={[styles.body, { color: textColor }]}>{instructionsEn}</ThemedText>
          </View>
        )}

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  media: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  row: { fontSize: 14, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { fontSize: 14, marginRight: 8, lineHeight: 20 },
  bulletText: { fontSize: 14, flex: 1, lineHeight: 20 },
  muted: { fontSize: 13 },
});
