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
import { macrosFromCalories } from '@/lib/nutritionTargets';
import { buildManualSaveRequest } from '@/lib/nutritionTargetStorage';
import type { DayGoal } from '@/types/nutrition';
import type {
  NutritionMacroTarget,
  NutritionTargetSuggestRequest,
  NutritionAgeRange,
  NutritionSex,
  NutritionActivityLevel,
  NutritionGoalType,
} from '@/types/nutritionTargets';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayDraft = { calories: string; protein: string; carbs: string; fat: string; showMacros: boolean };

function emptyDay(): DayDraft {
  return { calories: '', protein: '', carbs: '', fat: '', showMacros: false };
}

const AGE_RANGES: { v: NutritionAgeRange; label: string }[] = [
  { v: 'under_18', label: '<18' }, { v: '18_24', label: '18–24' }, { v: '25_34', label: '25–34' },
  { v: '35_44', label: '35–44' }, { v: '45_54', label: '45–54' }, { v: '55_64', label: '55–64' },
  { v: '65_plus', label: '65+' },
];
const SEXES: { v: NutritionSex; label: string }[] = [
  { v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }, { v: 'other', label: 'Other' }, { v: 'prefer_not_to_say', label: 'Prefer not to say' },
];
const ACTIVITIES: { v: NutritionActivityLevel; label: string }[] = [
  { v: 'sedentary', label: 'Sedentary' }, { v: 'light', label: 'Light' }, { v: 'moderate', label: 'Moderate' },
  { v: 'active', label: 'Active' }, { v: 'very_active', label: 'Very active' },
];
const GOALS: { v: NutritionGoalType; label: string }[] = [
  { v: 'fat_loss', label: 'Fat loss' }, { v: 'maintenance', label: 'Maintenance' }, { v: 'muscle_gain', label: 'Muscle gain' },
  { v: 'performance', label: 'Performance' }, { v: 'general_health', label: 'General health' },
];

function macro(cal: string, prot: string, carb: string, fat: string): NutritionMacroTarget | undefined {
  const c = parseInt(cal, 10);
  if (!Number.isFinite(c) || c <= 0) return undefined;
  return {
    calories: c,
    protein_g: parseInt(prot, 10) || undefined,
    carbs_g: parseInt(carb, 10) || undefined,
    fat_g: parseInt(fat, 10) || undefined,
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
  const warning = useThemeColor({}, 'warning');

  const {
    targets, weeklyGoals, saveWeeklyGoals,
    saveTargets, savedTargets, syncStatus, savedTargetsStatus, todayTarget,
    suggestedTargets, suggestionStatus, requestSuggestion, clearSuggestion,
    legacyImport, importLegacyTargets, dismissLegacyImport,
  } = useNutrition();
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
  const [fromSuggestionId, setFromSuggestionId] = useState<string | undefined>(undefined);

  // Suggestion form state
  const [showSuggest, setShowSuggest] = useState(false);
  const [ageRange, setAgeRange] = useState<NutritionAgeRange | undefined>(undefined);
  const [sex, setSex] = useState<NutritionSex | undefined>(undefined);
  const [activity, setActivity] = useState<NutritionActivityLevel>('moderate');
  const [goal, setGoal] = useState<NutritionGoalType>('maintenance');
  const [suggestDays, setSuggestDays] = useState('4');
  const [suggestCals, setSuggestCals] = useState('');

  // Weekly goals editor state
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
    setFromSuggestionId(undefined);
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
    const training = macro(trainCal, trainProt, trainCarb, trainFat);
    const rest = macro(restCal, restProt, restCarb, restFat);
    const req = buildManualSaveRequest(training, rest, {
      suggestionId: fromSuggestionId,
      editedAfterSuggestion: Boolean(fromSuggestionId),
    });
    if (!req) { showToast('Enter at least a training- or rest-day calorie target.', 'error'); return; }
    setSaving(true);
    try {
      await saveTargets(req);
      setEditMode(false);
      setFromSuggestionId(undefined);
      showToast('Saved to your account', 'success');
    } catch {
      // saveTargets queues the payload for retry on failure, so the save isn't
      // lost — tell the user that rather than surfacing the raw network error.
      showToast('Saved on device — will sync when online.', 'info');
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Suggestion ----------
  const handleSuggest = async () => {
    const req: NutritionTargetSuggestRequest = {
      age_range: ageRange,
      sex,
      activity_level: activity,
      goal_type: goal,
      training_days_per_week: parseInt(suggestDays, 10) || undefined,
      user_entered_calorie_target: parseInt(suggestCals, 10) || undefined,
    };
    try {
      await requestSuggestion(req);
    } catch {
      showToast('Could not get a suggestion. Try again.', 'error');
    }
  };

  const useSuggestion = () => {
    if (!suggestedTargets) return;
    const t = suggestedTargets.targets.training_day ?? suggestedTargets.targets.base;
    const r = suggestedTargets.targets.rest_day ?? suggestedTargets.targets.base;
    if (t) {
      setTrainCal(String(t.calories));
      setTrainProt(t.protein_g != null ? String(t.protein_g) : '');
      setTrainCarb(t.carbs_g != null ? String(t.carbs_g) : '');
      setTrainFat(t.fat_g != null ? String(t.fat_g) : '');
    }
    if (r) {
      setRestCal(String(r.calories));
      setRestProt(r.protein_g != null ? String(r.protein_g) : '');
      setRestCarb(r.carbs_g != null ? String(r.carbs_g) : '');
      setRestFat(r.fat_g != null ? String(r.fat_g) : '');
    }
    setFromSuggestionId(suggestedTargets.suggestion_id);
    setShowSuggest(false);
    setEditMode(true);
  };

  // ---------- Provenance label ----------
  const sourceLabel = (): string => {
    if (syncStatus === 'pending') return 'Saved on this device — will sync when you’re back online.';
    if (savedTargets) {
      const base =
        savedTargets.source === 'manual' ? 'Custom target — you entered this.'
        : savedTargets.source === 'backend_suggested' ? 'Suggested target — based on optional inputs you provided.'
        : savedTargets.source === 'imported_existing' ? 'Imported target — saved from this device.'
        : 'Draft target.';
      const stale = todayTarget.stale ? ' This target may be stale.' : '';
      return `${base} Saved to your account.${stale}`;
    }
    if (savedTargetsStatus === 'error' && targets) return 'Using offline cache.';
    if (targets) return 'Custom target — set on this device.';
    return 'Draft only — not saved yet.';
  };

  const pill = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: active ? tint : cardBackground, borderColor: border, borderWidth: 1 }, pressed && { opacity: 0.7 }]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <ThemedText style={{ color: active ? onTint : textColor, fontWeight: '600', fontSize: 13 }}>{label}</ThemedText>
    </Pressable>
  );

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

        {/* ── Migration prompt: detected ant2 local targets ── */}
        {legacyImport && (
          <View style={[styles.card, { backgroundColor: cardBackground, borderColor: warning, borderWidth: 1 }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 4 }}>Targets found on this device</ThemedText>
            <ThemedText style={{ fontSize: 13, color: placeholder, marginBottom: 12 }}>
              We found nutrition targets saved on this device. Save them to your account so they sync across devices?
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable
                onPress={async () => { try { await importLegacyTargets(); showToast('Saved to your account', 'success'); } catch { showToast('Could not save. Try again.', 'error'); } }}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, flexGrow: 1 }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel="Save targets to account"
              >
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Save to account</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => dismissLegacyImport()}
                style={({ pressed }) => [styles.secondaryBtn, { borderColor: border, flexGrow: 1 }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel="Keep only on this device"
              >
                <ThemedText style={{ fontWeight: '600' }}>Keep on device</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Source / provenance ── */}
        {targets && !editMode && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ fontSize: 13, color: placeholder }}>{sourceLabel()}</ThemedText>
          </View>
        )}

        {/* ── Suggest for me ── */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <Pressable onPress={() => setShowSuggest((s) => !s)} accessibilityRole="button" accessibilityLabel="Toggle suggest targets">
            <ThemedText type="subtitle">{showSuggest ? 'Suggest for me ▲' : 'Suggest for me ▾'}</ThemedText>
          </Pressable>
          {showSuggest && (
            <View style={{ marginTop: 10 }}>
              <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 8 }}>
                Optional inputs only — no date of birth, weight, or height required.
              </ThemedText>

              <ThemedText style={styles.fieldLabel}>Age range (optional)</ThemedText>
              <View style={styles.pillRow}>{AGE_RANGES.map((a) => pill(a.label, ageRange === a.v, () => setAgeRange(ageRange === a.v ? undefined : a.v)))}</View>

              <ThemedText style={styles.fieldLabel}>Sex (optional)</ThemedText>
              <View style={styles.pillRow}>{SEXES.map((s) => pill(s.label, sex === s.v, () => setSex(sex === s.v ? undefined : s.v)))}</View>

              <ThemedText style={styles.fieldLabel}>Activity level</ThemedText>
              <View style={styles.pillRow}>{ACTIVITIES.map((a) => pill(a.label, activity === a.v, () => setActivity(a.v)))}</View>

              <ThemedText style={styles.fieldLabel}>Goal</ThemedText>
              <View style={styles.pillRow}>{GOALS.map((g) => pill(g.label, goal === g.v, () => setGoal(g.v)))}</View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>Training days/wk</ThemedText>
                  <TextInput value={suggestDays} onChangeText={setSuggestDays} keyboardType="number-pad" maxLength={1} style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>I know my calories</ThemedText>
                  <TextInput value={suggestCals} onChangeText={setSuggestCals} keyboardType="number-pad" placeholder="optional" placeholderTextColor={placeholder} style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
              </View>

              <Pressable
                onPress={handleSuggest}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, marginTop: 12 }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel="Get suggestion"
              >
                {suggestionStatus === 'loading' ? <ActivityIndicator color={onTint} /> : <ThemedText style={{ color: onTint, fontWeight: '700' }}>Get suggestion</ThemedText>}
              </Pressable>

              {suggestedTargets && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: border }}>
                  <ThemedText style={{ fontWeight: '700' }}>{suggestedTargets.explanation.summary}</ThemedText>
                  <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 4 }}>
                    Confidence: {suggestedTargets.confidence} · {suggestedTargets.explanation.calculation_basis}
                  </ThemedText>
                  {suggestedTargets.explanation.assumptions.length > 0 && (
                    <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 4 }}>
                      Assumptions: {suggestedTargets.explanation.assumptions.join(' ')}
                    </ThemedText>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable onPress={useSuggestion} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, flex: 1 }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Use and edit suggestion">
                      <ThemedText style={{ color: onTint, fontWeight: '700' }}>Use &amp; edit</ThemedText>
                    </Pressable>
                    <Pressable onPress={clearSuggestion} style={({ pressed }) => [styles.secondaryBtn, { borderColor: border, flex: 1 }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Dismiss suggestion">
                      <ThemedText style={{ fontWeight: '600' }}>Dismiss</ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

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
              {fromSuggestionId ? ' Pre-filled from a suggestion — edit anything before saving.' : ''}
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
                  onPress={() => { setEditMode(false); setFromSuggestionId(undefined); }}
                  style={({ pressed }) => [styles.primaryBtn, { borderWidth: 1, borderColor: border, flex: 1 }, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <ThemedText style={{ fontWeight: '600' }}>Cancel</ThemedText>
                </Pressable>
              )}
            </View>
            <ThemedText style={{ fontSize: 11, color: placeholder, marginTop: 10 }}>
              Saved targets sync to your account and override any suggestion.
            </ThemedText>
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
  fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
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
