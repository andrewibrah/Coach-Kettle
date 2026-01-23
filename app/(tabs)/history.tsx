import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeleteWorkoutModal } from "@/components/modals/DeleteWorkoutModal";
import { ScreenHeader } from "@/components/ui/screen-header";
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
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.getHistory();
      // newest first
      const sorted = [...data].sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setItems(sorted);
    } catch (e) {
      // alert?
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await api.deleteWorkout(selectedId);
      await load();
    } catch (e) {
      // alert?
    } finally {
      setDeleteModalVisible(false);
      setSelectedId(null);
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

  const renderWorkoutCard = ({ item }: { item: WorkoutSession }) => {
    const stats = sessionStats(item);

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
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardMain}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.part?.trim() ? item.part.trim() : "Workout"}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{stats.exercises} Exercises</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{stats.sets} Sets</Text>
              </View>
            </View>
          </View>

          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <ScreenHeader
        title="History"
        subtitle={`${headerStats.totalWorkouts} workouts • ${headerStats.totalSets} sets`}
        skipSafeArea
      />

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
            <Text style={styles.sectionHeaderText}>{formatDateHeader(title)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No saved workouts yet</Text>
            <Text style={styles.emptyHint}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: "#F7F7F8",
  },
  header: {
    marginBottom: 12,
  },

  listContent: {
    paddingBottom: 24,
  },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#FFFFFF",
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  metaChipDark: {
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#111827",
  },
  metaChipTextDark: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  chevron: {
    fontSize: 28,
    fontWeight: "800",
    color: "#9CA3AF",
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
    color: "#6B7280",
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
    color: "#111827",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
});
