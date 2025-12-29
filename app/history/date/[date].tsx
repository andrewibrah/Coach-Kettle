import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listWorkouts, type WorkoutSession, type WorkoutRow } from "@/lib/workoutStorage";

type ExerciseGroup = {
  exercise: string;
  sets: { row: WorkoutRow; setNum: number }[];
  startedAt?: number;
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function groupByExercise(rows: WorkoutRow[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  rows.forEach((row) => {
    const last = groups[groups.length - 1];
    if (last && last.exercise.toLowerCase() === row.exercise.toLowerCase()) {
      last.sets.push({ row, setNum: last.sets.length + 1 });
    } else {
      groups.push({ 
        exercise: row.exercise, 
        sets: [{ row, setNum: 1 }],
        startedAt: row.loggedAt,
      });
    }
  });
  return groups;
}

function formatDateLong(dateISO: string): string {
  const date = new Date(dateISO + "T12:00:00");
  return date.toLocaleDateString("en-US", { 
    weekday: "long",
    month: "long", 
    day: "numeric" 
  });
}

// Collapsible workout card component
function WorkoutCard({ workout }: { workout: WorkoutSession }) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupByExercise(workout.rows);
  
  // Get unique exercise names for preview
  const exerciseNames = [...new Set(workout.rows.map(r => r.exercise))];
  const previewText = exerciseNames.slice(0, 3).join(", ") + 
    (exerciseNames.length > 3 ? ` +${exerciseNames.length - 3} more` : "");

  return (
    <View style={styles.workoutCard}>
      {/* Collapsed Header - Always visible */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [
          styles.workoutHeader,
          pressed && styles.workoutHeaderPressed,
        ]}
      >
        <View style={styles.workoutHeaderContent}>
          <Text style={styles.workoutName}>{workout.part}</Text>
          <Text style={styles.workoutPreview} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
        <View style={styles.workoutHeaderRight}>
          <Text style={styles.workoutMeta}>{workout.rows.length} sets</Text>
          <Text style={styles.expandIcon}>{expanded ? "−" : "+"}</Text>
        </View>
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.workoutContent}>
          {groups.map((group, gIdx) => (
            <View key={`group_${gIdx}`} style={styles.exerciseGroup}>
              <View style={styles.exerciseGroupHeader}>
                <Text style={styles.exerciseGroupName}>{group.exercise}</Text>
                {group.startedAt && (
                  <Text style={styles.exerciseTime}>{formatTime(group.startedAt)}</Text>
                )}
              </View>
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
          ))}
        </View>
      )}
    </View>
  );
}

export default function DateDetail() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const all = await listWorkouts();
      setWorkouts(all.filter((w) => w.dateISO === date));
    })();
  }, [date]);

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
        <Text style={styles.title}>{formatDateLong(date || "")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {workouts.length === 0 ? (
          <Text style={styles.emptyText}>No workouts found for this date.</Text>
        ) : (
          workouts.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} />
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
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  listContent: {
    paddingBottom: 32,
    gap: 10,
  },
  workoutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  workoutHeaderPressed: {
    backgroundColor: "#F9FAFB",
  },
  workoutHeaderContent: {
    flex: 1,
    marginRight: 12,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  workoutPreview: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  workoutHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workoutMeta: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  expandIcon: {
    fontSize: 20,
    fontWeight: "300",
    color: "#9CA3AF",
    width: 24,
    textAlign: "center",
  },
  workoutContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 8,
  },
  exerciseGroup: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10,
  },
  exerciseGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  exerciseGroupName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  exerciseTime: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    marginLeft: 8,
  },
  setsContainer: {
    gap: 4,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  setIndicator: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  setIndicatorText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  statUnit: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    marginRight: 2,
  },
  statSep: {
    fontSize: 12,
    color: "#D1D5DB",
    marginHorizontal: 2,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 40,
  },
});
