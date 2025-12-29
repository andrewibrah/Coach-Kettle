import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listWorkouts, type WorkoutSession } from "@/lib/workoutStorage";

function toMMDD(dateISO: string) {
  const parts = dateISO.split("-");
  if (parts.length !== 3) return dateISO;
  return `${parts[1]}/${parts[2]}`;
}

function toNumber(raw: string): number {
  // Supports inputs like "100", "100lbs", "3mph", "9 incline"; extracts first numeric token.
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M lb`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k lb`;
  return `${Math.round(n)} lb`;
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

  const load = async () => {
    const data = await listWorkouts();
    // newest first
    const sorted = [...data].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    setItems(sorted);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const headerStats = useMemo(() => {
    const totalWorkouts = items.length;
    const totalSets = items.reduce((sum, s) => sum + (s.rows?.length ?? 0), 0);
    return { totalWorkouts, totalSets };
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>
          {headerStats.totalWorkouts} workouts • {headerStats.totalSets} sets
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        contentContainerStyle={[styles.listContent, items.length === 0 && { flex: 1 }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({ item }) => {
          const stats = sessionStats(item);
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/history/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardRow}>
                <View style={styles.datePill}>
                  <Text style={styles.dateText}>{toMMDD(item.dateISO)}</Text>
                </View>

                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.part?.trim() ? item.part.trim() : "Workout"}
                  </Text>

                  <View style={styles.metaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{stats.exercises} ex</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{stats.sets} sets</Text>
                    </View>
                    <View style={styles.metaChipDark}>
                      <Text style={styles.metaChipTextDark}>{formatVolume(stats.volume)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No saved workouts yet</Text>
            <Text style={styles.emptyHint}>
              Start a workout, log a few sets, then hit End.
            </Text>
          </View>
        }
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
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
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

  datePill: {
    width: 62,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
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
