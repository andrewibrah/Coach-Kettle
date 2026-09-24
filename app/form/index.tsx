import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchRecentFormAnalyses, FORM_ANALYSIS_UNAVAILABLE } from '@/lib/formAnalysis';
import type { FormAnalysis } from '@/types/form';

export default function FormAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro } = useEntitlement();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

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
      <ScreenHeader title="Form Check" subtitle="Video analysis is coming soon" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Video analysis is coming soon</ThemedText>
          <ThemedText style={[styles.help, { color: placeholder }]}>{FORM_ANALYSIS_UNAVAILABLE}</ThemedText>
          <ThemedText style={[styles.help, { color: placeholder }]}>Recording is disabled. This version cannot measure reps, range of motion, tempo, or technique from video.</ThemedText>
        </View>

        {/* Upgrade prompt lists only benefits Pro delivers today; video analysis is not one of them. */}
        {!isPro && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.help, { color: placeholder }]}>
              Coach Kettle Pro unlocks unlimited AI coaching, advanced analytics, unlimited templates and AI meal plans.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/paywall' as any)}
              style={({ pressed }) => [styles.upgradeBtn, { backgroundColor: tint }, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Pro"
            >
              <ThemedText type="defaultSemiBold" style={{ color: onTint }}>Upgrade to Pro</ThemedText>
            </Pressable>
          </View>
        )}

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
  upgradeBtn: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  resultRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row' },
});
