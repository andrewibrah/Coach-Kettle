import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';

import {
  fetchBodyMetrics,
  upsertBodyMetric,
  deleteBodyMetric,
} from '@/lib/bodyMetrics';
import type { BodyMetricsEntry } from '@/types/body';

type FormKey =
  | 'weight_lbs'
  | 'body_fat_pct'
  | 'waist_in'
  | 'chest_in'
  | 'hips_in'
  | 'arm_in'
  | 'thigh_in'
  | 'neck_in';

const FORM_FIELDS: { key: FormKey; label: string; unit: string }[] = [
  { key: 'weight_lbs', label: 'Weight', unit: 'lb' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { key: 'waist_in', label: 'Waist', unit: 'in' },
  { key: 'chest_in', label: 'Chest', unit: 'in' },
  { key: 'hips_in', label: 'Hips', unit: 'in' },
  { key: 'arm_in', label: 'Arm', unit: 'in' },
  { key: 'thigh_in', label: 'Thigh', unit: 'in' },
  { key: 'neck_in', label: 'Neck', unit: 'in' },
];

const FIELD_LABELS: Record<FormKey, string> = FORM_FIELDS.reduce((acc, f) => {
  acc[f.key] = `${f.label} (${f.unit})`;
  return acc;
}, {} as Record<FormKey, string>);

export default function BodyMetricsScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const [entries, setEntries] = useState<BodyMetricsEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const [form, setForm] = useState<Record<FormKey, string>>({
    weight_lbs: '',
    body_fat_pct: '',
    waist_in: '',
    chest_in: '',
    hips_in: '',
    arm_in: '',
    thigh_in: '',
    neck_in: '',
  });

  const load = useCallback(async () => {
    try {
      const list = await fetchBodyMetrics(180);
      setEntries(list);
    } catch (e) {
      console.warn('[body] load failed', e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const parseOrNull = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await upsertBodyMetric({
        measured_date: new Date().toISOString().slice(0, 10),
        weight_lbs: parseOrNull(form.weight_lbs),
        body_fat_pct: parseOrNull(form.body_fat_pct),
        waist_in: parseOrNull(form.waist_in),
        chest_in: parseOrNull(form.chest_in),
        hips_in: parseOrNull(form.hips_in),
        arm_in: parseOrNull(form.arm_in),
        thigh_in: parseOrNull(form.thigh_in),
        neck_in: parseOrNull(form.neck_in),
      });
      setForm({
        weight_lbs: '',
        body_fat_pct: '',
        waist_in: '',
        chest_in: '',
        hips_in: '',
        arm_in: '',
        thigh_in: '',
        neck_in: '',
      });
      await load();
    } catch (e: any) {
      showToast(e?.message ?? 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, load]);

  const onDelete = useCallback((entry: BodyMetricsEntry) => {
    Alert.alert('Delete entry?', `Delete measurements from ${entry.measured_date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBodyMetric(entry.id);
            await load();
          } catch (e: any) {
            showToast(e?.message ?? 'Could not delete. Please try again.', 'error');
          }
        },
      },
    ]);
  }, [load]);

  const formatField = (key: FormKey, val: number): string => {
    if (key === 'body_fat_pct') return `${val}%`;
    if (key === 'weight_lbs') return `${Math.round(val)} lb`;
    return `${val} in`;
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Body measurements" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Log today */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={styles.cardTitle}>Log today</ThemedText>
          <View style={styles.formGrid}>
            {FORM_FIELDS.map((f) => (
              <View key={f.key} style={styles.formItem}>
                <ThemedText style={[styles.formLabel, { color: placeholder }]}>
                  {f.label} ({f.unit})
                </ThemedText>
                <TextInput
                  value={form[f.key]}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={placeholder}
                  style={[styles.input, { color: text, borderColor: border }]}
                />
              </View>
            ))}
          </View>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
              saving && { opacity: 0.5 },
            ]}
          >
            <ThemedText type="defaultSemiBold" style={[styles.saveBtnText, { color: onTint }]}>
              {saving ? 'Saving…' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>

        {/* List */}
        {entries.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>No measurements yet.</ThemedText>
          </View>
        ) : (
          entries.map((e) => {
            const fields = FORM_FIELDS.filter((f) => e[f.key] != null);
            return (
              <Pressable
                key={e.id}
                onLongPress={() => onDelete(e)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: cardBackground },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText type="defaultSemiBold" style={styles.entryDate}>
                  {e.measured_date}
                </ThemedText>
                {fields.length === 0 ? (
                  <ThemedText style={{ color: placeholder }}>No fields recorded.</ThemedText>
                ) : (
                  <View style={styles.entryRows}>
                    {fields.map((f) => (
                      <View key={f.key} style={styles.entryRow}>
                        <ThemedText style={[styles.entryLabel, { color: placeholder }]}>
                          {FIELD_LABELS[f.key]}
                        </ThemedText>
                        <ThemedText type="defaultSemiBold">
                          {formatField(f.key, e[f.key] as number)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
                <ThemedText style={[styles.hintText, { color: placeholder }]}>
                  Long-press to delete
                </ThemedText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { marginBottom: 12 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  formItem: { width: '48%', marginBottom: 12 },
  formLabel: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  saveBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16 },
  entryDate: { fontSize: 16, marginBottom: 8 },
  entryRows: { gap: 4 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryLabel: { fontSize: 13 },
  hintText: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
