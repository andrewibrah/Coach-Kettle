import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import { useNutrition } from '@/contexts/NutritionContext';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { FeatureGateError } from '@/lib/entitlements';
import { showUpgradeAlert } from '@/lib/upgradePrompt';
import { generateMealPlan, recalibrateMealPlan } from '@/lib/nutrition';
import { fireMealPlanReady } from '@/lib/notifications';
import type { MealSlot, PlannedMeal } from '@/types/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pulls the Edge Function's `{code}` out of a `post()` rejection's `HTTP 409: {...}` message. */
function extractErrorCode(message: string): string | null {
  const match = message.match(/^HTTP \d+: (.*)$/s);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]);
    return typeof body?.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { mealPlan, mealPlanStatus, refreshMealPlan } = useNutrition();
  const { can } = useEntitlement();
  const { toast, showToast, hideToast } = useToast();
  const pending = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [recal, setRecal] = useState(false);
  const [targetsUnavailable, setTargetsUnavailable] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());

  const mealsByDay = useMemo(() => {
    const out: Record<number, PlannedMeal[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const m of mealPlan.meals) {
      if (out[m.day_of_week]) out[m.day_of_week].push(m);
    }
    return out;
  }, [mealPlan.meals]);

  const showMealPlanUpgrade = () =>
    showUpgradeAlert('Pro Feature', 'AI meal plans are a Pro feature — upgrade to unlock weekly plans built for your goals.');

  const handleGenerate = async () => {
    if (pending.current) return;
    if (!can('mealPlanGeneration')) {
      showMealPlanUpgrade();
      return;
    }
    pending.current = true;
    setGenerating(true);
    setTargetsUnavailable(false);
    try {
      const result = await generateMealPlan();
      await refreshMealPlan(result.plan.id);
      fireMealPlanReady().catch(() => undefined);
      showToast('Meal plan ready', 'success');
    } catch (e) {
      if (e instanceof FeatureGateError && e.code === 'PRO_REQUIRED') {
        showMealPlanUpgrade();
      } else if (e instanceof Error && extractErrorCode(e.message) === 'NUTRITION_TARGETS_UNAVAILABLE') {
        setTargetsUnavailable(true);
      } else {
        showToast(e instanceof Error ? e.message : 'Failed to generate meal plan. Try again.', 'error');
      }
    } finally {
      pending.current = false;
      setGenerating(false);
    }
  };

  const handleRecalibrate = async () => {
    if (pending.current) return;
    if (!can('mealPlanGeneration')) {
      showMealPlanUpgrade();
      return;
    }
    pending.current = true;
    setRecal(true);
    setTargetsUnavailable(false);
    try {
      const result = await recalibrateMealPlan();
      await refreshMealPlan(result.plan.id);
      showToast('Meal plan updated', 'success');
    } catch (e) {
      if (e instanceof FeatureGateError && e.code === 'PRO_REQUIRED') {
        showMealPlanUpgrade();
      } else if (e instanceof Error && extractErrorCode(e.message) === 'NUTRITION_TARGETS_UNAVAILABLE') {
        setTargetsUnavailable(true);
      } else {
        showToast(e instanceof Error ? e.message : 'Failed to recalibrate. Try again.', 'error');
      }
    } finally {
      pending.current = false;
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
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader
        title="This Week's Plan"
        subtitle={mealPlan.plan?.week_start_date ?? 'Not generated yet'}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {(mealPlanStatus === 'loading' || mealPlanStatus === 'idle') && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ActivityIndicator />
            <ThemedText>Loading meal plan…</ThemedText>
          </View>
        )}
        {targetsUnavailable && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText>Set complete nutrition targets before generating a meal plan.</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set nutrition targets"
              onPress={() => router.push('/(tabs)/nutrition/targets' as any)}
              style={[styles.secondaryBtn, { borderColor: border, marginTop: 10 }]}
            >
              <ThemedText style={{ color: textColor, fontWeight: '600' }}>Set nutrition targets</ThemedText>
            </Pressable>
          </View>
        )}
        {mealPlanStatus === 'error' && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText>{mealPlan.plan ? 'Could not refresh. Your previous plan is still shown.' : 'Could not load your meal plan.'}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading meal plan"
              disabled={generating || recal}
              onPress={() => { void refreshMealPlan().catch(() => showToast('Could not load meal plan. Try again.', 'error')); }}
              style={[styles.secondaryBtn, { borderColor: border }]}>
              <ThemedText>Retry loading</ThemedText>
            </Pressable>
          </View>
        )}
        {!mealPlan.plan ? (mealPlanStatus === 'ready' ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Generate a meal plan</ThemedText>
            <Pressable
              disabled={generating || recal}
              onPress={handleGenerate}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Generate meal plan"
            >
              {generating ? (
                <ActivityIndicator color={onTint} />
              ) : (
                <ThemedText style={{ color: onTint, fontWeight: '700' }}>Generate plan</ThemedText>
              )}
            </Pressable>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 10 }}>
              Uses your targets + dietary preferences.
            </ThemedText>
          </View>
        ) : null) : (
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
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: active }}
                  >
                    <ThemedText style={{ color: active ? onTint : textColor, fontWeight: '600', fontSize: 13 }}>
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
              disabled={generating || recal}
              onPress={handleRecalibrate}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Recalibrate plan from last 7 days"
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
