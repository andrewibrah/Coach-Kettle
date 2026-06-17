import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import { useNutrition } from '@/contexts/NutritionContext';
import { useProfile } from '@/contexts/ProfileContext';
import { deriveNutritionTargets } from '@/lib/nutrition';
import { isTrainingDay as checkTrainingDay } from '@/lib/trainingSchedule';
import type { MealSlot, FoodLogEntry } from '@/types/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function NutritionHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const dangerColor = useThemeColor({}, 'danger');
  const successColor = useThemeColor({}, 'success');
  const warningColor = useThemeColor({}, 'warning');

  const { loading, error, date, entries, totals, targets, grade, refresh, deleteEntry } = useNutrition();
  const { profile } = useProfile();
  const [deriving, setDeriving] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const isTrainingDay = useMemo(() => {
    const dow = new Date().getDay();
    return checkTrainingDay(dow, profile?.training_days_per_week);
  }, [profile?.training_days_per_week]);

  const calTarget = isTrainingDay ? targets?.training_calories : targets?.rest_calories;
  const protTarget = isTrainingDay ? targets?.training_protein_g : targets?.rest_protein_g;
  const carbTarget = isTrainingDay ? targets?.training_carbs_g : targets?.rest_carbs_g;
  const fatTarget = isTrainingDay ? targets?.training_fat_g : targets?.rest_fat_g;

  const grouped = useMemo(() => {
    const out: Record<MealSlot, FoodLogEntry[]> = {
      breakfast: [], lunch: [], dinner: [], snack: [],
    };
    for (const e of entries) {
      if (out[e.meal_slot]) out[e.meal_slot].push(e);
    }
    return out;
  }, [entries]);

  const handleDeriveTargets = async () => {
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

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry(id);
    } catch (e) {
      console.warn('[nutrition] delete failed', e);
    }
  };

  const renderBar = (label: string, actual: number, target: number | undefined, suffix: string) => {
    const t = target ?? 0;
    const pct = t > 0 ? Math.min(100, (actual / t) * 100) : 0;
    const barColor = grade === 'green' ? successColor : grade === 'yellow' ? warningColor : grade === 'red' ? dangerColor : tint;
    return (
      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <ThemedText style={{ fontWeight: '600' }}>{label}</ThemedText>
          <ThemedText style={{ color: placeholder, fontSize: 13 }}>
            {Math.round(actual)}{suffix} / {Math.round(t)}{suffix}
          </ThemedText>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: border, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor }} />
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Nutrition" subtitle={date} showBack={false} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {error && (
            <View style={[styles.errorBanner, { backgroundColor: dangerColor }]}>
              <ThemedText style={styles.errorBannerText}>{error}</ThemedText>
              <Pressable onPress={refresh} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Retry">
                <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
              </Pressable>
            </View>
          )}
          {/* Today's totals */}
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Today&apos;s totals</ThemedText>
            {!targets ? (
              <Pressable
                onPress={handleDeriveTargets}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: tint },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Set up your nutrition targets"
              >
                {deriving ? (
                  <ActivityIndicator color={onTint} />
                ) : (
                  <ThemedText style={{ color: onTint, fontWeight: '700' }}>
                    Set up your nutrition targets
                  </ThemedText>
                )}
              </Pressable>
            ) : (
              <>
                {renderBar('Calories', totals?.calories ?? 0, calTarget, ' cal')}
                {renderBar('Protein', totals?.protein_g ?? 0, protTarget, 'g')}
                {renderBar('Carbs', totals?.carbs_g ?? 0, carbTarget, 'g')}
                {renderBar('Fat', totals?.fat_g ?? 0, fatTarget, 'g')}
                <ThemedText style={{ fontSize: 12, color: placeholder, marginTop: 4 }}>
                  {isTrainingDay ? 'Training day targets' : 'Rest day targets'}
                </ThemedText>
              </>
            )}
          </View>

          {/* Logged meals */}
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Logged meals</ThemedText>
            {entries.length === 0 ? (
              <ThemedText style={{ color: placeholder }}>Nothing logged yet today.</ThemedText>
            ) : (
              SLOTS.map((slot) => {
                const rows = grouped[slot];
                if (rows.length === 0) return null;
                return (
                  <View key={slot} style={{ marginBottom: 12 }}>
                    <ThemedText style={{ fontWeight: '700', textTransform: 'capitalize', marginBottom: 6 }}>
                      {slot}
                    </ThemedText>
                    {rows.map((entry) => (
                      <View
                        key={entry.id}
                        style={[styles.entryRow, { borderColor: border }]}
                      >
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontWeight: '600' }}>
                            {entry.food_name} × {entry.servings}
                          </ThemedText>
                          <ThemedText style={{ color: placeholder, fontSize: 12 }}>
                            {Math.round(entry.calories)} cal · {Math.round(entry.protein_g)}g/{Math.round(entry.carbs_g)}g/{Math.round(entry.fat_g)}g
                          </ThemedText>
                        </View>
                        <Pressable
                          onPress={() => handleDelete(entry.id)}
                          style={({ pressed }) => [{ padding: 8 }, pressed && { opacity: 0.7 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${entry.food_name}`}
                        >
                          <IconSymbol name="trash.fill" size={18} color={dangerColor} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>

          {/* Add food */}
          <Pressable
            onPress={() => router.push('/nutrition/log')}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: tint, marginBottom: 12 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add food"
          >
            <ThemedText style={{ color: onTint, fontWeight: '700' }}>Add food</ThemedText>
          </Pressable>

          {/* View weekly meal plan */}
          <Pressable
            onPress={() => router.push('/nutrition/plan')}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: border },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="View weekly meal plan"
          >
            <ThemedText style={{ color: textColor, fontWeight: '600' }}>View weekly meal plan</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => router.push('/nutrition/targets')}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: border, marginTop: 8 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit targets"
          >
            <ThemedText style={{ color: textColor, fontWeight: '600' }}>Edit targets</ThemedText>
          </Pressable>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
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
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  errorBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
