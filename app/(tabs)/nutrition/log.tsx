import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useNutrition } from '@/contexts/NutritionContext';
import { searchFoods } from '@/lib/nutrition';
import type { FoodItem, MealSlot, RecentFood } from '@/types/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function LogFoodScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const inputBg = useThemeColor({}, 'inputBackground');
  const dangerColor = useThemeColor({}, 'danger');

  const { logFood, recentFoods } = useNutrition();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState('1');
  const [mealSlot, setMealSlot] = useState<MealSlot>('breakfast');
  const [submitting, setSubmitting] = useState(false);

  // Quick log fields
  const [quickName, setQuickName] = useState('');
  const [quickCal, setQuickCal] = useState('');
  const [quickProt, setQuickProt] = useState('');
  const [quickCarb, setQuickCarb] = useState('');
  const [quickFat, setQuickFat] = useState('');
  const [quickFiber, setQuickFiber] = useState('');
  const [quickSatFat, setQuickSatFat] = useState('');
  const [quickMealSlot, setQuickMealSlot] = useState<MealSlot>('breakfast');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchFoods(query);
        if (!cancelled) setResults(res.foods ?? []);
      } catch (e) {
        if (!cancelled) {
          console.warn('[nutrition] search failed', e);
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const handleLogSelected = async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (!selected || submitting) return;
    const s = parseFloat(servings) || 1;
    setSubmitting(true);
    try {
      await logFood({
        date: today,
        meal_slot: mealSlot,
        food_id: selected.id,
        food_name: selected.name,
        servings: s,
        calories: selected.calories * s,
        protein_g: selected.protein_g * s,
        carbs_g: selected.carbs_g * s,
        fat_g: selected.fat_g * s,
        fiber_g: selected.fiber_g * s,
        saturated_fat_g: selected.saturated_fat_g * s,
      });
      router.back();
    } catch (e) {
      console.warn('[nutrition] log failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLog = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setQuickError(null);
    const cal = parseFloat(quickCal);
    const prot = parseFloat(quickProt);
    const carb = parseFloat(quickCarb);
    const fat = parseFloat(quickFat);
    if (!quickName.trim()) { setQuickError('Name is required'); return; }
    if (isNaN(cal) || isNaN(prot) || isNaN(carb) || isNaN(fat)) {
      setQuickError('All macro fields must be numbers');
      return;
    }
    setQuickSubmitting(true);
    try {
      await logFood({
        date: today,
        meal_slot: quickMealSlot,
        food_id: null,
        food_name: quickName.trim(),
        servings: 1,
        calories: cal,
        protein_g: prot,
        carbs_g: carb,
        fat_g: fat,
        fiber_g: parseFloat(quickFiber) || 0,
        saturated_fat_g: parseFloat(quickSatFat) || 0,
      });
      router.back();
    } catch (e) {
      console.warn('[nutrition] quick log failed', e);
      setQuickError('Failed to log. Try again.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  const renderSlotPicker = (current: MealSlot, setter: (s: MealSlot) => void) => (
    <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8, flexWrap: 'wrap' }}>
      {SLOTS.map((slot) => {
        const active = current === slot;
        return (
          <Pressable
            key={slot}
            onPress={() => setter(slot)}
            style={({ pressed }) => [
              styles.slotBtn,
              { borderColor: border, backgroundColor: active ? tint : 'transparent' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThemedText
              style={{
                color: active ? onTint : textColor,
                fontWeight: '600',
                textTransform: 'capitalize',
                fontSize: 13,
              }}
            >
              {slot}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  const servingsNum = parseFloat(servings) || 1;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Log food" subtitle="Search or quick add" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Recently logged */}
        {recentFoods.length > 0 && query.trim().length === 0 && (
          <View style={[styles.card, { backgroundColor: cardBackground, paddingBottom: 8 }]}>
            <ThemedText style={{ fontWeight: '700', marginBottom: 8 }}>Recently logged</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {recentFoods.map((food: RecentFood, idx: number) => (
                  <Pressable
                    key={`${food.food_id ?? food.food_name}-${idx}`}
                    onPress={() => {
                      setSelected({
                        id: food.food_id ?? '',
                        user_id: null,
                        is_global: false,
                        name: food.food_name,
                        brand: null,
                        serving_size_g: 0,
                        serving_label: null,
                        calories: food.calories,
                        protein_g: food.protein_g,
                        carbs_g: food.carbs_g,
                        fat_g: food.fat_g,
                        fiber_g: food.fiber_g,
                        saturated_fat_g: food.saturated_fat_g,
                        sugar_g: 0,
                        sodium_mg: 0,
                        tags: [],
                        created_at: '',
                        updated_at: '',
                      });
                      setServings(String(food.servings));
                      setMealSlot(food.meal_slot);
                      setResults([]);
                      setQuery('');
                    }}
                    style={({ pressed }) => [
                      styles.recentPill,
                      { backgroundColor: cardBackground, borderColor: border },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ThemedText style={{ fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {food.food_name}
                    </ThemedText>
                    <ThemedText style={{ color: placeholder, fontSize: 11 }}>
                      {Math.round(food.calories)} cal
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Search */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Search foods</ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. chicken breast"
            placeholderTextColor={placeholder}
            style={[
              styles.input,
              { backgroundColor: inputBg, color: textColor, borderColor: border },
            ]}
            autoCorrect={false}
          />
          {searching && (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator />
            </View>
          )}
          {results.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => { setSelected(item); setResults([]); setQuery(''); }}
                  style={({ pressed }) => [
                    styles.resultRow,
                    { borderColor: border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={{ fontWeight: '600' }}>{item.name}</ThemedText>
                  <ThemedText style={{ color: placeholder, fontSize: 12 }}>
                    {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g protein
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          {!searching && results.length === 0 && query.trim().length >= 2 && (
            <ThemedText style={{ color: placeholder, marginTop: 8, fontSize: 13 }}>
              No foods found. Try Quick Log below or create a custom food.
            </ThemedText>
          )}
        </View>

        {/* Selected card */}
        {selected && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>{selected.name}</ThemedText>
            <ThemedText style={{ color: placeholder, fontSize: 13, marginBottom: 10 }}>
              Per serving: {Math.round(selected.calories)} cal · {Math.round(selected.protein_g)}g/{Math.round(selected.carbs_g)}g/{Math.round(selected.fat_g)}g
            </ThemedText>
            <ThemedText style={{ fontWeight: '600', marginBottom: 4 }}>Servings</ThemedText>
            <TextInput
              value={servings}
              onChangeText={setServings}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={placeholder}
              style={[
                styles.input,
                { backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 },
              ]}
            />
            <ThemedText style={{ fontSize: 13, color: placeholder, marginBottom: 4 }}>
              Total: {Math.round(selected.calories * servingsNum)} cal · {Math.round(selected.protein_g * servingsNum)}g/{Math.round(selected.carbs_g * servingsNum)}g/{Math.round(selected.fat_g * servingsNum)}g
            </ThemedText>
            <ThemedText style={{ fontWeight: '600', marginTop: 8 }}>Meal</ThemedText>
            {renderSlotPicker(mealSlot, setMealSlot)}
            <Pressable
              onPress={handleLogSelected}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint, marginTop: 4 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Log</ThemedText>
              )}
            </Pressable>
          </View>
        )}

        {/* Separator */}
        <View style={styles.separator}>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
          <ThemedText style={{ color: placeholder, paddingHorizontal: 8, fontSize: 13 }}>
            or log quickly
          </ThemedText>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
        </View>

        {/* Quick log */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Quick log</ThemedText>
          <TextInput
            value={quickName}
            onChangeText={setQuickName}
            placeholder="Food name"
            placeholderTextColor={placeholder}
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickCal}
              onChangeText={setQuickCal}
              placeholder="Calories"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickProt}
              onChangeText={setQuickProt}
              placeholder="Protein g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickCarb}
              onChangeText={setQuickCarb}
              placeholder="Carbs g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickFat}
              onChangeText={setQuickFat}
              placeholder="Fat g"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={quickFiber}
              onChangeText={setQuickFiber}
              placeholder="Fiber g (opt)"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
            <TextInput
              value={quickSatFat}
              onChangeText={setQuickSatFat}
              placeholder="Sat fat g (opt)"
              placeholderTextColor={placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor: border, marginBottom: 8 }]}
            />
          </View>
          <ThemedText style={{ fontWeight: '600', marginTop: 4 }}>Meal</ThemedText>
          {renderSlotPicker(quickMealSlot, setQuickMealSlot)}
          {quickError && (
            <ThemedText style={{ color: dangerColor, marginBottom: 8, fontSize: 13 }}>
              {quickError}
            </ThemedText>
          )}
          <Pressable
            onPress={handleQuickLog}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: tint, marginTop: 4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {quickSubmitting ? (
              <ActivityIndicator color={onTint} />
            ) : (
              <ThemedText style={{ color: onTint, fontWeight: '700' }}>Log</ThemedText>
            )}
          </Pressable>
        </View>
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  resultRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  recentPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 90,
    maxWidth: 140,
  },
});
