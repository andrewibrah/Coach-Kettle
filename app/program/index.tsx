import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Toast } from '@/components/ui/Toast';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { useProgram } from '@/contexts/ProgramContext';
import { archiveProgram } from '@/lib/programming';

function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const SPLIT_LABELS: Record<string, string> = {
  ppl_3day: 'Push / Pull / Legs (3-day)',
  pp_sh_l_5day: 'Push / Pull / Shoulders / Legs (5-day)',
  pp_sh_l_6day: 'Push / Pull / Shoulders / Legs (6-day)',
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
  custom: 'Custom',
};

export default function ProgramHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const danger = useThemeColor({}, 'danger');

  const { loading, program, advance, refresh } = useProgram();
  const { toast, showToast, hideToast } = useToast();

  const handleArchive = () => {
    if (!program) return;
    Alert.alert(
      'Archive program?',
      'This will end your current program. You can start a new one anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveProgram(program.id);
              await refresh();
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'Failed to archive', 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
      <ScreenHeader title="Program" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {loading ? (
          <ActivityIndicator color={tint} style={{ marginTop: 24 }} />
        ) : !program ? (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.cardTitle}>No active program</ThemedText>
            <ThemedText style={[styles.muted, { color: placeholder }]}>
              No active program. Create one tailored to your goal.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/program/create')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>Create Program</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={styles.cardTitle}>{program.name}</ThemedText>
              <ThemedText style={[styles.row, { color: textColor }]}>
                Goal: {titleCase(program.goal_type)}
              </ThemedText>
              <ThemedText style={[styles.row, { color: textColor }]}>
                Split: {SPLIT_LABELS[program.split_type] ?? titleCase(program.split_type)}
              </ThemedText>
              <ThemedText style={[styles.row, { color: textColor }]}>
                Week {program.current_week} of {program.weeks_total}
              </ThemedText>
              <ThemedText style={[styles.muted, { color: placeholder }]}>
                Periodization: {program.periodization}
              </ThemedText>
            </View>

            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <Pressable
                onPress={() => router.push('/program/week')}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: tint },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>View this week</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => advance()}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: tint },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.secondaryBtnText, { color: tint }]}>
                  Advance to next week
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleArchive}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: danger },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={[styles.secondaryBtnText, { color: danger }]}>
                  Archive program
                </ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: { fontSize: 15, marginBottom: 4 },
  muted: { fontSize: 13, marginTop: 4 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 15 },
});
