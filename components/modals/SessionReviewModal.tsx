import { ScreenHeader } from "@/components/ui/screen-header";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { SessionReview } from "@/lib/workoutStorage";
import React from "react";
import {
  ActivityIndicator,
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
  onClose: () => void;
};

export function SessionReviewModal({
  visible,
  loading,
  review,
  workoutTitle,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardBg = isDark ? "#1C1C1E" : "#F3F4F6";
  const accentColor = "#10B981"; // Green for positive
  const warningColor = "#F59E0B"; // Orange for improvement

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "#10B981"; // Green
    if (rating >= 6) return "#3B82F6"; // Blue
    if (rating >= 4) return "#F59E0B"; // Orange
    return "#EF4444"; // Red
  };

  const getRatingEmoji = (rating: number) => {
    if (rating >= 9) return "🔥";
    if (rating >= 7) return "💪";
    if (rating >= 5) return "👍";
    if (rating >= 3) return "🙂";
    return "😅";
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ThemedView
          style={[
            styles.container,
            { backgroundColor, paddingBottom: insets.bottom + 20 },
          ]}
        >
          {/* Header */}
          <ScreenHeader
            title="Session Review"
            onBack={onClose}
          />

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
            >
              {/* Workout Title */}
              <ThemedText style={styles.workoutTitle}>{workoutTitle}</ThemedText>

              {/* Rating */}
              <View style={[styles.ratingCard, { backgroundColor: cardBg }]}>
                <Text style={styles.ratingEmoji}>
                  {getRatingEmoji(review.rating)}
                </Text>
                <View style={styles.ratingInfo}>
                  <Text
                    style={[
                      styles.ratingValue,
                      { color: getRatingColor(review.rating) },
                    ]}
                  >
                    {review.rating}/10
                  </Text>
                  <ThemedText style={styles.ratingLabel}>
                    Session Rating
                  </ThemedText>
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
                  <Text style={[styles.sectionIcon, { color: "#3B82F6" }]}>
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

              {/* Done Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.doneButton,
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={onClose}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>
                Could not generate review. Your workout has been saved.
              </ThemedText>
              <Pressable
                style={({ pressed }) => [
                  styles.doneButton,
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={onClose}
              >
                <Text style={styles.doneButtonText}>Close</Text>
              </Pressable>
            </View>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },

  loadingContainer: {
    padding: 60,
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  content: {
    padding: 20,
    paddingTop: 8,
    gap: 16,
  },
  workoutTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 8,
  },
  ratingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  ratingEmoji: {
    fontSize: 48,
  },
  ratingInfo: {
    flex: 1,
  },
  ratingValue: {
    fontSize: 36,
    fontWeight: "800",
  },
  ratingLabel: {
    fontSize: 14,
    opacity: 0.7,
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
    fontSize: 18,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  bulletItem: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 16,
    fontWeight: "700",
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
    fontStyle: "italic",
  },
  doneButton: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  doneButtonPressed: {
    opacity: 0.8,
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  errorContainer: {
    padding: 40,
    alignItems: "center",
    gap: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
  },
});
