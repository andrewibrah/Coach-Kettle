import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
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
  fetchRestingHRSummary,
  fetchRestingHRList,
  upsertRestingHR,
  deleteRestingHR,
} from '@/lib/bodyMetrics';
import type {
  RestingHeartRateEntry,
  RestingHeartRateSummary,
} from '@/types/body';

export default function RestingHrScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const dangerColor = useThemeColor({}, 'danger');
  const successColor = useThemeColor({}, 'success');

  const [summary, setSummary] = useState<RestingHeartRateSummary | null>(null);
  const [entries, setEntries] = useState<RestingHeartRateEntry[]>([]);
  const [bpm, setBpm] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        fetchRestingHRSummary(30),
        fetchRestingHRList(60),
      ]);
      setSummary(s);
      setEntries(list);
    } catch (e) {
      console.warn('[resting-hr] load failed', e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onLog = useCallback(async () => {
    const parsed = parseInt(bpm, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showToast('Please enter a positive whole number.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertRestingHR({
        measured_date: new Date().toISOString().slice(0, 10),
        bpm: parsed,
        source: 'manual',
      });
      setBpm('');
      await load();
    } catch (e: any) {
      showToast(e?.message ?? 'Could not log. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [bpm, load]);

  const onDelete = useCallback((entry: RestingHeartRateEntry) => {
    Alert.alert('Delete entry?', `Delete ${entry.bpm} bpm from ${entry.measured_date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRestingHR(entry.id);
            await load();
          } catch (e: any) {
            showToast(e?.message ?? 'Could not delete. Please try again.', 'error');
          }
        },
      },
    ]);
  }, [load]);

  const delta = summary?.trend_delta_bpm ?? 0;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·';
  const deltaColor = delta > 0 ? dangerColor : delta < 0 ? successColor : placeholder;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Resting heart rate" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Summary */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={styles.cardTitle}>Last 30 days</ThemedText>
          <View style={styles.statsRow}>
            <SummaryCol label="Avg" value={summary?.avg_bpm} placeholder={placeholder} />
            <SummaryCol label="Min" value={summary?.min_bpm} placeholder={placeholder} />
            <SummaryCol label="Max" value={summary?.max_bpm} placeholder={placeholder} />
            <SummaryCol label="Samples" value={summary?.sample_count ?? null} placeholder={placeholder} unit="" />
          </View>
          {summary?.trend_delta_bpm != null && (
            <ThemedText style={[styles.trendText, { color: deltaColor }]}>
              {arrow} {Math.abs(summary.trend_delta_bpm)} bpm vs prior 30d
            </ThemedText>
          )}
        </View>

        {/* Log form */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={styles.cardTitle}>Log today</ThemedText>
          <TextInput
            value={bpm}
            onChangeText={setBpm}
            placeholder="BPM"
            placeholderTextColor={placeholder}
            keyboardType="number-pad"
            style={[styles.input, { color: text, borderColor: border }]}
          />
          <Pressable
            onPress={onLog}
            disabled={saving || !bpm.trim()}
            style={({ pressed }) => [
              styles.logBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.7 },
              (saving || !bpm.trim()) && { opacity: 0.5 },
            ]}
          >
            <ThemedText type="defaultSemiBold" style={[styles.logBtnText, { color: onTint }]}>
              {saving ? 'Saving…' : 'Log today'}
            </ThemedText>
          </Pressable>
        </View>

        {/* List */}
        {entries.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={{ color: placeholder }}>No entries yet.</ThemedText>
          </View>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={[styles.card, styles.entryCard, { backgroundColor: cardBackground }]}>
              <View style={styles.entryInfo}>
                <ThemedText type="defaultSemiBold" style={styles.entryBpm}>
                  {e.bpm} bpm
                </ThemedText>
                <ThemedText style={[styles.entryDate, { color: placeholder }]}>
                  {e.measured_date}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => onDelete(e)}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { borderColor: border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.deleteBtnText, { color: dangerColor }]}>Delete</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

function SummaryCol({
  label,
  value,
  placeholder,
  unit = ' bpm',
}: {
  label: string;
  value: number | null | undefined;
  placeholder: string;
  unit?: string;
}) {
  return (
    <View style={styles.statCol}>
      <ThemedText style={[styles.statLabel, { color: placeholder }]}>{label}</ThemedText>
      <ThemedText type="defaultSemiBold" style={styles.statValue}>
        {value != null ? `${Math.round(value)}${unit}` : '—'}
      </ThemedText>
    </View>
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
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCol: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 16 },
  trendText: { fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  logBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  logBtnText: { color: '#fff', fontSize: 16 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryInfo: { flex: 1 },
  entryBpm: { fontSize: 18 },
  entryDate: { fontSize: 12, marginTop: 2 },
  deleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600' },
});
