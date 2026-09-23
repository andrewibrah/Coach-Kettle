import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
  const dangerColor = useThemeColor({}, 'danger');
  const dangerForeground = useThemeColor({}, 'dangerForeground');

  const { can } = useEntitlement();
  const { toast, showToast, hideToast } = useToast();
  const [exercise, setExercise] = useState('');
  const [points, setPoints] = useState<StrengthProgressionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixed, non-raw copy: never surface e.message directly (finding 6).
  const LOAD_ERROR_MESSAGE = "Couldn't load progression data. Check your connection and try again.";

  const mounted = useRef(false);
  // Guards against onSubmitEditing bypassing the disabled Load button and
  // firing a second, concurrent search: only the most recently started
  // search may commit its result (finding 4).
  const searchSeq = useRef(0);
  // Tracks which exercise the currently-shown points belong to, so a failed
  // search for a *different* exercise can never be mistaken for a stale
  // result of the exercise still on screen (finding 1).
  const loadedExercise = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const onLoad = useCallback(async () => {
    const query = exercise.trim();
    if (!query) return;
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      const data = await fetchStrengthProgression(query, 60);
      if (!mounted.current || seq !== searchSeq.current) return;
      setPoints(data);
      setHasLoaded(true);
      setError(null);
      loadedExercise.current = query;
    } catch (e: any) {
      console.warn('[strength] load failed', e);
      if (!mounted.current || seq !== searchSeq.current) return;
      if (loadedExercise.current !== query) {
        // The points on screen (if any) belong to a different exercise than
        // the one that just failed — never show them under the wrong label.
        // Fall back to the full error state instead of a same-exercise
        // "stale results" banner.
        setPoints([]);
        setHasLoaded(false);
        loadedExercise.current = null;
      }
      setError(LOAD_ERROR_MESSAGE);
      showToast(LOAD_ERROR_MESSAGE, 'error');
    } finally {
      if (mounted.current && seq === searchSeq.current) setLoading(false);
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

        {loading && points.length === 0 ? (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator />
          </View>
        ) : error && points.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: dangerColor }} accessibilityRole="alert">
              {error}
            </ThemedText>
            <Pressable
              onPress={onLoad}
              style={({ pressed }) => [
                styles.loadBtn,
                styles.retryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading strength progression"
            >
              <ThemedText type="defaultSemiBold" style={[styles.loadBtnText, { color: onTint }]}>
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : hasLoaded && points.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>
              No saved sets found for this exercise. Use the exact name from Workout History, or log and finish a workout first.
            </ThemedText>
          </View>
        ) : (
          <>
            {error && points.length > 0 && (
              <View style={[styles.card, { backgroundColor: dangerColor }]}>
                <ThemedText style={[styles.errorBannerText, { color: dangerForeground }]} accessibilityRole="alert">
                  Couldn&apos;t refresh. Showing the last loaded results.
                </ThemedText>
              </View>
            )}
            {points.map((p, idx) => (
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
                  {/* Volume is weight x reps, so its unit is lb-reps, not lb. Labelling
                      it "lb" invited a nonsense comparison with Top weight above. */}
                  {p.total_volume != null ? `${Math.round(p.total_volume).toLocaleString()} lb·reps` : '—'}
                </ThemedText>
              </View>
              <View style={styles.pointRow}>
                <ThemedText style={[styles.pointLabel, { color: placeholder }]}>Sets</ThemedText>
                <ThemedText type="defaultSemiBold">{p.set_count}</ThemedText>
              </View>
            </View>
            ))}
          </>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  retryBtn: { marginTop: 12, minHeight: 44, justifyContent: 'center' },
  errorBannerText: { fontSize: 13, lineHeight: 18 },
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
