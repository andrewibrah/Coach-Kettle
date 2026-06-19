import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import { useNutrition } from '@/contexts/NutritionContext';
import type { DayGoal } from '@/types/nutrition';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function macrosFromCalories(cal: number): { protein_g: number; carbs_g: number; fat_g: number } {
  return {
    protein_g: Math.round((cal * 0.30) / 4),
    carbs_g:   Math.round((cal * 0.40) / 4),
    fat_g:     Math.round((cal * 0.30) / 9),
  };
}

export default function NutritionTargetsScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const textColor = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const inputBg = useThemeColor({}, 'inputBackground');

  const { targets, refresh, weeklyGoals, saveWeeklyGoals, saveLocalTargets } = useNutrition();
  const { toast, showToast, hideToast } = useToast();

  // Manual targets form state
  const [editMode, setEditMode] = useState(false);
  const [trainCal, setTrainCal] = useState('');
  const [trainProt, setTrainProt] = useState('');
  const [trainCarb, setTrainCarb] = useState('');
  const [trainFat, setTrainFat] = useState('');
  const [restCal, setRestCal] = useState('');
  const [restProt, setRestProt] = useState('');
  const [restCarb, setRestCarb] = useState('');
  const [restFat, setRestFat] = useState('');
  const [saving, setSaving] = useState(false);

  // Weekly goals editor state
  type DayDraft = { calories: string; protein: string; carbs: string; fat: string; showMacros: boolean };
  const emptyDay = (): DayDraft => ({ calories: '', protein: '', carbs: '', fat: '', showMacros: false });
  const [weekDraft, setWeekDraft] = useState<DayDraft[]>(() => Array.from({ length: 7 }, emptyDay));
  const [weekSaving, setWeekSaving] = useState(false);

  // Show form immediately if no targets exist
  useEffect(() => {
    if (!targets) setEditMode(true);
  }, [targets]);

  // Populate draft from saved goals on mount
  useEffect(() => {
    setWeekDraft(Array.from({ length: 7 }, (_, i) => {
      const g = weeklyGoals[i];
      if (!g) return emptyDay();
      return {
        calories: String(g.calories),
        protein: String(g.protein_g),
        carbs: String(g.carbs_g),
        fat: String(g.fat_g),
        showMacros: true,
      };
    }));
  }, [weeklyGoals]);

  const updateDay = (dow: number, field: keyof DayDraft, val: string | boolean) => {
    setWeekDraft((prev) => {
      const next = [...prev];
      next[dow] = { ...next[dow], [field]: val };
      return next;
    });
  };

  const autoFillMacros = (dow: number) => {
    const cal = parseFloat(weekDraft[dow].calories);
    if (!cal) return;
    const m = macrosFromCalories(cal);
    setWeekDraft((prev) => {
      const next = [...prev];
      next[dow] = { ...next[dow], protein: String(m.protein_g), carbs: String(m.carbs_g), fat: String(m.fat_g), showMacros: true };
      return next;
    });
  };

  const handleSaveWeeklyGoals = async () => {
    setWeekSaving(true);
    try {
      const goals: Record<number, DayGoal> = {};
      weekDraft.forEach((d, i) => {
        const cal = parseFloat(d.calories);
        if (!cal) return;
        const m = macrosFromCalories(cal);
        goals[i] = {
          calories: cal,
          protein_g: parseFloat(d.protein) || m.protein_g,
          carbs_g:   parseFloat(d.carbs)   || m.carbs_g,
          fat_g:     parseFloat(d.fat)      || m.fat_g,
        };
      });
      await saveWeeklyGoals(goals);
      showToast('Weekly goals saved', 'success');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setWeekSaving(false);
    }
  };

  const handleOpenEdit = () => {
    if (!targets) return;
    setTrainCal(String(Math.round(targets.training_calories)));
    setTrainProt(String(Math.round(targets.training_protein_g)));
    setTrainCarb(String(Math.round(targets.training_carbs_g)));
    setTrainFat(String(Math.round(targets.training_fat_g)));
    setRestCal(String(Math.round(targets.rest_calories)));
    setRestProt(String(Math.round(targets.rest_protein_g)));
    setRestCarb(String(Math.round(targets.rest_carbs_g)));
    setRestFat(String(Math.round(targets.rest_fat_g)));
    setEditMode(true);
  };

  const autoFillTraining = () => {
    const cal = parseFloat(trainCal);
    if (!cal) return;
    const m = macrosFromCalories(cal);
    setTrainProt(String(m.protein_g));
    setTrainCarb(String(m.carbs_g));
    setTrainFat(String(m.fat_g));
  };

  const autoFillRest = () => {
    const cal = parseFloat(restCal);
    if (!cal) return;
    const m = macrosFromCalories(cal);
    setRestProt(String(m.protein_g));
    setRestCarb(String(m.carbs_g));
    setRestFat(String(m.fat_g));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveLocalTargets({
        training_calories: parseInt(trainCal, 10) || 0,
        training_protein_g: parseInt(trainProt, 10) || 0,
        training_carbs_g: parseInt(trainCarb, 10) || 0,
        training_fat_g: parseInt(trainFat, 10) || 0,
        rest_calories: parseInt(restCal, 10) || 0,
        rest_protein_g: parseInt(restProt, 10) || 0,
        rest_carbs_g: parseInt(restCarb, 10) || 0,
        rest_fat_g: parseInt(restFat, 10) || 0,
      });
      await refresh();
      setEditMode(false);
      showToast('Targets saved', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (label: string, value: number | null | undefined, suffix: string) => (
    <View style={styles.row}>
      <ThemedText style={{ color: placeholder, fontSize: 13 }}>{label}</ThemedText>
      <ThemedText style={{ fontWeight: '600' }}>
        {value == null ? '—' : `${Math.round(value)}${suffix}`}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Nutrition Targets" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>

        {/* ── Weekly calorie goals ── */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 4 }}>Weekly calorie goals</ThemedText>
          <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 12 }}>
            Set a daily calorie target for each day. Macros auto-fill at 30/40/30 (P/C/F) or enter manually.
          </ThemedText>
          {DAY_LABELS.map((label, dow) => {
            const d = weekDraft[dow];
            return (
              <View key={dow} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ThemedText style={{ fontWeight: '700', width: 36 }}>{label}</ThemedText>
                  <TextInput
                    value={d.calories}
                    onChangeText={(v) => updateDay(dow, 'calories', v)}
                    placeholder="Calories"
                    placeholderTextColor={placeholder}
                    keyboardType="decimal-pad"
                    style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]}
                  />
                  <Pressable
                    onPress={() => autoFillMacros(dow)}
                    style={({ pressed }) => [styles.smallBtn, { borderColor: tint }, pressed && { opacity: 0.7 }]}
                  >
                    <ThemedText style={{ fontSize: 11, color: tint, fontWeight: '700' }}>Auto</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => updateDay(dow, 'showMacros', !d.showMacros)}
                    style={({ pressed }) => [styles.smallBtn, { borderColor: border }, pressed && { opacity: 0.7 }]}
                  >
                    <ThemedText style={{ fontSize: 11, color: textColor, fontWeight: '700' }}>
                      {d.showMacros ? 'Hide' : 'Macros'}
                    </ThemedText>
                  </Pressable>
                </View>
                {d.showMacros && (
                  <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 44 }}>
                    <TextInput value={d.protein} onChangeText={(v) => updateDay(dow, 'protein', v)} placeholder="P g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, styles.macroInput, { backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                    <TextInput value={d.carbs}   onChangeText={(v) => updateDay(dow, 'carbs', v)}   placeholder="C g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, styles.macroInput, { backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                    <TextInput value={d.fat}     onChangeText={(v) => updateDay(dow, 'fat', v)}     placeholder="F g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, styles.macroInput, { backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                  </View>
                )}
              </View>
            );
          })}
          <Pressable
            onPress={handleSaveWeeklyGoals}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, marginTop: 4 }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Save weekly goals"
          >
            {weekSaving ? <ActivityIndicator color={onTint} /> : <ThemedText style={{ color: onTint, fontWeight: '700' }}>Save weekly goals</ThemedText>}
          </Pressable>
        </View>

        {/* ── Daily targets (training / rest day defaults) ── */}
        {!editMode && targets ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={[styles.card, styles.halfCard, { backgroundColor: cardBackground, marginBottom: 0 }]}>
                <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Training day</ThemedText>
                {renderRow('Calories', targets.training_calories, ' cal')}
                {renderRow('Protein', targets.training_protein_g, 'g')}
                {renderRow('Carbs', targets.training_carbs_g, 'g')}
                {renderRow('Fat', targets.training_fat_g, 'g')}
              </View>
              <View style={[styles.card, styles.halfCard, { backgroundColor: cardBackground, marginBottom: 0 }]}>
                <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Rest day</ThemedText>
                {renderRow('Calories', targets.rest_calories, ' cal')}
                {renderRow('Protein', targets.rest_protein_g, 'g')}
                {renderRow('Carbs', targets.rest_carbs_g, 'g')}
                {renderRow('Fat', targets.rest_fat_g, 'g')}
              </View>
            </View>
            <Pressable
              onPress={handleOpenEdit}
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: border, marginBottom: 12 }, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Edit daily targets"
            >
              <ThemedText style={{ fontWeight: '600' }}>Edit daily targets</ThemedText>
            </Pressable>
          </>
        ) : (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 4 }}>
              {targets ? 'Edit daily targets' : 'Set your daily targets'}
            </ThemedText>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 14 }}>
              Enter your calorie and macro goals. Use &quot;Auto&quot; to calculate macros from calories (30/40/30 P/C/F).
            </ThemedText>

            <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Training day</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={trainCal}
                onChangeText={setTrainCal}
                placeholder="Calories"
                placeholderTextColor={placeholder}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]}
              />
              <Pressable
                onPress={autoFillTraining}
                style={({ pressed }) => [styles.smallBtn, { borderColor: tint }, pressed && { opacity: 0.7 }]}
              >
                <ThemedText style={{ fontSize: 11, color: tint, fontWeight: '700' }}>Auto</ThemedText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput value={trainProt} onChangeText={setTrainProt} placeholder="Protein g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
              <TextInput value={trainCarb} onChangeText={setTrainCarb} placeholder="Carbs g"   placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
              <TextInput value={trainFat}  onChangeText={setTrainFat}  placeholder="Fat g"     placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
            </View>

            <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Rest day</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={restCal}
                onChangeText={setRestCal}
                placeholder="Calories"
                placeholderTextColor={placeholder}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]}
              />
              <Pressable
                onPress={autoFillRest}
                style={({ pressed }) => [styles.smallBtn, { borderColor: tint }, pressed && { opacity: 0.7 }]}
              >
                <ThemedText style={{ fontSize: 11, color: tint, fontWeight: '700' }}>Auto</ThemedText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput value={restProt} onChangeText={setRestProt} placeholder="Protein g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
              <TextInput value={restCarb} onChangeText={setRestCarb} placeholder="Carbs g"   placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
              <TextInput value={restFat}  onChangeText={setRestFat}  placeholder="Fat g"     placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, flex: 1 }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Save nutrition targets"
              >
                {saving ? <ActivityIndicator color={onTint} /> : <ThemedText style={{ color: onTint, fontWeight: '700' }}>Save targets</ThemedText>}
              </Pressable>
              {targets && (
                <Pressable
                  onPress={() => setEditMode(false)}
                  style={({ pressed }) => [styles.primaryBtn, { borderWidth: 1, borderColor: border, flex: 1 }, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <ThemedText style={{ fontWeight: '600' }}>Cancel</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  halfCard: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  macroInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 7,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
