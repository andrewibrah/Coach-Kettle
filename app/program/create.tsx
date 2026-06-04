import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/theme';
import { useProgram } from '@/contexts/ProgramContext';
import type { GoalType, SplitType, Periodization } from '@/types/programming';

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
];

const PERIODIZATIONS: { value: Periodization; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'undulating', label: 'Undulating' },
  { value: 'none', label: 'None' },
];

export default function CreateProgramScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = Colors[scheme === 'dark' ? 'dark' : 'light'].tint;
  const onTint = Colors[scheme === 'dark' ? 'dark' : 'light'].tintForeground;

  const { create } = useProgram();

  const [goal, setGoal] = useState<GoalType>('muscle_building');
  const [split, setSplit] = useState<SplitType>('ppl_3day');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
  const [weeksTotal, setWeeksTotal] = useState<number>(8);
  const [periodization, setPeriodization] = useState<Periodization>('linear');
  const [submitting, setSubmitting] = useState(false);

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
      router.replace('/program');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create program');
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
      >
        <ThemedText style={[styles.stepBtnText, { color: textColor }]}>+</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
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
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { marginTop: 10, fontSize: 12 },
});
