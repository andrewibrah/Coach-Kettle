import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useNutrition } from '@/contexts/NutritionContext';
import { generateMealPlan, recalibrateMealPlan } from '@/lib/nutrition';
import type { MealSlot, PlannedMeal } from '@/types/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MealPlanScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

  const { mealPlan, refresh } = useNutrition();
  const [generating, setGenerating] = useState(false);
  const [recal, setRecal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getUTCDay());

  const mealsByDay = useMemo(() => {
    const out: Record<number, PlannedMeal[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const m of mealPlan.meals) {
      if (out[m.day_of_week]) out[m.day_of_week].push(m);
    }
    return out;
  }, [mealPlan.meals]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await generateMealPlan();
      await refresh();
    } catch (e) {
      console.warn('[plan] generate failed', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleRecalibrate = async () => {
    if (recal) return;
    setRecal(true);
    try {
      await recalibrateMealPlan();
      await refresh();
    } catch (e) {
      console.warn('[plan] recalibrate failed', e);
    } finally {
      setRecal(false);
    }
  };

  const renderMealsForSlot = (slot: MealSlot) => {
    const dayMeals = mealsByDay[selectedDay] ?? [];
    const slotMeals = dayMeals.filter((m) => m.meal_slot === slot)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (slotMeals.length === 0) return null;
    return (
      <View key={slot} style={{ marginBottom: 12 }}>
        <ThemedText style={{ fontWeight: '700', textTransform: 'capitalize', marginBottom: 8 }}>
          {slot}
        </ThemedText>
        {slotMeals.map((m) => (
          <View key={m.id} style={[styles.mealCard, { borderColor: border }]}>
            <ThemedText style={{ fontWeight: '700', marginBottom: 2 }}>{m.title}</ThemedText>
            {m.description && (
              <ThemedText style={{ fontStyle: 'italic', fontSize: 13, color: placeholder, marginBottom: 6 }}>
                {m.description}
              </ThemedText>
            )}
            <ThemedText style={{ fontSize: 13, color: placeholder, marginBottom: 6 }}>
              {Math.round(m.calories)} cal · {Math.round(m.protein_g)}g/{Math.round(m.carbs_g)}g/{Math.round(m.fat_g)}g
            </ThemedText>
            {m.items.length > 0 && (
              <View style={{ marginTop: 4 }}>
                {m.items.map((it, idx) => (
                  <ThemedText key={idx} style={{ fontSize: 12, color: placeholder }}>
                    • {it.name}{it.grams ? ` (${Math.round(it.grams)}g)` : it.servings ? ` (${it.servings}x)` : ''}
                  </ThemedText>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader
        title="This Week's Plan"
        subtitle={mealPlan.plan?.week_start_date ?? 'Not generated yet'}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {!mealPlan.plan ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Generate a meal plan</ThemedText>
            <Pressable
              onPress={handleGenerate}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Generate plan</ThemedText>
              )}
            </Pressable>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 10 }}>
              Uses your targets + dietary preferences.
            </ThemedText>
          </View>
        ) : (
          <>
            {/* Day tabs */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {DAY_LABELS.map((label, idx) => {
                const active = selectedDay === idx;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => setSelectedDay(idx)}
                    style={({ pressed }) => [
                      styles.dayBtn,
                      { borderColor: border, backgroundColor: active ? tint : 'transparent' },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ThemedText style={{ color: active ? '#fff' : textColor, fontWeight: '600', fontSize: 13 }}>
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              {(mealsByDay[selectedDay] ?? []).length === 0 ? (
                <ThemedText style={{ color: placeholder }}>No meals for this day.</ThemedText>
              ) : (
                SLOTS.map(renderMealsForSlot)
              )}
            </View>

            <Pressable
              onPress={handleRecalibrate}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: border },
                pressed && { opacity: 0.7 },
              ]}
            >
              {recal ? (
                <ActivityIndicator />
              ) : (
                <ThemedText style={{ color: textColor, fontWeight: '600' }}>
                  Recalibrate from last 7 days
                </ThemedText>
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
  mealCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
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
  dayBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
});
