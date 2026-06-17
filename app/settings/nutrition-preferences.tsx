// Nutrition preferences — sex, activity level, goal type, dietary preferences,
// allergies, dislikes, cuisines, training days/week, calorie override.
// Writes to the profile table via updateProfile (extended fields land in
// migration 0031). Re-derives nutrition targets when key inputs change.

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '@/contexts/ProfileContext';
import { deriveNutritionTargets } from '@/lib/nutrition';
import { seedDefaultTemplates, type DefaultTemplateGoal } from '@/lib/programming';

const SEXES: { v: 'male' | 'female' | 'other'; label: string }[] = [
  { v: 'male', label: 'Male' },
  { v: 'female', label: 'Female' },
  { v: 'other', label: 'Other' },
];

const ACTIVITY: { v: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete'; label: string; sub: string }[] = [
  { v: 'sedentary', label: 'Sedentary', sub: 'Desk job, little exercise' },
  { v: 'light', label: 'Light', sub: 'Walking, light cardio 1–3×/wk' },
  { v: 'moderate', label: 'Moderate', sub: 'Training 3–5×/wk' },
  { v: 'very_active', label: 'Very active', sub: 'Hard training 6×/wk' },
  { v: 'athlete', label: 'Athlete', sub: '2-a-days or pro-level volume' },
];

const GOALS: { v: 'muscle_building' | 'leaning_out' | 'weight_loss' | 'maintenance' | 'strength' | 'endurance'; label: string }[] = [
  { v: 'muscle_building', label: 'Muscle building' },
  { v: 'leaning_out', label: 'Leaning out' },
  { v: 'weight_loss', label: 'Weight loss' },
  { v: 'maintenance', label: 'Maintenance' },
  { v: 'strength', label: 'Strength' },
  { v: 'endurance', label: 'Endurance' },
];

const PREFS = ['vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'dairy_free', 'low_carb', 'keto'];
const ALLERGIES = ['peanut', 'tree_nut', 'shellfish', 'egg', 'soy', 'gluten', 'dairy'];
const CUISINES = ['mediterranean', 'asian', 'mexican', 'italian', 'american', 'indian'];

export default function NutritionPreferencesScreen() {
  const { profile, updateProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const bg = useThemeColor({}, 'background');
  const cardBg = useThemeColor({}, 'cardBackground');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const subtle = useThemeColor({}, 'placeholder');

  const { toast, showToast, hideToast } = useToast();

  const [sex, setSex] = useState(profile?.sex ?? 'male');
  const [activity, setActivity] = useState(profile?.activity_level ?? 'moderate');
  const [goal, setGoal] = useState(profile?.goal_type ?? 'muscle_building');
  const [trainingDays, setTrainingDays] = useState(profile?.training_days_per_week?.toString() ?? '4');
  const [calOverride, setCalOverride] = useState(profile?.calorie_target_override?.toString() ?? '');
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>(profile?.dietary_preferences ?? []);
  const [allergies, setAllergies] = useState<string[]>(profile?.dietary_allergies ?? []);
  const [cuisines, setCuisines] = useState<string[]>(profile?.preferred_cuisines ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setSex((profile.sex ?? 'male') as typeof sex);
    setActivity((profile.activity_level ?? 'moderate') as typeof activity);
    setGoal((profile.goal_type ?? 'muscle_building') as typeof goal);
    setTrainingDays(profile.training_days_per_week?.toString() ?? '4');
    setCalOverride(profile.calorie_target_override?.toString() ?? '');
    setDietaryPrefs(profile.dietary_preferences ?? []);
    setAllergies(profile.dietary_allergies ?? []);
    setCuisines(profile.preferred_cuisines ?? []);
  }, [profile]);

  const toggleIn = (list: string[], setter: (v: string[]) => void, val: string) => {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const trainingDaysNum = parseInt(trainingDays, 10);
      const calNum = calOverride.trim() ? parseInt(calOverride.trim(), 10) : null;
      const ok = await updateProfile({
        sex,
        activity_level: activity,
        goal_type: goal,
        training_days_per_week: Number.isFinite(trainingDaysNum) ? Math.min(7, Math.max(1, trainingDaysNum)) : null,
        calorie_target_override: calNum && Number.isFinite(calNum) ? calNum : null,
        dietary_preferences: dietaryPrefs,
        dietary_allergies: allergies,
        preferred_cuisines: cuisines,
      } as never);
      if (!ok) throw new Error('save failed');
      // Re-derive targets (best-effort, ignore failure)
      await deriveNutritionTargets().catch(() => undefined);
      showToast('Preferences saved', 'success');
    } catch (e) {
      showToast((e as Error).message || 'Save failed. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const seedTemplates = async () => {
    const tgoal: DefaultTemplateGoal =
      goal === 'muscle_building' ? 'muscle_building'
      : goal === 'leaning_out' ? 'leaning_out'
      : 'weight_loss';
    try {
      const r = await seedDefaultTemplates(tgoal);
      const n = r.templates?.length ?? 0;
      showToast(n > 0 ? `Added ${n} starter templates` : 'You already have templates', n > 0 ? 'success' : 'info');
    } catch (e) {
      showToast((e as Error).message || 'Could not seed templates', 'error');
    }
  };

  const pill = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: active ? tint : cardBg, opacity: pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <ThemedText style={{ color: active ? onTint : undefined, fontWeight: '600' }}>{label}</ThemedText>
    </Pressable>
  );

  const renderToggleGroup = (title: string, list: string[], values: string[], setter: (v: string[]) => void) => (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <View style={styles.pillRow}>
        {list.map((v) => pill(v.replace(/_/g, ' '), values.includes(v), () => toggleIn(values, setter, v)))}
      </View>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: bg }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Nutrition preferences" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Sex</ThemedText>
          <View style={styles.pillRow}>
            {SEXES.map((s) => pill(s.label, sex === s.v, () => setSex(s.v)))}
          </View>
          <ThemedText style={{ color: subtle, marginTop: 4, fontSize: 12 }}>Used for BMR/TDEE calculations.</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Activity level</ThemedText>
          {ACTIVITY.map((a) => (
            <Pressable
              key={a.v}
              onPress={() => setActivity(a.v)}
              style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.7 }, activity === a.v && { borderColor: tint }]}
              accessibilityRole="radio"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: activity === a.v }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{a.label}</ThemedText>
                <ThemedText style={{ color: subtle, fontSize: 12 }}>{a.sub}</ThemedText>
              </View>
              {activity === a.v && <ThemedText style={{ color: tint, fontWeight: '700' }}>✓</ThemedText>}
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Goal</ThemedText>
          <View style={styles.pillRow}>
            {GOALS.map((g) => pill(g.label, goal === g.v, () => setGoal(g.v)))}
          </View>
          <Pressable onPress={seedTemplates} style={({ pressed }) => [styles.btnGhost, { borderColor: tint }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Seed default meal plan templates">
            <ThemedText style={{ color: tint, fontWeight: '700' }}>Seed default templates for this goal</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Training days per week</ThemedText>
          <TextInput
            value={trainingDays}
            onChangeText={setTrainingDays}
            keyboardType="number-pad"
            style={styles.input}
            maxLength={1}
          />
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Calorie override (optional)</ThemedText>
          <ThemedText style={{ color: subtle, fontSize: 12, marginBottom: 6 }}>
            Leave blank to let Coach Kettle derive your target from BMR/TDEE.
          </ThemedText>
          <TextInput
            value={calOverride}
            onChangeText={setCalOverride}
            keyboardType="number-pad"
            placeholder="e.g. 2400"
            style={styles.input}
          />
        </View>

        {renderToggleGroup('Dietary preferences', PREFS, dietaryPrefs, setDietaryPrefs)}
        {renderToggleGroup('Allergies', ALLERGIES, allergies, setAllergies)}
        {renderToggleGroup('Preferred cuisines', CUISINES, cuisines, setCuisines)}

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, { backgroundColor: tint }, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={saving ? 'Saving preferences...' : 'Save preferences'}
          accessibilityState={{ disabled: saving }}
        >
          <ThemedText style={{ color: onTint, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save preferences'}</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  card: { padding: 16, borderRadius: 14, marginBottom: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginVertical: 2 },
  input: { borderWidth: 1, borderColor: 'rgba(127,127,127,0.3)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 6 },
  btnGhost: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  saveBtn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
});
