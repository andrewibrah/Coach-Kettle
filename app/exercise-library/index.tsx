import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchExerciseLibrary, searchExercises } from '@/lib/exerciseLibrary';
import type { Exercise } from '@/types/exercise';

const BODY_PARTS = ['Push', 'Pull', 'Legs', 'Shoulders', 'Chest', 'Back', 'Bis', 'Tris', 'Abs', 'Cardio'];

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const [query, setQuery] = useState<string>('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [bodyPartFilter, setBodyPartFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchExerciseLibrary();
        if (!cancelled) setExercises(list);
      } catch (e) {
        console.warn('[exercise-library] load failed', e);
        if (!cancelled) setExercises([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearchSubmit = async () => {
    if (!query.trim()) {
      try {
        const list = await fetchExerciseLibrary();
        setExercises(list);
      } catch (e) {
        console.warn('[exercise-library] reset failed', e);
      }
      return;
    }
    setLoading(true);
    try {
      const results = await searchExercises(query);
      setExercises(results);
    } catch (e) {
      console.warn('[exercise-library] search failed', e);
      setExercises([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!bodyPartFilter) return exercises;
    return exercises.filter((e) => e.body_part === bodyPartFilter);
  }, [exercises, bodyPartFilter]);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Exercise Library" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearchSubmit}
            placeholder="Search exercises…"
            placeholderTextColor={placeholder}
            returnKeyType="search"
            style={[
              styles.input,
              {
                backgroundColor: inputBackground,
                color: textColor,
                borderColor: border,
              },
            ]}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
            style={{ marginTop: 12 }}
          >
            {BODY_PARTS.map((bp) => {
              const selected = bodyPartFilter === bp;
              return (
                <Pressable
                  key={bp}
                  onPress={() => setBodyPartFilter(selected ? null : bp)}
                  style={({ pressed }) => [
                    styles.pill,
                    {
                      backgroundColor: selected ? tint : 'transparent',
                      borderColor: selected ? tint : border,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText
                    style={[styles.pillText, { color: selected ? onTint : textColor }]}
                  >
                    {bp}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator color={tint} style={{ marginTop: 16 }} />
        ) : filtered.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              No exercises found.
            </ThemedText>
          </View>
        ) : (
          filtered.map((ex) => {
            const firstCue = ex.cues && ex.cues.length > 0 ? ex.cues[0] : null;
            return (
              <Pressable
                key={ex.id}
                onPress={() => router.push(`/exercise-library/${ex.slug}`)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: cardBackground },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.itemName, { color: textColor }]}>{ex.name}</ThemedText>
                <View style={styles.metaRow}>
                  <ThemedText style={[styles.metaTag, { color: placeholder, borderColor: border }]}>
                    {ex.category}
                  </ThemedText>
                  <ThemedText style={[styles.metaTag, { color: placeholder, borderColor: border }]}>
                    {ex.body_part}
                  </ThemedText>
                </View>
                {firstCue && (
                  <ThemedText
                    numberOfLines={1}
                    style={[styles.cueLine, { color: textColor, opacity: 0.7 }]}
                  >
                    {firstCue}
                  </ThemedText>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  pillRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  itemName: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  metaTag: {
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  cueLine: { fontSize: 13, marginTop: 8 },
  muted: { fontSize: 13 },
});
