import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { todayISO } from '@/lib/workoutRules';
import type { BodyMetricsEntry } from '@/types/body';

import { useAuth } from '@/contexts/AuthProvider';
import { BODY_METRIC_FIELDS, validateBodyMetricInput, type BodyMetricKey, type BodyMetricErrors } from '@/lib/bodyMetricValidation';

type FormKey = BodyMetricKey;
const FORM_FIELDS = BODY_METRIC_FIELDS;
const EMPTY_FORM: Record<FormKey, string> = { weight_lbs: '', body_fat_pct: '', waist_in: '', chest_in: '', hips_in: '', arm_in: '', thigh_in: '', neck_in: '' };

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
  const dangerColor = useThemeColor({}, 'danger');
  const dangerFill = useThemeColor({}, 'dangerFill');
  const dangerForeground = useThemeColor({}, 'dangerForeground');

  const [entries, setEntries] = useState<BodyMetricsEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const [form, setForm] = useState<Record<FormKey, string>>({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<BodyMetricErrors>({});
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const mounted = useRef(false);
  const epoch = useRef(0);
  const pending = useRef(false);
  const pendingDeletes = useRef(new Set<string>());
  const loadSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const generation = ++epoch.current;
    pending.current = false;
    pendingDeletes.current.clear();
    setSaving(false);
    setRefreshing(false);
    setRetrying(false);
    setEntries([]);
    setLoadState('loading');
    setLoadError(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    return () => { mounted.current = false; epoch.current = generation + 1; };
  }, [ownerId]);

  const load = useCallback(async () => {
    const generation = epoch.current;
    const sequence = ++loadSequence.current;
    if (!ownerId) return;
    try {
      const list = await fetchBodyMetrics(180);
      if (mounted.current && owner.current === ownerId && epoch.current === generation && sequence === loadSequence.current) {
        setEntries(list);
        setLoadState('ready');
        setLoadError(null);
      }
    } catch (e: any) {
      console.warn('[body] load failed', e);
      if (mounted.current && owner.current === ownerId && epoch.current === generation && sequence === loadSequence.current) {
        const message = e?.message ?? 'Could not load measurements.';
        // Keep any previously loaded entries visible; only fall back to the
        // full error state when there is nothing on screen yet.
        setLoadError(message);
        setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
      }
    }
  }, [ownerId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    const generation = epoch.current;
    setRefreshing(true);
    await load();
    if (mounted.current && epoch.current === generation) setRefreshing(false);
  }, [load]);

  const onRetry = useCallback(async () => {
    const generation = epoch.current;
    setRetrying(true);
    await load();
    if (mounted.current && epoch.current === generation) setRetrying(false);
  }, [load]);

  // Sparse updates merge supplied measurements; blanks leave today's saved values unchanged.
  const hasAnyValue = Object.values(form).some((v) => v.trim().length > 0);
  const onSave = useCallback(async () => {
    if (pending.current || !mounted.current || !ownerId || owner.current !== ownerId) return;
    const result = validateBodyMetricInput({ measured_date: todayISO(), ...form });
    setErrors(result.errors);
    if (!result.valid) return;
    pending.current = true;
    const generation = epoch.current;
    const current = () => mounted.current && owner.current === ownerId && epoch.current === generation;
    setSaving(true);
    try {
      await upsertBodyMetric(result.payload);
      if (!current()) return;
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (e: any) {
      if (current()) showToast(e?.message ?? 'Could not save. Please try again.', 'error');
    } finally {
      if (current()) { pending.current = false; setSaving(false); }
    }
  }, [form, ownerId, load, showToast]);

  const onDelete = useCallback((entry: BodyMetricsEntry) => {
    if (!mounted.current || !ownerId || owner.current !== ownerId) return;
    const generation = epoch.current;
    const current = () => mounted.current && owner.current === ownerId && epoch.current === generation;
    Alert.alert('Delete entry?', `Delete measurements from ${entry.measured_date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!current() || pendingDeletes.current.has(entry.id)) return;
          pendingDeletes.current.add(entry.id);
          try {
            await deleteBodyMetric(entry.id);
            if (!current()) return;
            await load();
          } catch (e: any) {
            if (current()) showToast(e?.message ?? 'Could not delete. Please try again.', 'error');
          } finally {
            if (current()) pendingDeletes.current.delete(entry.id);
          }
        },
      },
    ]);
  }, [ownerId, load, showToast]);

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
                  accessibilityLabel={`${f.label} (${f.unit})`}
                  accessibilityHint={`Supported range ${f.min}–${f.max} ${f.unit}. ${errors[f.key] ?? ''}`}
                  editable={!saving}
                  value={form[f.key]}
                  onChangeText={(v) => {
                    setForm((prev) => ({ ...prev, [f.key]: v }));
                    setErrors((prev) => (prev[f.key] ? { ...prev, [f.key]: undefined } : prev));
                  }}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={placeholder}
                  style={[styles.input, { color: text, borderColor: border }]}
                />
                <ThemedText style={styles.hintText}>Supported: {f.min}–{f.max} {f.unit}</ThemedText>
                {errors[f.key] && <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite">{errors[f.key]}</ThemedText>}
              </View>
            ))}
          </View>
          <ThemedText style={styles.hintText}>Arm and thigh: wrap the tape around the limb to measure circumference, not diameter.</ThemedText>
          {(errors.form || errors.measured_date) && <ThemedText accessibilityRole="alert">{errors.form ?? errors.measured_date}</ThemedText>}
          <Pressable
            onPress={onSave}
            disabled={saving || !hasAnyValue}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
              (saving || !hasAnyValue) && { opacity: 0.5 },
            ]}
            accessibilityState={{ disabled: saving || !hasAnyValue }}
            accessibilityHint={hasAnyValue ? undefined : 'Enter at least one measurement first'}
            accessibilityRole="button"
            accessibilityLabel="Save body measurements"
          >
            <ThemedText type="defaultSemiBold" style={[styles.saveBtnText, { color: onTint }]}>
              {saving ? 'Saving…' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>

        {/* List */}
        {loadState === 'error' && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: dangerColor }} accessibilityRole="alert">
              Couldn&apos;t load measurements. Check your connection and try again.
            </ThemedText>
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
                retrying && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading measurements"
              accessibilityState={{ disabled: retrying, busy: retrying }}
            >
              <ThemedText type="defaultSemiBold" style={{ color: onTint }}>{retrying ? 'Retrying…' : 'Retry'}</ThemedText>
            </Pressable>
          </View>
        )}
        {loadState === 'loading' && (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator />
          </View>
        )}
        {loadState === 'ready' && loadError && (
          <View style={[styles.card, { backgroundColor: dangerFill }]}>
            <ThemedText style={[styles.errorBannerText, { color: dangerForeground }]} accessibilityRole="alert">
              Couldn&apos;t refresh. Showing previously loaded measurements.
            </ThemedText>
          </View>
        )}
        {loadState === 'ready' && entries.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>No measurements saved yet. Enter a measurement above and tap Save.</ThemedText>
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
                accessibilityRole="button"
                accessibilityLabel={`Measurements from ${e.measured_date} — long press to delete`}
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
  center: { alignItems: 'center', justifyContent: 'center' },
  retryBtn: { marginTop: 12, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorBannerText: { fontSize: 13, lineHeight: 18 },
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
  saveBtnText: { fontSize: 16 },
  entryDate: { fontSize: 16, marginBottom: 8 },
  entryRows: { gap: 4 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryLabel: { fontSize: 13 },
  hintText: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
