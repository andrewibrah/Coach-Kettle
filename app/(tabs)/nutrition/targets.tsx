import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useNutrition } from '@/contexts/NutritionContext';
import { deriveNutritionTargets } from '@/lib/nutrition';

export default function NutritionTargetsScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { targets, refresh } = useNutrition();
  const [deriving, setDeriving] = useState(false);

  const handleDerive = async () => {
    if (deriving) return;
    setDeriving(true);
    try {
      await deriveNutritionTargets();
      await refresh();
    } catch (e) {
      console.warn('[targets] derive failed', e);
    } finally {
      setDeriving(false);
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
                {renderRow('Fiber min', targets.fiber_g_min, 'g')}
                {renderRow('Sat fat max', targets.saturated_fat_g_max, 'g')}
              </View>
              <View style={[styles.card, styles.halfCard, { backgroundColor: cardBackground, marginBottom: 0 }]}>
                <ThemedText type="subtitle" style={{ marginBottom: 10 }}>Rest day</ThemedText>
                {renderRow('Calories', targets.rest_calories, ' cal')}
                {renderRow('Protein', targets.rest_protein_g, 'g')}
                {renderRow('Carbs', targets.rest_carbs_g, 'g')}
                {renderRow('Fat', targets.rest_fat_g, 'g')}
              </View>
            </View>
            <ThemedText style={{ fontSize: 12, color: placeholder, marginBottom: 12, paddingHorizontal: 4 }}>
              BMR: {targets.bmr == null ? '—' : Math.round(targets.bmr)}  ·  TDEE: {targets.tdee == null ? '—' : Math.round(targets.tdee)}
            </ThemedText>
            <Pressable
              onPress={handleDerive}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
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
});
