import { IconSymbol } from "@/components/ui/icon-symbol";
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
  const iconColor = useThemeColor({}, "icon");
  const subtextColor = useThemeColor({}, "placeholder");
  const cardBg = isDark ? "#1C1C1E" : "#F3F4F6";
  const doneButtonBg = isDark ? "#FFFFFF" : "#111827";
  const doneButtonTextColor = isDark ? "#111827" : "#FFFFFF";
  const accentColor = "#10B981"; // Green for positive
  const warningColor = "#F59E0B"; // Orange for improvement

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "#10B981"; // Green
    if (rating >= 6) return "#3B82F6"; // Blue
    if (rating >= 4) return "#F59E0B"; // Orange
    return "#EF4444"; // Red
  };

  // Format today's date
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

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
            onPress={onClose}
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
                  { backgroundColor: doneButtonBg },
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={onClose}
              >
                <Text style={[styles.doneButtonText, { color: doneButtonTextColor }]}>Done</Text>
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
                  { backgroundColor: doneButtonBg },
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={onClose}
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
  errorText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
  },
});
