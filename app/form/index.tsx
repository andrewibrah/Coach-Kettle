import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchRecentFormAnalyses, FORM_ANALYSIS_UNAVAILABLE } from '@/lib/formAnalysis';
import type { FormAnalysis } from '@/types/form';

export default function FormAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');

  const [recent, setRecent] = useState<FormAnalysis[]>([]);

  const loadRecent = async () => {
    try {
      setRecent(await fetchRecentFormAnalyses(8));
    } catch (e) {
      console.warn('[form] load recent failed', e);
    }
  };

  useEffect(() => { loadRecent(); }, []);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Form Check" subtitle="Video analysis unavailable" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Analysis unavailable</ThemedText>
          <ThemedText style={[styles.help, { color: placeholder }]}>{FORM_ANALYSIS_UNAVAILABLE}</ThemedText>
          <ThemedText style={[styles.help, { color: placeholder }]}>Recording is disabled. This version cannot measure reps, range of motion, tempo, or technique from video.</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Previous records</ThemedText>
          {recent.length === 0 ? (
            <ThemedText style={{ color: placeholder }}>No form checks yet.</ThemedText>
          ) : recent.map((row) => (
            <View key={row.id} style={[styles.resultRow, { borderColor: border }]}> 
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '700' }}>{row.exercise}</ThemedText>
                <ThemedText style={{ color: placeholder, fontSize: 12 }}>
                  {new Date(row.captured_at).toLocaleDateString()} · Unverified analysis
                </ThemedText>
                <ThemedText style={{ color: placeholder, fontSize: 12, marginTop: 3 }}>
                  Record preserved. Scores, rep counts, and cues are hidden because they have not been verified from video.
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  help: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  resultRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row' },
});
