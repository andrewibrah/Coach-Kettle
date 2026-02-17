import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/lib/api";
import { type SessionReview, type WorkoutRow, type WorkoutSession } from "@/lib/workoutStorage";

type ExerciseGroup = {
  exercise: string;
  sets: { row: WorkoutRow; setNum: number }[];
};

function ReviewCard({
  review,
  isDark,
  cardColor,
  textColor,
  secondaryTextColor,
}: {
  review: SessionReview;
  isDark: boolean;
  cardColor: string;
  textColor: string;
  secondaryTextColor: string;
}) {
  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "#10B981";
    if (rating >= 6) return "#3B82F6";
    if (rating >= 4) return "#F59E0B";
    return "#EF4444";
  };

  const getRatingEmoji = (rating: number) => {
    if (rating >= 9) return "🔥";
    if (rating >= 7) return "💪";
    if (rating >= 5) return "👍";
    if (rating >= 3) return "🙂";
    return "😅";
  };

  return (
    <View style={[styles.reviewCard, { backgroundColor: cardColor }]}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewEmoji}>{getRatingEmoji(review.rating)}</Text>
        <View style={styles.reviewRatingInfo}>
          <Text style={[styles.reviewRating, { color: getRatingColor(review.rating) }]}>
            {review.rating}/10
          </Text>
          <Text style={[styles.reviewLabel, { color: secondaryTextColor }]}>Session Rating</Text>
        </View>
      </View>

      <View style={styles.reviewSection}>
        <Text style={[styles.reviewSectionTitle, { color: "#10B981" }]}>✓ Strengths</Text>
        {review.strengths.map((s, i) => (
          <Text key={i} style={[styles.reviewBullet, { color: textColor }]}>• {s}</Text>
        ))}
      </View>

      <View style={styles.reviewSection}>
        <Text style={[styles.reviewSectionTitle, { color: "#F59E0B" }]}>↑ Improve</Text>
        <Text style={[styles.reviewText, { color: textColor }]}>{review.weakness}</Text>
      </View>

      <View style={styles.reviewSection}>
        <Text style={[styles.reviewSectionTitle, { color: "#3B82F6" }]}>📝 Next Session</Text>
        <Text style={[styles.reviewText, { color: textColor, fontStyle: 'italic' }]}>{review.nextSessionNote}</Text>
      </View>
    </View>
  );
}

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
  const cardColor = isDark ? '#1C1C1E' : '#F9FAFB';
  const secondaryTextColor = isDark ? '#9CA3AF' : '#6B7280';

  // Dynamic colors for dark mode
  const setIndicatorBg = isDark ? '#374151' : '#E5E7EB';
  const setIndicatorText = isDark ? '#9CA3AF' : '#6B7280';
  const noteTextColor = isDark ? '#9CA3AF' : '#4B5563';
  const backBtnPressedBg = isDark ? '#374151' : '#E5E7EB';
  const statSepColor = isDark ? '#4B5563' : '#D1D5DB';
  const mutedTextColor = isDark ? '#9CA3AF' : '#6B7280';

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
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16), backgroundColor }]}>
        <Stack.Screen options={{ title: "Workout", headerBackTitle: "Back" }} />
        <Text style={[styles.notFound, { color: mutedTextColor }]}>Workout not found.</Text>
      </View>
    );
  }


  const workoutName = workout.part?.trim() || "Workout";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, backgroundColor }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: backBtnPressedBg }]}>
            <IconSymbol name="chevron.left" size={24} color={textColor} />
          </Pressable>
          <View>
            <Text style={[styles.title, { color: textColor }]}>{workoutName}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

        {/* Session Review Card */}
        {workout.review && (
          <ReviewCard review={workout.review} isDark={isDark} cardColor={cardColor} textColor={textColor} secondaryTextColor={secondaryTextColor} />
        )}

        {groups.length === 0 ? (
          <Text style={[styles.emptyText, { color: mutedTextColor }]}>No exercises logged.</Text>
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
                    <View style={[styles.setIndicator, { backgroundColor: setIndicatorBg }]}>
                      <Text style={[styles.setIndicatorText, { color: setIndicatorText }]}>{setNum}</Text>
                    </View>
                    <View style={styles.setContent}>
                      <View style={styles.statsRow}>
                        <Text style={[styles.statValue, { color: textColor }]}>{row.weightLbs || "—"}</Text>
                        <Text style={[styles.statUnit, { color: secondaryTextColor }]}>lb</Text>
                        <Text style={[styles.statSep, { color: statSepColor }]}>×</Text>
                        <Text style={[styles.statValue, { color: textColor }]}>{row.reps || "—"}</Text>
                        {row.timestamp ? (
                          <Text style={[styles.timestamp, { color: secondaryTextColor }]}>
                            {new Date(row.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>
                      {row.notes ? (
                        <Text style={[styles.noteText, { color: noteTextColor }]}>{row.notes}</Text>
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
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  dateSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  exerciseGroup: {
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
  },
  setCount: {
    fontSize: 13,
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
    alignItems: "center",
    justifyContent: "center",
  },
  setIndicatorText: {
    fontSize: 12,
    fontWeight: "700",
  },
  setContent: {
    flex: 1,
    gap: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
    marginRight: 2,
  },
  statSep: {
    fontSize: 13,
    marginHorizontal: 2,
  },
  notFound: {
    fontSize: 16,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: "400",
    marginLeft: 6,
  },
  noteText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  // Review Card styles
  reviewCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  reviewEmoji: {
    fontSize: 36,
  },
  reviewRatingInfo: {
    flex: 1,
  },
  reviewRating: {
    fontSize: 28,
    fontWeight: '800',
  },
  reviewLabel: {
    fontSize: 12,
  },
  reviewSection: {
    gap: 4,
  },
  reviewSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  reviewBullet: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 4,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 4,
  },
});
