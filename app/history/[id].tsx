import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthProvider";
import { MediaPickerBubble, type MediaThumb } from "@/components/media/MediaPickerBubble";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { api } from "@/lib/api";
import {
  deleteMedia,
  getMediaSignedUrls,
  getSignedUrl,
  pickMedia,
  uploadAndRecordMedia,
} from "@/lib/mediaUpload";
import {
  type SessionReview,
  type WorkoutMediaRecord,
  type WorkoutRow,
  type WorkoutSession,
} from "@/lib/workoutStorage";

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

function getRatingColor(rating: number) {
  if (rating >= 8) return "#10B981";
  if (rating >= 6) return "#3B82F6";
  if (rating >= 4) return "#F59E0B";
  return "#EF4444";
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
  const [showReview, setShowReview] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id;

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
  const inputBg = isDark ? '#2C2C2E' : '#FFFFFF';
  const borderColor = isDark ? '#3A3A3C' : '#E5E7EB';

  // Reflection state
  const [reflection, setReflection] = useState("");
  const [reflectionEditing, setReflectionEditing] = useState(false);
  const [reflectionSaving, setReflectionSaving] = useState(false);

  // Media state
  const [mediaThumbs, setMediaThumbs] = useState<(MediaThumb & { id?: string; storagePath?: string })[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const all: WorkoutSession[] = await api.getHistory();
        const found = all.find((w) => w.id === id) ?? null;
        setWorkout(found);

        if (found) {
          setReflection(found.reflection ?? "");

          // Load media thumbnails with signed URLs
          if (found.media && found.media.length > 0) {
            // Always generate fresh client-side signed URLs for reliability.
            // Server-provided URLs may be stale/missing if edge function wasn't redeployed.
            const allPaths = found.media.map((m: WorkoutMediaRecord) => m.storage_path);
            const urls = await getMediaSignedUrls(allPaths);

            const resolvedCount = Object.keys(urls).length;
            if (resolvedCount === 0 && allPaths.length > 0) {
              // Surface the error visually so we can debug
              console.warn("[WorkoutDetail] All signed URLs failed. Paths:", allPaths);
              Alert.alert(
                "Media Load Issue",
                `Could not generate signed URLs for ${allPaths.length} media file(s).\n\nPath: ${allPaths[0]}\n\nThis usually means the storage bucket or RLS policies need to be set up. Run:\n  supabase db push`,
              );
            }

            const thumbs = found.media.map((m: WorkoutMediaRecord) => ({
              id: m.id,
              uri: urls[m.storage_path] ?? m.signed_url ?? "",
              storagePath: m.storage_path,
              mediaType: m.media_type as 'image' | 'video',
            }));
            setMediaThumbs(thumbs);
          }
        }
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

  const handleSaveReflection = useCallback(async () => {
    if (!id) return;
    setReflectionSaving(true);
    try {
      await api.updateWorkoutMeta(id, { reflection: reflection.trim() });
      setReflectionEditing(false);
    } catch (err) {
      console.error("[WorkoutDetail] Failed to save reflection:", err);
      Alert.alert("Error", "Could not save reflection. Please try again.");
    } finally {
      setReflectionSaving(false);
    }
  }, [id, reflection]);

  const handleAddMedia = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const assets = await pickMedia(mediaThumbs.length);
      if (assets.length === 0) return;

      const newThumbs = assets.map((a) => ({
        uri: a.uri || "",
        mediaType: (a.type?.startsWith("video") ? "video" : "image") as 'image' | 'video',
        uploading: true,
      }));

      setMediaThumbs((prev) => [...prev, ...newThumbs]);

      const startIdx = mediaThumbs.length;
      await Promise.allSettled(
        assets.map(async (asset, i) => {
          try {
            const result = await uploadAndRecordMedia(asset, userId, id);
            // Get a signed URL so the thumbnail displays the remote file
            // instead of the stale local picker URI.
            const signedUrl = await getSignedUrl(result.storagePath);
            setMediaThumbs((prev) => {
              const next = [...prev];
              const targetIdx = startIdx + i;
              if (next[targetIdx]) {
                next[targetIdx] = {
                  ...next[targetIdx],
                  uploading: false,
                  storagePath: result.storagePath,
                  // Prefer signed URL; keep local URI as fallback
                  uri: signedUrl || next[targetIdx].uri,
                };
              }
              return next;
            });
          } catch (err) {
            console.error("[WorkoutDetail] Upload failed:", err);
            setMediaThumbs((prev) => {
              const next = [...prev];
              const targetIdx = startIdx + i;
              if (next[targetIdx]) {
                next[targetIdx] = {
                  ...next[targetIdx],
                  uploading: false,
                  error: "Upload failed",
                };
              }
              return next;
            });
          }
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access photos";
      Alert.alert("Media Error", msg);
    }
  }, [mediaThumbs.length, userId, id]);

  const handleRemoveMedia = useCallback(async (index: number) => {
    const item = mediaThumbs[index];
    if (item?.id && item?.storagePath) {
      try {
        await deleteMedia(item.id, item.storagePath);
      } catch (err) {
        console.error("[WorkoutDetail] Delete media failed:", err);
      }
    }
    setMediaThumbs((prev) => prev.filter((_, i) => i !== index));
  }, [mediaThumbs]);

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
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: textColor }]}>{workoutName}</Text>
          </View>
          {workout.review && (
            <Pressable
              onPress={() => setShowReview(!showReview)}
              style={({ pressed }) => [
                styles.reviewToggleBtn,
                {
                  backgroundColor: showReview
                    ? getRatingColor(workout.review!.rating) + '20'
                    : isDark ? '#1C1C1E' : '#F3F4F6',
                  borderColor: showReview
                    ? getRatingColor(workout.review!.rating)
                    : isDark ? '#374151' : '#D1D5DB',
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.reviewToggleRating, { color: getRatingColor(workout.review!.rating) }]}>
                {workout.review!.rating}/10
              </Text>
              <Text style={[styles.reviewToggleLabel, { color: secondaryTextColor }]}>
                {showReview ? 'Hide Review' : 'Workout Review'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Session Review Card — toggled by header button */}
        {workout.review && showReview && (
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

        {/* ── Media Gallery ── */}
        {(mediaThumbs.length > 0 || userId) && (
          <View style={[styles.mediaSection, { backgroundColor: cardColor }]}>
            <MediaPickerBubble
              items={mediaThumbs}
              onAdd={handleAddMedia}
              onRemove={handleRemoveMedia}
            />
          </View>
        )}

        {/* ── Reflection Card ── */}
        <View style={[styles.reflectionCard, { backgroundColor: cardColor }]}>
          <View style={styles.reflectionHeader}>
            <Text style={[styles.reflectionIcon, { color: mutedTextColor }]}>💭</Text>
            <Text style={[styles.reflectionTitle, { color: textColor }]}>Reflection</Text>
            {!reflectionEditing && (
              <Pressable
                onPress={() => setReflectionEditing(true)}
                style={({ pressed }) => [styles.reflectionEditBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.reflectionEditText, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>
                  {reflection ? 'Edit' : 'Add'}
                </Text>
              </Pressable>
            )}
          </View>

          {reflectionEditing ? (
            <View style={styles.reflectionEditArea}>
              <TextInput
                style={[
                  styles.reflectionInput,
                  { color: textColor, backgroundColor: inputBg, borderColor },
                ]}
                value={reflection}
                onChangeText={setReflection}
                placeholder="How did the session feel? Any notes for next time..."
                placeholderTextColor={mutedTextColor}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={2000}
                autoFocus
              />
              <View style={styles.reflectionActions}>
                <Pressable
                  onPress={() => {
                    setReflection(workout.reflection ?? "");
                    setReflectionEditing(false);
                  }}
                  style={({ pressed }) => [styles.reflectionActionBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.reflectionCancelText, { color: mutedTextColor }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveReflection}
                  disabled={reflectionSaving}
                  style={({ pressed }) => [
                    styles.reflectionActionBtn,
                    styles.reflectionSaveBtn,
                    { backgroundColor: isDark ? '#FFFFFF' : '#111827' },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  {reflectionSaving ? (
                    <ActivityIndicator size="small" color={isDark ? '#111827' : '#FFFFFF'} />
                  ) : (
                    <Text style={[styles.reflectionSaveText, { color: isDark ? '#111827' : '#FFFFFF' }]}>
                      Save
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : reflection ? (
            <Text style={[styles.reflectionBody, { color: textColor }]}>{reflection}</Text>
          ) : (
            <Text style={[styles.reflectionEmpty, { color: mutedTextColor }]}>
              No reflection added yet.
            </Text>
          )}
        </View>
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
  reviewToggleBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 80,
  },
  reviewToggleRating: {
    fontSize: 14,
    fontWeight: '800',
  },
  reviewToggleLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
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
  // Media section
  mediaSection: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  // Reflection card
  reflectionCard: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  reflectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reflectionIcon: {
    fontSize: 14,
  },
  reflectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  reflectionEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reflectionEditText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reflectionBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  reflectionEmpty: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  reflectionEditArea: {
    gap: 10,
  },
  reflectionInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  reflectionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  reflectionActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reflectionCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reflectionSaveBtn: {
    minWidth: 60,
    alignItems: 'center',
  },
  reflectionSaveText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
