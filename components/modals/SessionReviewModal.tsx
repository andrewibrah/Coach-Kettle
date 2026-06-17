import { MediaPickerBubble, type MediaThumb } from "@/components/media/MediaPickerBubble";
import { ReflectionInput } from "@/components/media/ReflectionInput";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/useThemeColor";
import { accentColor as themeAccent } from "@/constants/theme";
import { getSignedUrl, pickMedia, uploadAndRecordMedia } from "@/lib/mediaUpload";
import { SessionReview } from "@/lib/workoutStorage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  loading: boolean;
  review: SessionReview | null;
  workoutTitle: string;
  workoutId?: string | null;
  userId?: string;
  onClose: () => void;
  onSaveReflection?: (reflection: string) => void;
};

export function SessionReviewModal({
  visible,
  loading,
  review,
  workoutTitle,
  workoutId,
  userId,
  onClose,
  onSaveReflection,
}: Props) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const subtextColor = useThemeColor({}, "placeholder");
  const cardBg = useThemeColor({}, "secondaryBackground");
  const doneButtonBg = useThemeColor({}, "text");
  const doneButtonTextColor = useThemeColor({}, "background");
  const accentColor = useThemeColor({}, "success");
  const warningColor = useThemeColor({}, "warning");
  const dangerThemeColor = useThemeColor({}, "danger");

  // Reflection + media state
  const [reflection, setReflection] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaThumb[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset internal state when modal closes so next session starts clean.
  const prevVisible = useRef(visible);
  useEffect(() => {
    if (prevVisible.current && !visible) {
      setReflection('');
      setMediaItems([]);
    }
    prevVisible.current = visible;
  }, [visible]);

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return accentColor;
    if (rating >= 6) return themeAccent(isDark);
    if (rating >= 4) return warningColor;
    return dangerThemeColor;
  };

  // Format today's date
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const handleAddMedia = useCallback(async () => {
    try {
      const assets = await pickMedia(mediaItems.length);
      if (assets.length === 0) return;

      // Add thumbnails immediately with local URIs
      const newThumbs: MediaThumb[] = assets.map((a) => ({
        uri: a.uri || "",
        mediaType: a.type?.startsWith("video") ? "video" : "image",
        uploading: true,
      }));

      setMediaItems((prev) => [...prev, ...newThumbs]);

      // Upload each in parallel (if workoutId + userId available)
      if (workoutId && userId) {
        const startIdx = mediaItems.length;
        await Promise.allSettled(
          assets.map(async (asset, i) => {
            try {
              const result = await uploadAndRecordMedia(asset, userId, workoutId);
              const signedUrl = await getSignedUrl(result.storagePath);
              setMediaItems((prev) => {
                const next = [...prev];
                const targetIdx = startIdx + i;
                if (next[targetIdx]) {
                  next[targetIdx] = {
                    ...next[targetIdx],
                    uploading: false,
                    uri: signedUrl || next[targetIdx].uri,
                  };
                }
                return next;
              });
            } catch (err) {
              console.error("[SessionReview] Upload failed:", err);
              setMediaItems((prev) => {
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
      } else {
        // No workoutId yet — just mark as done (local only)
        setMediaItems((prev) =>
          prev.map((item) => (item.uploading ? { ...item, uploading: false } : item))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access photos";
      Alert.alert("Media Error", msg);
    }
  }, [mediaItems.length, workoutId, userId]);

  const handleRemoveMedia = useCallback((index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDone = useCallback(async () => {
    const trimmed = reflection.trim();
    if (trimmed && onSaveReflection) {
      setSaving(true);
      try {
        onSaveReflection(trimmed);
      } finally {
        setSaving(false);
      }
    }
    // Reset local state
    setReflection("");
    setMediaItems([]);
    onClose();
  }, [reflection, onSaveReflection, onClose]);

  return (
    <Modal visible={visible} animationType="slide">
      <ThemedView
        style={[
          styles.container,
          { backgroundColor, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleDone}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          >
            <IconSymbol name="xmark" size={24} color={iconColor} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Session Review</Text>
            <Text style={[styles.headerSubtitle, { color: subtextColor }]}>
              {workoutTitle} · {dateStr}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={textColor} />
            <ThemedText style={styles.loadingText}>
              Analyzing your workout...
            </ThemedText>
          </View>
        ) : review ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

              {/* Rating */}
              <View style={[styles.ratingCard, { backgroundColor: cardBg }]}>
                <ThemedText style={styles.ratingLabel}>Session Rating</ThemedText>
                <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(review.rating) }]}>
                  <Text style={styles.ratingValue}>{review.rating}/10</Text>
                </View>
              </View>

              {/* Strengths */}
              <View style={[styles.section, { backgroundColor: cardBg }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionIcon, { color: accentColor }]}>
                    ✓
                  </Text>
                  <ThemedText style={styles.sectionTitle}>Strengths</ThemedText>
                </View>
                {review.strengths.map((strength, index) => (
                  <View key={index} style={styles.bulletItem}>
                    <Text style={[styles.bullet, { color: accentColor }]}>•</Text>
                    <ThemedText style={styles.bulletText}>{strength}</ThemedText>
                  </View>
                ))}
              </View>

              {/* Weakness */}
              <View style={[styles.section, { backgroundColor: cardBg }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionIcon, { color: warningColor }]}>
                    ↑
                  </Text>
                  <ThemedText style={styles.sectionTitle}>
                    Area to Improve
                  </ThemedText>
                </View>
                <ThemedText style={styles.weaknessText}>
                  {review.weakness}
                </ThemedText>
              </View>

              {/* Next Session Note */}
              <View style={[styles.section, { backgroundColor: cardBg }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionIcon, { color: themeAccent(isDark) }]}>
                    📝
                  </Text>
                  <ThemedText style={styles.sectionTitle}>
                    For Next Session
                  </ThemedText>
                </View>
                <ThemedText style={styles.noteText}>
                  {review.nextSessionNote}
                </ThemedText>
              </View>

              {/* ── NEW: Media Picker ── */}
              <MediaPickerBubble
                items={mediaItems}
                onAdd={handleAddMedia}
                onRemove={handleRemoveMedia}
              />

              {/* ── NEW: Session Reflection ── */}
              <ReflectionInput
                value={reflection}
                onChangeText={setReflection}
              />

              {/* Done Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.doneButton,
                  { backgroundColor: doneButtonBg },
                  pressed && styles.doneButtonPressed,
                  saving && styles.doneButtonDisabled,
                ]}
                onPress={handleDone}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={doneButtonTextColor} />
                ) : (
                  <Text style={[styles.doneButtonText, { color: doneButtonTextColor }]}>Done</Text>
                )}
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>
                Workout saved. The AI review could not be generated — tap Close to continue.
              </ThemedText>

              {/* Still show media + reflection even without AI review */}
              <View style={styles.errorMediaSection}>
                <MediaPickerBubble
                  items={mediaItems}
                  onAdd={handleAddMedia}
                  onRemove={handleRemoveMedia}
                />
                <ReflectionInput
                  value={reflection}
                  onChangeText={setReflection}
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.doneButton,
                  { backgroundColor: doneButtonBg },
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={handleDone}
              >
                <Text style={[styles.doneButtonText, { color: doneButtonTextColor }]}>Close</Text>
              </Pressable>
            </View>
          )}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnPressed: {
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 4,
  },
  headerSpacer: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  content: {
    padding: 20,
    paddingTop: 4,
    gap: 16,
  },
  ratingCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  ratingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  section: {
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  bulletItem: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 15,
    fontWeight: "600",
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  weaknessText: {
    fontSize: 15,
    lineHeight: 22,
    paddingLeft: 4,
  },
  noteText: {
    fontSize: 15,
    lineHeight: 22,
    paddingLeft: 4,
  },
  doneButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  doneButtonPressed: {
    opacity: 0.8,
  },
  doneButtonDisabled: {
    opacity: 0.6,
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: "700",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 20,
  },
  errorMediaSection: {
    width: "100%",
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
  },
});
