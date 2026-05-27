import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/useThemeColor';

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

export default function ProgressHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const iconColor = useThemeColor({}, 'icon');

  const [latest, setLatest] = useState<BodyMetricsEntry | null>(null);
  const [rhrSummary, setRhrSummary] = useState<RestingHeartRateSummary | null>(null);
  const [recentMetrics, setRecentMetrics] = useState<BodyMetricsEntry[]>([]);
  const [workouts7d, setWorkouts7d] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchLatestBodyMetric()
      .then((v) => { if (mounted) setLatest(v); })
      .catch(() => {});

    fetchRestingHRSummary(30)
      .then((v) => { if (mounted) setRhrSummary(v); })
      .catch(() => {});

    fetchBodyMetrics(60)
      .then((v) => {
        if (!mounted) return;
        // Sort newest-first so recentMetrics[0] is the most recent entry (BUG 5)
        const sorted = [...v].sort((a, b) =>
          b.measured_date.localeCompare(a.measured_date)
        );
        setRecentMetrics(sorted);
      })
      .catch(() => {});

    // Count workouts in the last 7 days from local storage (W15: key constant)
    AsyncStorage.getItem(WORKOUT_HISTORY_KEY)
      .then((raw) => {
        if (!mounted) return;
        if (!raw) { setWorkouts7d(0); return; }
        try {
          const sessions = JSON.parse(raw);
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          setWorkouts7d(
            sessions.filter((s: { createdAt: number }) => s.createdAt >= cutoff).length
          );
        } catch {
          setWorkouts7d(0);
        }
      })
      .catch(() => setWorkouts7d(0));

    return () => { mounted = false; };
  }, []);

  const navTo = useCallback((path: string) => () => router.push(path as any), [router]);

  const dangerColor = useThemeColor({}, 'danger');
  const successColor = useThemeColor({}, 'success');

  const rhrDelta = rhrSummary?.trend_delta_bpm ?? 0;
  const rhrArrow = rhrDelta > 0 ? '↑' : rhrDelta < 0 ? '↓' : '·';
  const rhrColor = rhrDelta > 0 ? dangerColor : rhrDelta < 0 ? successColor : placeholder;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Progress" showBack={false} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
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
          label="Strength progression"
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

        <ThemedText style={[styles.lastLogged, { color: placeholder }]}>
          Last logged {recentMetrics[0]?.measured_date ?? 'never'}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function NavCard({
  icon,
  label,
  onPress,
  cardBackground,
  iconColor,
  placeholder,
}: {
  icon: string;
  label: string;
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
    >
      <View style={styles.navCardLeft}>
        <IconSymbol name={icon as any} size={22} color={iconColor} />
        <ThemedText type="defaultSemiBold" style={styles.navCardLabel}>{label}</ThemedText>
      </View>
      <IconSymbol name="chevron.right" size={18} color={placeholder} />
    </Pressable>
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
