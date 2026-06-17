import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { fetchRecentFormAnalyses, saveFormAnalysis } from '@/lib/formAnalysis';
import type { FormAnalysis } from '@/types/form';

export default function FormAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { toast, showToast, hideToast } = useToast();
  const [exercise, setExercise] = useState('Back Squat');
  const [expectedReps, setExpectedReps] = useState('8');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<FormAnalysis[]>([]);

  const loadRecent = async () => {
    try {
      setRecent(await fetchRecentFormAnalyses(8));
    } catch (e) {
      console.warn('[form] load recent failed', e);
    }
  };

  useEffect(() => { loadRecent(); }, []);

  const handleCapture = async () => {
    if (!exercise.trim()) {
      showToast('Enter the lift before recording.', 'error');
      return;
    }

    setLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast('Enable camera access to record a form check.', 'info');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 45,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const analysis = await saveFormAnalysis({
        exercise,
        video_uri: asset.uri,
        expected_reps: Number(expectedReps) || 8,
      });
      setRecent((rows) => [analysis, ...rows].slice(0, 8));
      showToast(`Saved · ${analysis.rep_count ?? '-'} reps · Form ${analysis.form_score ?? '-'}/100`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save analysis.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Form Check" subtitle="Camera rep count + technique cues" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Record a set</ThemedText>
          <ThemedText style={[styles.help, { color: placeholder }]}>Capture the set, save rep count, ROM score, form score, and trainer cues. Native pose landmarks can be attached later without changing this surface.</ThemedText>

          <ThemedText style={styles.label}>Exercise</ThemedText>
          <TextInput
            value={exercise}
            onChangeText={setExercise}
            placeholder="Back Squat"
            placeholderTextColor={placeholder}
            style={[styles.input, { color: textColor, borderColor: border }]}
          />

          <ThemedText style={styles.label}>Expected reps</ThemedText>
          <TextInput
            value={expectedReps}
            onChangeText={setExpectedReps}
            keyboardType="number-pad"
            placeholder="8"
            placeholderTextColor={placeholder}
            style={[styles.input, { color: textColor, borderColor: border }]}
          />

          <Pressable
            onPress={handleCapture}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: tint }, pressed && { opacity: 0.7 }, loading && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Record form check"
          >
            {loading ? <ActivityIndicator color={onTint} /> : <ThemedText style={[styles.primaryText, { color: onTint }]}>Record form check</ThemedText>}
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Recent feedback</ThemedText>
          {recent.length === 0 ? (
            <ThemedText style={{ color: placeholder }}>No form checks yet.</ThemedText>
          ) : recent.map((row) => (
            <View key={row.id} style={[styles.resultRow, { borderColor: border }]}> 
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '700' }}>{row.exercise}</ThemedText>
                <ThemedText style={{ color: placeholder, fontSize: 12 }}>
                  {new Date(row.captured_at).toLocaleDateString()} · {row.rep_count ?? '-'} reps · ROM {row.rom_score ?? '-'} · Form {row.form_score ?? '-'}
                </ThemedText>
                {[...(row.cues ?? []), ...(row.warnings ?? [])].slice(0, 2).map((cue, i) => (
                  <ThemedText key={`${row.id}-${i}`} style={{ color: placeholder, fontSize: 12, marginTop: 3 }}>
                    • {cue.message}
                  </ThemedText>
                ))}
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
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryText: { fontWeight: '700' },
  resultRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row' },
});
