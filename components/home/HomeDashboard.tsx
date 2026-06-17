// HomeDashboard — shown on the Home tab when no workout is active.
// Renders three cards: Program hero, Coach focus, Nutrition bar.
// All data comes from pre-loaded root contexts — zero extra API calls.

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { DailyFeedback } from '@/types/coaching';
import type { DailyTotals, NutritionTargets } from '@/types/nutrition';
import type { WorkoutProgram } from '@/types/programming';
import type { ProgramWeekExpanded } from '@/lib/programming';

export interface HomeDashboardProps {
  program: WorkoutProgram | null;
  currentWeek: ProgramWeekExpanded | { week: null; days: never[] } | null;
  programLoading: boolean;
  coachToday: DailyFeedback | null;
  totals: DailyTotals | null;
  targets: NutritionTargets | null;
  onStartWorkout: () => void;
  onNavigateProgram: () => void;
  onNavigateCoach: () => void;
  onNavigateNutrition: () => void;
}

export function HomeDashboard({
  program,
  currentWeek,
  programLoading,
  coachToday,
  totals,
  targets,
  onStartWorkout,
  onNavigateProgram,
  onNavigateCoach,
  onNavigateNutrition,
}: HomeDashboardProps) {
  const tintColor = useThemeColor({}, 'tint');
  const onTintColor = useThemeColor({}, 'tintForeground');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const textColor = useThemeColor({}, 'text');
  const dangerColor = useThemeColor({}, 'danger');
  const successColor = useThemeColor({}, 'success');
  const warningColor = useThemeColor({}, 'warning');

  // ── Calories ──────────────────────────────────────────────────────────────
  // Use training_calories as the dashboard target (home tab is the workout hub).
  // The full Nutrition tab shows the rest-vs-training split.
  const caloriesConsumed = Math.round(totals?.calories ?? 0);
  const caloriesTarget = Math.round(targets?.training_calories ?? 0);
  const proteinTarget = Math.round(targets?.training_protein_g ?? 0);
  const calorieRatio = caloriesTarget > 0 ? Math.min(caloriesConsumed / caloriesTarget, 1) : 0;

  // ── Coach color dot ────────────────────────────────────────────────────────
  const coachColor =
    coachToday?.overall_color === 'green'
      ? successColor
      : coachToday?.overall_color === 'red'
      ? dangerColor
      : coachToday?.overall_color === 'yellow'
      ? warningColor
      : tintColor;

  // ── Exercise count across all program days ─────────────────────────────────
  const exerciseCount =
    currentWeek && 'days' in currentWeek && Array.isArray(currentWeek.days)
      ? currentWeek.days.reduce(
          (sum: number, d: { exercises?: unknown[] }) =>
            sum + (Array.isArray(d.exercises) ? d.exercises.length : 0),
          0
        )
      : 0;

  // ── Tone label ─────────────────────────────────────────────────────────────
  const toneLabel = coachToday?.tone
    ? coachToday.tone.charAt(0).toUpperCase() + coachToday.tone.slice(1)
    : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Program Hero ──────────────────────────────────────────────────── */}
      {program ? (
        <Pressable
          onPress={onStartWorkout}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: cardBackground },
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.eyebrow, { color: tintColor }]}>
                TODAY
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                {program.name}
              </ThemedText>
              <ThemedText style={[styles.cardSub, { color: placeholder }]}>
                Week {program.current_week} of {program.weeks_total}
                {exerciseCount > 0 ? ` · ${exerciseCount} exercises` : ''}
              </ThemedText>
            </View>
            <View style={[styles.startBtn, { backgroundColor: tintColor }]}>
              <ThemedText style={[styles.startBtnText, { color: onTintColor }]}>Start</ThemedText>
            </View>
          </View>
        </Pressable>
      ) : !programLoading ? (
        <Pressable
          onPress={onNavigateProgram}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: cardBackground },
            pressed && styles.cardPressed,
          ]}
        >
          <ThemedText style={[styles.eyebrow, { color: placeholder }]}>PROGRAM</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
            Build your program
          </ThemedText>
          <ThemedText style={[styles.cardSub, { color: tintColor }]}>
            Create a personalized multi-week plan →
          </ThemedText>
        </Pressable>
      ) : (
        /* programLoading — show skeleton so there's no blank space */
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={[styles.eyebrow, { color: placeholder }]}>PROGRAM</ThemedText>
          <ThemedText type="defaultSemiBold" style={[styles.cardTitle, { color: placeholder }]}>
            Loading…
          </ThemedText>
        </View>
      )}

      {/* ── Coach Focus Card ──────────────────────────────────────────────── */}
      <Pressable
        onPress={onNavigateCoach}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBackground },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.coachHeader}>
          <View style={[styles.coachDot, { backgroundColor: coachColor }]} />
          <ThemedText style={[styles.eyebrow, { color: placeholder }]}>
            COACHING FOCUS
          </ThemedText>
        </View>
        <ThemedText style={[styles.coachText, { color: textColor }]}>
          {coachToday?.tomorrow_focus ??
            'Complete a workout to unlock your daily coaching report.'}
        </ThemedText>
        {coachToday && (
          <ThemedText style={[styles.cardSub, { color: placeholder }]}>
            Streak: {coachToday.streak_days}d
            {toneLabel ? ` · ${toneLabel}` : ''}
          </ThemedText>
        )}
      </Pressable>

      {/* ── Nutrition Bar ─────────────────────────────────────────────────── */}
      {targets && (
        <Pressable
          onPress={onNavigateNutrition}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: cardBackground },
            pressed && styles.cardPressed,
          ]}
        >
          <ThemedText style={[styles.eyebrow, { color: placeholder }]}>
            NUTRITION TODAY
          </ThemedText>
          {/* Progress bar */}
          <View style={[styles.barBg, { backgroundColor: placeholder + '33' }]}>
            <View
              style={[
                styles.barFill,
                {
                  // RN percentage widths work when the parent has a defined width
                  width: `${Math.round(calorieRatio * 100)}%` as any,
                  backgroundColor: calorieRatio >= 0.9 ? successColor : tintColor,
                },
              ]}
            />
          </View>
          <ThemedText type="defaultSemiBold" style={styles.calorieLabel}>
            {caloriesConsumed.toLocaleString()} /{' '}
            {caloriesTarget.toLocaleString()} cal
          </ThemedText>
          <ThemedText style={[styles.cardSub, { color: placeholder }]}>
            Protein {Math.round(totals?.protein_g ?? 0)}g /{' '}
            {proteinTarget}g
          </ThemedText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardPressed: { opacity: 0.82 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  cardTitle: { fontSize: 18, marginBottom: 4 },
  cardSub: { fontSize: 13, marginTop: 2 },
  startBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  startBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  coachDot: { width: 8, height: 8, borderRadius: 4 },
  coachText: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  barBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  calorieLabel: { fontSize: 16, marginTop: 6, marginBottom: 2 },
});
