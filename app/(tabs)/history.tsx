import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeleteWorkoutModal } from "@/components/modals/DeleteWorkoutModal";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ThemedView } from "@/components/ui/themed-view";
import { Colors, accentColor } from "@/constants/theme";
import { useColorScheme } from "@/hooks/useColorScheme";
import { api } from "@/lib/api";
import { type WorkoutSession } from "@/lib/workoutStorage";

function formatDateHeader(dateISO: string) {
  const date = new Date(dateISO);
  if (isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
}

function toNumber(raw: string): number {
  // Supports inputs like "100", "100lbs", "3mph", "9 incline"; extracts first numeric token.
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}



function sessionStats(s: WorkoutSession) {
  const exercises = new Set(
    (s.rows ?? []).map((r) => (r.exercise || "").trim().toLowerCase()).filter(Boolean)
  );
  const sets = (s.rows ?? []).length;

  // Only counts volume when both weight and reps exist.
  const volume = (s.rows ?? []).reduce((sum, r) => {
    const w = toNumber(String((r as any).weightLbs ?? ""));
    const reps = toNumber(String((r as any).reps ?? ""));
    if (w > 0 && reps > 0) return sum + w * reps;
    return sum;
  }, 0);

  return { exercises: exercises.size, sets, volume };
}

export default function HistoryScreen() {
  const [items, setItems] = useState<WorkoutSession[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const backgroundColor = isDark ? Colors.dark.background : Colors.light.background;
  const textColor = isDark ? Colors.dark.text : Colors.light.text;
  const cardBg = isDark ? Colors.dark.cardBackground : Colors.light.cardBackground;
  const borderColor = isDark ? Colors.dark.border : Colors.light.border;
  const secondaryTextColor = isDark ? Colors.dark.placeholder : Colors.light.placeholder;
  const chevronColor = isDark ? Colors.dark.icon : Colors.light.icon;

  const load = async () => {
    try {
      setLoadError(false);
      const data = await api.getHistory();
      // newest first
      const sorted = [...data].sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setItems(sorted);
    } catch {
      setLoadError(true);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handleDelete = async () => {
    if (!selectedId) return;
    const deleteId = selectedId;
    const previousItems = items;

    setDeleteModalVisible(false);
    setSelectedId(null);
    setItems((prev) => prev.filter((item) => item.id !== deleteId));

    try {
      await api.deleteWorkout(deleteId);
    } catch {
      setItems(previousItems);
      Alert.alert("Error", "Failed to delete workout. Please try again.");
    }
  };

  const headerStats = useMemo(() => {
    const totalWorkouts = items.length;
    const totalSets = items.reduce((sum, s) => sum + (s.rows?.length ?? 0), 0);
    return { totalWorkouts, totalSets };
  }, [items]);

  const groupedItems = useMemo(() => {
    const groups: { title: string; data: WorkoutSession[] }[] = [];
    items.forEach((item) => {
      // Find existing group
      let group = groups.find((g) => g.title === item.dateISO);
      if (!group) {
        group = { title: item.dateISO, data: [] };
        groups.push(group);
      }
      group.data.push(item);
    });
    return groups;
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "#10B981";
    if (rating >= 6) return accentColor(isDark);
    if (rating >= 4) return "#F59E0B";
    return "#EF4444";
  };

  const renderWorkoutCard = ({ item }: { item: WorkoutSession }) => {
    const stats = sessionStats(item);
    const review = item.review;

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/history/[id]",
            params: { id: item.id },
          })
        }
        onLongPress={() => {
          setSelectedId(item.id);
          setDeleteModalVisible(true);
        }}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardMain}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
                {item.part?.trim() ? item.part.trim() : "Workout"}
              </Text>
              {review && (
                <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(review.rating) + '20', borderColor: getRatingColor(review.rating) }]}>
                  <Text style={[styles.ratingBadgeText, { color: getRatingColor(review.rating) }]}>{review.rating}/10</Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.metaChip, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.metaChipText, { color: textColor }]}>{stats.exercises} Exercises</Text>
              </View>
              <View style={[styles.metaChip, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.metaChipText, { color: textColor }]}>{stats.sets} Sets</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.chevron, { color: chevronColor }]}>›</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top + 12, backgroundColor }]}>
      <ScreenHeader
        title="History"
        subtitle={`${headerStats.totalWorkouts} workouts • ${headerStats.totalSets} sets`}
        skipSafeArea
      />

      {loadError && (
        <Text style={[styles.errorBanner, { color: textColor }]}>
          Failed to load workouts. Pull to refresh.
        </Text>
      )}

      <SectionList
        sections={groupedItems}
        keyExtractor={(w) => w.id}
        contentContainerStyle={[styles.listContent, items.length === 0 && { flex: 1 }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={renderWorkoutCard}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, { color: secondaryTextColor }]}>{formatDateHeader(title)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No saved workouts yet</Text>
            <Text style={[styles.emptyHint, { color: secondaryTextColor }]}>
              Start a workout, log a few sets, then hit End.
            </Text>
          </View>
        }
      />

      <DeleteWorkoutModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onConfirm={handleDelete}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 12,
  },

  listContent: {
    paddingBottom: 24,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  cardMain: {
    flex: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    flexShrink: 1,
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "800",
  },

  chevron: {
    fontSize: 28,
    fontWeight: "800",
    marginLeft: 2,
  },

  sectionHeader: {
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  errorBanner: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 12,
    opacity: 0.7,
  },
});
