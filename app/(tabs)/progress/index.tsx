import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useEntitlement } from '@/contexts/EntitlementContext';

import {
  fetchLatestBodyMetric,
  fetchRestingHRSummary,
  fetchBodyMetrics,
} from '@/lib/bodyMetrics';
import { WORKOUT_HISTORY_KEY } from '@/lib/workoutStorage';
import type {
  BodyMetricsEntry,
  RestingHeartRateSummary,
} from '@/types/body';

type LoadState = 'loading' | 'error' | 'ready';

// F15: an error or "nothing loaded yet" must never render as "never" — show the
// exact empty-state copy once we know for certain nothing has been logged, or a
// date-based label once there is something.
export function getLastLoggedLabel(latestDate: string | null): string {
  return latestDate ? `Last logged ${latestDate}` : 'No measurements logged yet.';
}

// F16: Strength progression is gated behind Advanced Analytics (Pro). Make that
// visible on the nav card itself, not only after tapping through to a paywall.
export function getStrengthNavLabel(hasAdvancedAnalytics: boolean): string {
  return hasAdvancedAnalytics ? 'Strength progression' : 'Strength progression (Pro)';
}

export default function ProgressHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const iconColor = useThemeColor({}, 'icon');
  const dangerColor = useThemeColor({}, 'danger');
  const dangerFill = useThemeColor({}, 'dangerFill');
  const dangerForeground = useThemeColor({}, 'dangerForeground');
  const successColor = useThemeColor({}, 'success');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { can } = useEntitlement();

  const [latest, setLatest] = useState<BodyMetricsEntry | null>(null);
  const [rhrSummary, setRhrSummary] = useState<RestingHeartRateSummary | null>(null);
  const [recentMetrics, setRecentMetrics] = useState<BodyMetricsEntry[]>([]);
  const [workouts7d, setWorkouts7d] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const mounted = useRef(false);
  const loadSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadWorkouts7d = useCallback(async (): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(WORKOUT_HISTORY_KEY);
      if (!raw) return 0;
      const sessions = JSON.parse(raw);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return sessions.filter((s: { createdAt: number }) => s.createdAt >= cutoff).length;
    } catch (e) {
      console.warn('[progress] workouts7d parse failed', e);
      return 0;
    }
  }, []);

  const load = useCallback(async () => {
    // Cancellation guard: only the most recently started load may commit state,
    // so a slow stale request from a previous focus can't clobber a fresh one.
    const sequence = ++loadSequence.current;
    const isCurrent = () => mounted.current && sequence === loadSequence.current;
    try {
      const [latestResult, rhrResult, metricsResult, workoutsResult] = await Promise.all([
        fetchLatestBodyMetric(),
        fetchRestingHRSummary(30),
        fetchBodyMetrics(60),
        loadWorkouts7d(),
      ]);
      if (!isCurrent()) return;
      setLatest(latestResult);
      setRhrSummary(rhrResult);
      // Sort newest-first so recentMetrics[0] is the most recent entry (BUG 5)
      setRecentMetrics(
        [...metricsResult].sort((a, b) => b.measured_date.localeCompare(a.measured_date))
      );
      setWorkouts7d(workoutsResult);
      setLoadState('ready');
      setLoadError(null);
    } catch (e: any) {
      if (!isCurrent()) return;
      console.warn('[progress] load failed', e);
      const message = e?.message ?? 'Could not load progress data.';
      // Keep any previously loaded data visible; only fall back to the full
      // error state when there is nothing on screen yet.
      setLoadError(message);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, [loadWorkouts7d]);

  // Refresh whenever the screen regains focus (e.g. returning from measurements,
  // resting-hr, or workout history) so stats never go stale silently.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRetry = useCallback(async () => {
    setRetrying(true);
    await load();
    if (mounted.current) setRetrying(false);
  }, [load]);

  const navTo = useCallback((path: string) => () => router.push(path as any), [router]);

  const rhrDelta = rhrSummary?.trend_delta_bpm ?? 0;
  const rhrArrow = rhrDelta > 0 ? '↑' : rhrDelta < 0 ? '↓' : '·';
  const rhrColor = rhrDelta > 0 ? dangerColor : rhrDelta < 0 ? successColor : placeholder;
  const hasAdvancedAnalytics = can('advancedAnalytics');

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Progress" showBack={false} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {loadState === 'loading' ? (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator />
          </View>
        ) : loadState === 'error' ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: dangerColor }} accessibilityRole="alert">
              Couldn&apos;t load progress data. Check your connection and try again.
            </ThemedText>
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
                retrying && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading progress data"
              accessibilityState={{ disabled: retrying, busy: retrying }}
            >
              <ThemedText type="defaultSemiBold" style={{ color: onTint }}>{retrying ? 'Retrying…' : 'Retry'}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            {loadError && (
              <View style={[styles.card, { backgroundColor: dangerFill }]}>
                <ThemedText style={[styles.errorBannerText, { color: dangerForeground }]} accessibilityRole="alert">
                  Couldn&apos;t refresh. Showing previously loaded data.
                </ThemedText>
              </View>
            )}
            {/* Quick stats */}
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText type="subtitle" style={styles.cardTitle}>Quick stats</ThemedText>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <ThemedText style={[styles.statLabel, { color: placeholder }]}>Weight</ThemedText>
                  <ThemedText type="title" style={styles.statValue}>
                    {latest?.weight_lbs != null ? Math.round(latest.weight_lbs) : '—'}
                  </ThemedText>
                  <ThemedText style={[styles.statUnit, { color: placeholder }]}>lb</ThemedText>
                </View>
                <View style={styles.statCol}>
                  <ThemedText style={[styles.statLabel, { color: placeholder }]}>RHR avg (30d)</ThemedText>
                  <ThemedText type="title" style={styles.statValue}>
                    {rhrSummary?.avg_bpm != null ? Math.round(rhrSummary.avg_bpm) : '—'}
                  </ThemedText>
                  <ThemedText style={[styles.statUnit, { color: placeholder }]}>bpm</ThemedText>
                  {rhrSummary?.trend_delta_bpm != null && (
                    <ThemedText style={[styles.trendText, { color: rhrColor }]}>
                      {rhrArrow} {Math.abs(rhrSummary?.trend_delta_bpm ?? 0)}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.statCol}>
                  <ThemedText style={[styles.statLabel, { color: placeholder }]}>Workouts (7d)</ThemedText>
                  <ThemedText type="title" style={styles.statValue}>
                    {workouts7d !== null ? workouts7d : '—'}
                  </ThemedText>
                  <ThemedText style={[styles.statUnit, { color: placeholder }]}>sessions</ThemedText>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Nav buttons */}
        <NavCard
          icon="figure.arms.open"
          label="Body measurements & photos"
          onPress={navTo('/progress/body')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavCard
          icon="chart.line.uptrend.xyaxis"
          label={getStrengthNavLabel(hasAdvancedAnalytics)}
          locked={!hasAdvancedAnalytics}
          onPress={navTo('/progress/strength')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavCard
          icon="heart.fill"
          label="Resting heart rate"
          onPress={navTo('/progress/resting-hr')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavCard
          icon="photo.on.rectangle"
          label="Progress photos"
          onPress={navTo('/progress/photos')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />

        {loadState === 'ready' && (
          <ThemedText style={[styles.lastLogged, { color: placeholder }]}>
            {getLastLoggedLabel(recentMetrics[0]?.measured_date ?? null)}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function NavCard({
  icon,
  label,
  locked,
  onPress,
  cardBackground,
  iconColor,
  placeholder,
}: {
  icon: string;
  label: string;
  locked?: boolean;
  onPress: () => void;
  cardBackground: string;
  iconColor: string;
  placeholder: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navCard,
        { backgroundColor: cardBackground },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.navCardLeft}>
        <IconSymbol name={icon as any} size={22} color={iconColor} />
        <ThemedText type="defaultSemiBold" style={styles.navCardLabel}>{label}</ThemedText>
        {locked && <IconSymbol name="lock.shield" size={16} color={placeholder} />}
      </View>
      <IconSymbol name="chevron.right" size={18} color={placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  center: { alignItems: 'center', justifyContent: 'center' },
  retryBtn: { marginTop: 12, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorBannerText: { fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCol: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 26, lineHeight: 30 },
  statUnit: { fontSize: 11, marginTop: 2 },
  trendText: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  navCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  navCardLabel: { fontSize: 16 },
  lastLogged: { fontSize: 12, marginTop: 4, textAlign: 'center' },
});
