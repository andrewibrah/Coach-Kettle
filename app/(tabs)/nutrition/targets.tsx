import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import { useNutrition } from '@/contexts/NutritionContext';
import { deriveNutritionTargets, overrideNutritionTargets } from '@/lib/nutrition';

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

  const { targets, refresh } = useNutrition();
  const { toast, showToast, hideToast } = useToast();
  const [deriving, setDeriving] = useState(false);
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

  const handleDerive = async () => {
    if (deriving) return;
    setDeriving(true);
    try {
      await deriveNutritionTargets();
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to derive targets';
      showToast(msg, 'error');
    } finally {
      setDeriving(false);
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

  const handleSaveOverride = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await overrideNutritionTargets({
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      showToast(msg, 'error');
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
        {!targets ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 12 }}>No targets yet</ThemedText>
            <Pressable
              onPress={handleDerive}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Derive nutrition targets from profile"
            >
              {deriving ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>
                  Derive from profile
                </ThemedText>
              )}
            </Pressable>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 10 }}>
              Needs DOB, weight, height, sex, activity, goal — set in onboarding/profile.
            </ThemedText>
          </View>
        ) : (
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
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Shared limits</ThemedText>
              {renderRow('Fiber min', targets.fiber_g_min, 'g')}
              {renderRow('Sat fat max', targets.saturated_fat_g_max, 'g')}
            </View>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 12, paddingHorizontal: 4 }}>
              BMR: {targets.bmr == null ? '—' : Math.round(targets.bmr)}  ·  TDEE: {targets.tdee == null ? '—' : Math.round(targets.tdee)}
            </ThemedText>
            {editMode ? (
              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Edit manually</ThemedText>
                <ThemedText style={{ fontWeight: '600', marginBottom: 6 }}>Training day</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput value={trainCal} onChangeText={setTrainCal} placeholder="Calories" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                  <TextInput value={trainProt} onChangeText={setTrainProt} placeholder="Protein g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TextInput value={trainCarb} onChangeText={setTrainCarb} placeholder="Carbs g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                  <TextInput value={trainFat} onChangeText={setTrainFat} placeholder="Fat g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
                <ThemedText style={{ fontWeight: '600', marginBottom: 6 }}>Rest day</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput value={restCal} onChangeText={setRestCal} placeholder="Calories" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                  <TextInput value={restProt} onChangeText={setRestProt} placeholder="Protein g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TextInput value={restCarb} onChangeText={setRestCarb} placeholder="Carbs g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                  <TextInput value={restFat} onChangeText={setRestFat} placeholder="Fat g" placeholderTextColor={placeholder} keyboardType="decimal-pad" style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border }]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={handleSaveOverride}
                    style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint, flex: 1 }, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Save nutrition targets"
                  >
                    {saving ? <ActivityIndicator color={onTint} /> : <ThemedText style={{ color: onTint, fontWeight: '700' }}>Save</ThemedText>}
                  </Pressable>
                  <Pressable
                    onPress={() => setEditMode(false)}
                    style={({ pressed }) => [styles.primaryBtn, { borderWidth: 1, borderColor: border, flex: 1 }, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing"
                  >
                    <ThemedText style={{ fontWeight: '600' }}>Cancel</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handleOpenEdit}
                style={({ pressed }) => [styles.secondaryBtn, { borderColor: border, marginBottom: 12 }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Edit targets manually"
              >
                <ThemedText style={{ fontWeight: '600' }}>Edit manually</ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={handleDerive}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Re-derive targets from profile"
            >
              {deriving ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Recalibrate now</ThemedText>
              )}
            </Pressable>
          </>
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
});
