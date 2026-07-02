import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import { router } from 'expo-router';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { fetchStrengthProgression } from '@/lib/bodyMetrics';
import type { StrengthProgressionPoint } from '@/types/body';

export default function StrengthProgressionScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { can } = useEntitlement();
  const { toast, showToast, hideToast } = useToast();
  const [exercise, setExercise] = useState('');
  const [points, setPoints] = useState<StrengthProgressionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const onLoad = useCallback(async () => {
    if (!exercise.trim()) return;
    setLoading(true);
    try {
      const data = await fetchStrengthProgression(exercise.trim(), 60);
      setPoints(data);
      setHasLoaded(true);
    } catch (e: any) {
      setPoints([]);
      setHasLoaded(true);
      showToast(e?.message ?? 'Failed to load progression data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [exercise, showToast]);

  if (!can('advancedAnalytics')) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ScreenHeader title="Strength progression" />
        <View style={styles.scroll}>
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="defaultSemiBold" style={styles.pointDate}>
              Advanced Analytics is a Pro feature
            </ThemedText>
            <ThemedText style={[styles.tipText, { color: placeholder }]}>
              Unlock strength trends, fatigue monitoring, and 1RM projections with Pro.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/paywall' as any)}
              style={({ pressed }) => [
                styles.loadBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Pro"
            >
              <ThemedText type="defaultSemiBold" style={[styles.loadBtnText, { color: onTint }]}>
                Upgrade to Pro
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Strength progression" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={[styles.tipText, { color: placeholder }]}>
            Tip: Type exactly the exercise name as you’ve logged it (e.g. ‘Bench Press’ or ‘Back Squat’).
          </ThemedText>
          <TextInput
            value={exercise}
            onChangeText={setExercise}
            placeholder="Exercise name"
            placeholderTextColor={placeholder}
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.input, { color: text, borderColor: border }]}
            returnKeyType="search"
            onSubmitEditing={onLoad}
          />
          <Pressable
            onPress={onLoad}
            disabled={loading || !exercise.trim()}
            style={({ pressed }) => [
              styles.loadBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
              (loading || !exercise.trim()) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Load strength progression"
          >
            <ThemedText type="defaultSemiBold" style={[styles.loadBtnText, { color: onTint }]}>
              {loading ? 'Loading…' : 'Load'}
            </ThemedText>
          </Pressable>
        </View>

        {hasLoaded && points.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>
              No data yet for this exercise.
            </ThemedText>
          </View>
        ) : (
          points.map((p, idx) => (
            <View key={`${p.workout_date}-${idx}`} style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText type="defaultSemiBold" style={styles.pointDate}>
                {p.workout_date}
              </ThemedText>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>Top weight</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {p.top_weight != null ? `${Math.round(p.top_weight)} lb` : '—'}
                </ThemedText>
              </View>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>Top reps</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {p.top_reps != null ? `${p.top_reps}` : '—'}
                </ThemedText>
              </View>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>e1RM</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {p.top_e1rm != null ? `${Math.round(p.top_e1rm)} lb` : '—'}
                </ThemedText>
              </View>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>Volume</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {p.total_volume != null ? `${Math.round(p.total_volume)} lb` : '—'}
                </ThemedText>
              </View>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>Sets</ThemedText>
                <ThemedText type="defaultSemiBold">{p.set_count}</ThemedText>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  tipText: { fontSize: 12, marginBottom: 12, fontStyle: 'italic' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  loadBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  loadBtnText: { fontSize: 16 },
  pointDate: { fontSize: 16, marginBottom: 8 },
  pointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pointLabel: { fontSize: 13 },
});
