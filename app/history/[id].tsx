import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/lib/api";
import { type WorkoutRow, type WorkoutSession } from "@/lib/workoutStorage";

type ExerciseGroup = {
  exercise: string;
  sets: { row: WorkoutRow; setNum: number }[];
};

function groupByExercise(rows: WorkoutRow[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  rows.forEach((row) => {
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

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const cardColor = isDark ? '#1C1C1E' : '#F9FAFB';
  const secondaryTextColor = isDark ? '#9CA3AF' : '#6B7280';

  useEffect(() => {
    (async () => {
      try {
        const all: WorkoutSession[] = await api.getHistory();
        setWorkout(all.find((w) => w.id === id) ?? null);
      } catch (error) {
        console.error("[WorkoutDetail] Failed to fetch history:", error);
        setWorkout(null);
      }
    })();
  }, [id]);

  const groups = useMemo(() => {
    if (!workout) return [];
    return groupByExercise(workout.rows);
  }, [workout]);



  if (!workout) {
    return (
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}>
        <Stack.Screen options={{ title: "Workout", headerBackTitle: "Back" }} />
        <Text style={styles.notFound}>Workout not found.</Text>
      </View>
    );
  }


  const workoutName = workout.part?.trim() || "Workout";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, backgroundColor }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
            <IconSymbol name="chevron.left" size={24} color={textColor} />
          </Pressable>
          <View>
            <Text style={[styles.title, { color: textColor }]}>{workoutName}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>


        {groups.length === 0 ? (
          <Text style={styles.emptyText}>No exercises logged.</Text>
        ) : (
          groups.map((group, gIdx) => (
            <View key={`group_${gIdx}`} style={[styles.exerciseGroup, { backgroundColor: cardColor }]}>
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseGroupName, { color: textColor }]}>{group.exercise}</Text>
                <Text style={[styles.setCount, { color: secondaryTextColor }]}>{group.sets.length} sets</Text>
              </View>
              <View style={styles.setsContainer}>
                {group.sets.map(({ row, setNum }, sIdx) => (
                  <View key={`set_${sIdx}`} style={styles.setRow}>
                    <View style={styles.setIndicator}>
                      <Text style={styles.setIndicatorText}>{setNum}</Text>
                    </View>
                    <View style={styles.statsRow}>
                      <Text style={[styles.statValue, { color: textColor }]}>{row.weightLbs || "—"}</Text>
                      <Text style={[styles.statUnit, { color: secondaryTextColor }]}>lb</Text>
                      <Text style={[styles.statSep, { color: secondaryTextColor }]}>×</Text>
                      <Text style={[styles.statValue, { color: textColor }]}>{row.reps || "—"}</Text>
                      {row.timestamp ? (
                        <Text style={[styles.timestamp, { color: secondaryTextColor }]}>
                          {new Date(row.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      ) : null}
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
  listContent: {
    paddingTop: 16,
    paddingBottom: 32,
    gap: 10,
  },
  header: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 999,
  },
  backBtnPressed: {
    backgroundColor: '#E5E7EB',
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
  },
  dateSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  exerciseGroup: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 12,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  exerciseGroupName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    color: "#111827",
  },
  setCount: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
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
  timestamp: {
    fontSize: 11,
    fontWeight: "400",
    marginLeft: 6,
  },
});
