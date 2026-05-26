import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useThemeColor } from '@/hooks/useThemeColor';

import { useCoaching } from '@/contexts/CoachingContext';
import type { ColorGrade } from '@/types/nutrition';

const COLOR_MAP: Record<ColorGrade, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
};

function dotColor(grade: ColorGrade | null | undefined, fallback: string): string {
  if (!grade) return fallback;
  return COLOR_MAP[grade] ?? fallback;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function CoachHistoryScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const border = useThemeColor({}, 'border');

  const { loading, recent } = useCoaching();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScreenHeader title="Last 7 days" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {recent.length === 0 ? (
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={{ color: placeholder }}>No history yet.</ThemedText>
            </View>
          ) : (
            recent.map((item) => {
              const isOpen = !!expanded[item.id];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: cardBackground },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <ThemedText style={{ fontWeight: '700' }}>
                      {formatDate(item.feedback_date)}
                    </ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: dotColor(item.overall_color, border) },
                        ]}
                      />
                      <ThemedText style={{ fontSize: 12, color: placeholder }}>
                        {item.workout_completed ? '✓' : '—'} · {item.nutrition_color ?? 'n/a'}
                      </ThemedText>
                    </View>
                  </View>
                  {isOpen && (
                    <View style={{ marginTop: 12 }}>
                      <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>What you did well</ThemedText>
                      <ThemedText style={{ color: placeholder, marginBottom: 10 }}>
                        {item.did_well ?? '—'}
                      </ThemedText>
                      <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>What needs improvement</ThemedText>
                      <ThemedText style={{ color: placeholder, marginBottom: 10 }}>
                        {item.needs_improvement ?? '—'}
                      </ThemedText>
                      <ThemedText style={{ fontWeight: '700', marginBottom: 4 }}>Tomorrow&apos;s focus</ThemedText>
                      <ThemedText style={{ color: placeholder }}>
                        {item.tomorrow_focus ?? '—'}
                      </ThemedText>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
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
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
