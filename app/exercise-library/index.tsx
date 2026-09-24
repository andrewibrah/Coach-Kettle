import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchExerciseLibrary } from '@/lib/exerciseLibrary';
import { formatExerciseName, formatTerm } from '@/lib/exerciseFormat';
import type { Exercise } from '@/types/exercise';

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
  const dangerColor = useThemeColor({}, 'danger');

  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [bodyPartFilter, setBodyPartFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await fetchExerciseLibrary(forceRefresh);
      setExercises(list);
    } catch (e) {
      console.warn('[exercise-library] load failed', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Filter pills derived from the actual dataset — never hardcoded, so a
  // future data import can't silently add unreachable values or leave dead
  // pills that match nothing (#11 Defect 2).
  const bodyParts = useMemo(
    () => [...new Set(exercises.map((e) => e.body_part).filter(Boolean))].sort(),
    [exercises]
  );

  // Local search + filter over the fully-paginated, already-cached list
  // (#11 Defect 3): one code path, so search and the body-part pill always
  // compose instead of a server-capped search result silently overriding
  // the filter's context.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => {
      if (bodyPartFilter && e.body_part !== bodyPartFilter) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, bodyPartFilter, query]);

  const renderExerciseCard = ({ item }: { item: Exercise }) => (
    <Pressable
      onPress={() => router.push(`/exercise-library/${item.slug}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBackground },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${formatExerciseName(item.name)}, ${formatTerm(item.category)}, ${formatTerm(item.body_part)}`}
    >
      <View style={styles.cardMain}>
        <ThemedText style={[styles.itemName, { color: textColor }]} numberOfLines={1}>
          {formatExerciseName(item.name)}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText style={[styles.metaTag, { color: placeholder, borderColor: border }]}>
            {formatTerm(item.category)}
          </ThemedText>
          <ThemedText style={[styles.metaTag, { color: placeholder, borderColor: border }]}>
            {formatTerm(item.body_part)}
          </ThemedText>
        </View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={placeholder} />
    </Pressable>
  );

  const resultCountLabel = loading
    ? null
    : query.trim() || bodyPartFilter
      ? `${filtered.length}${bodyPartFilter ? ` in ${bodyPartFilter}` : ''}`
      : `${exercises.length} exercises`;

  const ListHeader = (
    <View style={[styles.headerCard, { backgroundColor: cardBackground }]}>
      <View style={[styles.searchRow, { backgroundColor: inputBackground, borderColor: border }]}>
        <IconSymbol name="magnifyingglass" size={16} color={placeholder} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises…"
          placeholderTextColor={placeholder}
          returnKeyType="search"
          keyboardAppearance="default"
          clearButtonMode="while-editing"
          style={[styles.input, { color: textColor }]}
        />
      </View>

      <FlatList
        horizontal
        data={bodyParts}
        keyExtractor={(bp) => bp}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={{ marginTop: 12 }}
        renderItem={({ item: bp }) => {
          const selected = bodyPartFilter === bp;
          return (
            <Pressable
              onPress={() => setBodyPartFilter(selected ? null : bp)}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: selected ? tint : 'transparent',
                  borderColor: selected ? tint : border,
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="radio"
              accessibilityLabel={bp}
              accessibilityState={{ selected }}
            >
              <ThemedText style={[styles.pillText, { color: selected ? onTint : textColor }]}>
                {bp}
              </ThemedText>
            </Pressable>
          );
        }}
      />

      {resultCountLabel && (
        <ThemedText style={[styles.resultCount, { color: placeholder }]}>{resultCountLabel}</ThemedText>
      )}
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Exercise Library" />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={tint} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <ThemedText style={[styles.muted, { color: dangerColor }]}>Failed to load exercises.</ThemedText>
          <Pressable
            onPress={() => load(true)}
            style={({ pressed }) => [styles.retryBtn, { borderColor: border }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <ThemedText style={{ color: tint, fontWeight: '600' }}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(ex) => ex.id}
          renderItem={renderExerciseCard}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.muted, { color: placeholder }]}>
                {query || bodyPartFilter
                  ? `No exercises match ${query ? `"${query}"` : bodyPartFilter}.`
                  : 'No exercises found.'}
              </ThemedText>
              {(query || bodyPartFilter) && (
                <Pressable
                  onPress={() => { setQuery(''); setBodyPartFilter(null); }}
                  style={({ pressed }) => [styles.retryBtn, { borderColor: border, marginTop: 12 }, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filters"
                >
                  <ThemedText style={{ color: tint, fontWeight: '600' }}>Clear filters</ThemedText>
                </Pressable>
              )}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  headerCard: { borderRadius: 14, padding: 16, marginBottom: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  pillRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  pill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  resultCount: { fontSize: 12, marginTop: 10 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 68,
  },
  cardMain: { flex: 1 },
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
  muted: { fontSize: 13 },
  retryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
});
