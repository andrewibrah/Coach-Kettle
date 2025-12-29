import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listWorkouts, type WorkoutSession } from "@/lib/workoutStorage";

type DateGroup = {
  dateISO: string;
  workouts: WorkoutSession[];
  totalSets: number;
};

function formatDate(dateISO: string): string {
  const parts = dateISO.split("-");
  if (parts.length !== 3) return dateISO;
  return `${parts[1]}/${parts[2]}`;
}

function groupByDate(workouts: WorkoutSession[]): DateGroup[] {
  const groups: Map<string, WorkoutSession[]> = new Map();
  
  for (const workout of workouts) {
    const existing = groups.get(workout.dateISO) || [];
    existing.push(workout);
    groups.set(workout.dateISO, existing);
  }
  
  return Array.from(groups.entries())
    .map(([dateISO, workouts]) => ({
      dateISO,
      workouts,
      totalSets: workouts.reduce((sum, w) => sum + w.rows.length, 0),
    }))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO)); // Most recent first
}

export default function HistoryScreen() {
  const [items, setItems] = useState<WorkoutSession[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = async () => {
    setItems(await listWorkouts());
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const dateGroups = useMemo(() => groupByDate(items), [items]);

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* Back Button */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.title}>History</Text>
      </View>

      <FlatList
        data={dateGroups}
        keyExtractor={(g) => g.dateISO}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: group }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/history/date/[date]",
                params: { date: group.dateISO },
              })
            }
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.dateCircle}>
              <Text style={styles.dateDay}>{group.dateISO.split("-")[2]}</Text>
              <Text style={styles.dateMonth}>
                {new Date(group.dateISO + "T12:00:00").toLocaleString("default", { month: "short" }).toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>
                {group.workouts.length === 1 
                  ? group.workouts[0].part 
                  : `${group.workouts.length} workouts`}
              </Text>
              <Text style={styles.cardMeta}>
                {group.workouts.length === 1
                  ? `${group.totalSets} sets`
                  : group.workouts.map(w => w.part).join(", ")}
              </Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>No saved workouts</Text>
            <Text style={styles.emptyText}>
              Complete a workout to see it here
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
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3B82F6",
  },
  headerSection: {
    marginBottom: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  listContent: {
    paddingBottom: 32,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    gap: 14,
  },
  cardPressed: {
    opacity: 0.9,
    backgroundColor: "#F9FAFB",
  },
  dateCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 20,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.5,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardMeta: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  cardArrow: {
    fontSize: 22,
    color: "#D1D5DB",
    fontWeight: "300",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
});
