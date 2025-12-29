import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listWorkouts, type WorkoutSession, type WorkoutRow } from "@/lib/workoutStorage";

type ExerciseGroup = {
  exercise: string;
  sets: { row: WorkoutRow; setNum: number }[];
};

// Group consecutive rows by exercise name
function groupByExercise(rows: WorkoutRow[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  rows.forEach((row, idx) => {
    const last = groups[groups.length - 1];
    if (last && last.exercise.toLowerCase() === row.exercise.toLowerCase()) {
      last.sets.push({ row, setNum: last.sets.length + 1 });
    } else {
      groups.push({ exercise: row.exercise, sets: [{ row, setNum: 1 }] });
    }
  });
  return groups;
}

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const all = await listWorkouts();
      setWorkout(all.find((w) => w.id === id) ?? null);
    })();
  }, [id]);

  const groups = useMemo(() => {
    if (!workout) return [];
    return groupByExercise(workout.rows);
  }, [workout]);

  if (!workout) {
    return (
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.notFound}>Workout not found.</Text>
      </View>
    );
  }

  // Format date nicely
  const formatDate = (dateISO: string) => {
    const parts = dateISO.split("-");
    if (parts.length !== 3) return dateISO;
    return `${parts[1]}/${parts[2]}`;
  };

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
        <Text style={styles.title}>{workout.part}</Text>
        <Text style={styles.date}>{formatDate(workout.dateISO)}</Text>
      </View>

      {/* Exercise List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {groups.length === 0 ? (
          <Text style={styles.emptyText}>No exercises logged.</Text>
        ) : (
          groups.map((group, gIdx) => (
            <View key={`group_${gIdx}`} style={styles.exerciseGroup}>
              <Text style={styles.exerciseGroupName}>{group.exercise}</Text>
              <View style={styles.setsContainer}>
                {group.sets.map(({ row, setNum }, sIdx) => (
                  <View key={`set_${sIdx}`} style={styles.setRow}>
                    <View style={styles.setIndicator}>
                      <Text style={styles.setIndicatorText}>{setNum}</Text>
                    </View>
                    <View style={styles.statsRow}>
                      <Text style={styles.statValue}>{row.weightLbs || "—"}</Text>
                      <Text style={styles.statUnit}>lb</Text>
                      <Text style={styles.statSep}>×</Text>
                      <Text style={styles.statValue}>{row.reps || "—"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    marginBottom: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 15,
    color: "#6B7280",
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 32,
    gap: 10,
  },
  exerciseGroup: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
  },
  exerciseGroupName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
  setsContainer: {
    gap: 6,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  setIndicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  setIndicatorText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    marginRight: 2,
  },
  statSep: {
    fontSize: 13,
    color: "#D1D5DB",
    marginHorizontal: 2,
  },
  notFound: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 40,
  },
});
