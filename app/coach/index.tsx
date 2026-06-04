import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useCoaching } from '@/contexts/CoachingContext';
import type { ColorGrade } from '@/types/nutrition';

const COLOR_MAP: Record<ColorGrade, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
};

function dotColor(grade: ColorGrade | null | undefined, fallback: string): string {
  if (!grade) return fallback;
  return COLOR_MAP[grade] ?? fallback;
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { loading, today, regenerateToday } = useCoaching();
  const [regenerating, setRegenerating] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      await regenerateToday();
    } catch (e) {
      console.warn('[coach] regenerate failed', e);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Today" subtitle={todayIso} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {!today ? (
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText type="subtitle" style={{ marginBottom: 6 }}>No data yet</ThemedText>
              <ThemedText style={{ color: placeholder }}>
                No data yet today — log some food and finish a workout.
              </ThemedText>
              <Pressable
                onPress={handleRegenerate}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: tint, marginTop: 12 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {regenerating ? (
                  <ActivityIndicator color={onTint} />
                ) : (
                  <ThemedText style={{ color: onTint, fontWeight: '700' }}>Generate</ThemedText>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <ThemedText type="subtitle">Daily feedback</ThemedText>
                  <View
                    style={[
                      styles.bigDot,
                      { backgroundColor: dotColor(today.overall_color, border) },
                    ]}
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>What you did well</ThemedText>
                  <ThemedText style={{ color: placeholder }}>
                    {today.did_well ?? '—'}
                  </ThemedText>
                </View>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>What needs improvement</ThemedText>
                  <ThemedText style={{ color: placeholder }}>
                    {today.needs_improvement ?? '—'}
                  </ThemedText>
                </View>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>Tomorrow&apos;s focus</ThemedText>
                  <ThemedText style={{ color: placeholder }}>
                    {today.tomorrow_focus ?? '—'}
                  </ThemedText>
                </View>

                <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 14 }}>
                  Streak: {today.streak_days}d  ·  Tone: {capitalize(today.tone)}
                </ThemedText>
              </View>

              {/* Pill row */}
              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <View style={[styles.pill, { borderColor: border }]}>
                    <ThemedText style={{ fontSize: 12, color: textColor }}>
                      workout {today.workout_completed ? '✓' : '✗'}
                    </ThemedText>
                  </View>
                  <View style={[styles.pill, { borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <View
                      style={[
                        styles.smallDot,
                        { backgroundColor: dotColor(today.nutrition_color, border) },
                      ]}
                    />
                    <ThemedText style={{ fontSize: 12, color: textColor }}>
                      nutrition {today.nutrition_color ?? 'n/a'}
                    </ThemedText>
                  </View>
                  <View style={[styles.pill, { borderColor: border }]}>
                    <ThemedText style={{ fontSize: 12, color: textColor }}>
                      score {today.nutrition_score == null ? '—' : Math.round(today.nutrition_score)}
                    </ThemedText>
                  </View>
                  <View style={[styles.pill, { borderColor: border, backgroundColor: tint }]}>
                    <ThemedText style={{ fontSize: 12, color: onTint, fontWeight: '700' }}>
                      harshness {today.harshness_level}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={handleRegenerate}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: tint, flex: 1 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {regenerating ? (
                    <ActivityIndicator color={onTint} />
                  ) : (
                    <ThemedText style={{ color: onTint, fontWeight: '700' }}>Regenerate</ThemedText>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => router.push('/coach/history' as any)}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: border, flex: 1 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={{ color: textColor, fontWeight: '600' }}>Past 7 days</ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  bigDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  smallDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
