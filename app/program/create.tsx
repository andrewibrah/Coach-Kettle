import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { useProgram } from '@/contexts/ProgramContext';
import { useProfile } from '@/contexts/ProfileContext';
import { suggestTrainingDays, resolveTrainingDaysUpdate } from '@/lib/trainingSchedule';
import type { GoalType, SplitType, Periodization } from '@/types/programming';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // 0=Sun..6=Sat

const GOALS: { value: GoalType; label: string }[] = [
  { value: 'muscle_building', label: 'Muscle Building' },
  { value: 'leaning_out', label: 'Leaning Out' },
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'strength', label: 'Strength' },
  { value: 'endurance', label: 'Endurance' },
];

const SPLITS: { value: SplitType; label: string }[] = [
  { value: 'ppl_3day', label: 'PPL 3-day' },
  { value: 'pp_sh_l_5day', label: 'PPSh-L 5-day' },
  { value: 'pp_sh_l_6day', label: 'PPSh-L 6-day' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'upper_lower', label: 'Upper / Lower' },
];

const PERIODIZATIONS: { value: Periodization; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'undulating', label: 'Undulating' },
  { value: 'none', label: 'None' },
];

export default function CreateProgramScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { create } = useProgram();
  const { profile, updateProfile } = useProfile();
  const { toast, showToast, hideToast } = useToast();

  const [goal, setGoal] = useState<GoalType>('muscle_building');
  const [split, setSplit] = useState<SplitType>('ppl_3day');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
  const [weeksTotal, setWeeksTotal] = useState<number>(8);
  const [periodization, setPeriodization] = useState<Periodization>('linear');
  const [submitting, setSubmitting] = useState(false);

  // Suggested training weekdays for the chosen split + day count (#6).
  // scheduleTouched latches once the user edits the selector by hand (or
  // once we've seeded an existing explicit schedule from their profile
  // below), so re-picking a split/day-count afterward never clobbers it.
  const [trainingDays, setTrainingDays] = useState<number[]>(() => suggestTrainingDays('ppl_3day', 3) ?? []);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [scheduleSeeded, setScheduleSeeded] = useState(false);

  // Seed from an existing explicit schedule (Settings -> Profile) once the
  // profile loads, and lock it — otherwise merely picking a different split
  // on this screen (the screen's primary action) would silently swap it for
  // that split's suggestion before the user ever touches the weekday row,
  // and submit would overwrite their real preference.
  useEffect(() => {
    if (scheduleSeeded) return;
    if (!profile) return; // wait for profile to load
    if (profile.training_days && profile.training_days.length > 0) {
      setTrainingDays(profile.training_days);
      setScheduleTouched(true);
    }
    setScheduleSeeded(true);
  }, [profile, scheduleSeeded]);

  useEffect(() => {
    if (scheduleTouched) return;
    setTrainingDays(suggestTrainingDays(split, daysPerWeek) ?? []);
  }, [split, daysPerWeek, scheduleTouched]);

  const suggestion = suggestTrainingDays(split, daysPerWeek);
  const isCustomSchedule =
    suggestion === null ||
    trainingDays.length !== suggestion.length ||
    !trainingDays.every((d) => suggestion.includes(d));

  const toggleTrainingDay = (dow: number) => {
    setScheduleTouched(true);
    setTrainingDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await create({
        goal_type: goal,
        split_type: split,
        days_per_week: daysPerWeek,
        weeks_total: weeksTotal,
        periodization,
      });
      // Only write training_days if it actually changed from the profile's
      // current value (#6 regression fix) — see resolveTrainingDaysUpdate.
      const trainingDaysUpdate = resolveTrainingDaysUpdate(trainingDays, profile?.training_days);
      if (trainingDaysUpdate !== 'no-change') {
        // Best-effort — a failure here shouldn't block program creation,
        // which already succeeded.
        updateProfile({ training_days: trainingDaysUpdate }).catch(() => undefined);
      }
      router.replace('/program');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create program', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const Pill = ({
    selected,
    label,
    onPress,
  }: {
    selected: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? tint : 'transparent',
          borderColor: selected ? tint : border,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <ThemedText
        style={[styles.pillText, { color: selected ? onTint : textColor }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const Stepper = ({
    value,
    min,
    max,
    onChange,
  }: {
    value: number;
    min: number;
    max: number;
    onChange: (n: number) => void;
  }) => (
    <View style={styles.stepperRow}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [
          styles.stepBtn,
          { borderColor: border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Decrease, currently ${value}`}
      >
        <ThemedText style={[styles.stepBtnText, { color: textColor }]}>−</ThemedText>
      </Pressable>
      <ThemedText style={[styles.stepValue, { color: textColor }]}>{value}</ThemedText>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [
          styles.stepBtn,
          { borderColor: border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Increase, currently ${value}`}
      >
        <ThemedText style={[styles.stepBtnText, { color: textColor }]}>+</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Create Program" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Goal</ThemedText>
          <View style={styles.pillRow}>
            {GOALS.map((g) => (
              <Pill
                key={g.value}
                selected={goal === g.value}
                label={g.label}
                onPress={() => setGoal(g.value)}
              />
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Split</ThemedText>
          <View style={styles.pillRow}>
            {SPLITS.map((s) => (
              <Pill
                key={s.value}
                selected={split === s.value}
                label={s.label}
                onPress={() => setSplit(s.value)}
              />
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Days per week</ThemedText>
          <Stepper value={daysPerWeek} min={1} max={7} onChange={setDaysPerWeek} />
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Training days</ThemedText>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, dow) => (
              <Pressable
                key={dow}
                onPress={() => toggleTrainingDay(dow)}
                style={({ pressed }) => [
                  styles.weekdayPill,
                  {
                    backgroundColor: trainingDays.includes(dow) ? tint : 'transparent',
                    borderColor: trainingDays.includes(dow) ? tint : border,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="checkbox"
                accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}
                accessibilityState={{ checked: trainingDays.includes(dow) }}
              >
                <ThemedText style={[styles.weekdayPillText, { color: trainingDays.includes(dow) ? onTint : textColor }]}>
                  {label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText style={[styles.hint, { color: placeholder }]}>
            {isCustomSchedule ? 'Custom schedule' : 'Suggested for this split — tap a day to change it.'}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Weeks total</ThemedText>
          <Stepper value={weeksTotal} min={1} max={16} onChange={setWeeksTotal} />
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.label}>Periodization</ThemedText>
          <View style={styles.pillRow}>
            {PERIODIZATIONS.map((p) => (
              <Pill
                key={p.value}
                selected={periodization === p.value}
                label={p.label}
                onPress={() => setPeriodization(p.value)}
              />
            ))}
          </View>
          <ThemedText style={[styles.hint, { color: placeholder }]}>
            Linear ramps intensity each week. Undulating varies daily.
          </ThemedText>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: tint },
            (pressed || submitting) && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Generate program"
        >
          <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>
            {submitting ? 'Generating…' : 'Generate Program'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row', gap: 8 },
  weekdayPill: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayPillText: { fontSize: 13, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: 18, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  primaryBtnText: { fontWeight: '700', fontSize: 16 },
  hint: { marginTop: 10, fontSize: 12 },
});
