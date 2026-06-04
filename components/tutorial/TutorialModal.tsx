import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import { markTutorialShown } from "@/lib/tutorialState";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GuideVideo } from "./GuideVideo";
import { TutorialSlide } from "./TutorialSlide";

interface TutorialModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const SLIDES = [
  {
    title: "Welcome to Coach Kettle",
    subtitle: "Your AI-powered gym companion",
    body: "Log sets in seconds, track every PR, and get coaching between sets.",
    isFirst: true,
  },
  {
    title: "Start a Session",
    subtitle: "Pick your focus, name your workout",
    body: "Tap the routine icon or just start typing — Coach Kettle creates your session automatically.",
    videoSource: require("@/assets/videos/guide_start_session.mp4"),
  },
  {
    title: "Log Sets Naturally",
    subtitle: "Type it like you'd say it",
    body: '"Bench 185 x 8", "Squat 225 3x5", "Run 20 min 2 miles" — we parse it all instantly.',
    videoSource: require("@/assets/videos/guide_log_set.mp4"),
  },
  {
    title: "Track History & PRs",
    subtitle: "Every rep, every record",
    body: "Browse every workout in History. Hit a new PR? Expect confetti.",
    videoSource: require("@/assets/videos/guide_history_prs.mp4"),
  },
  {
    title: "You're Ready",
    subtitle: "Hit the gym. We've got you.",
    body: "Tap ? any time to revisit this guide.",
    isLast: true,
  },
] as const;

const DOT_SIZE = 8;
const DOT_GAP = 6;

export function TutorialModal({ visible, onDismiss }: TutorialModalProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const onTintColor = useThemeColor({}, 'tintForeground');
  const iconColor = useThemeColor({}, 'icon');

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleDismiss = async () => {
    await markTutorialShown();
    // Reset slide index BEFORE calling onDismiss so state is clean
    // if the parent re-opens the tutorial quickly (e.g. via the help button).
    setCurrentIndex(0);
    onDismiss();
  };

  const goToNext = () => {
    const next = currentIndex + 1;
    if (next < SLIDES.length) {
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    }
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: typeof SLIDES[number]; index: number }) => {
    const visual = 'videoSource' in item
      ? <GuideVideo source={item.videoSource} />
      : undefined;

    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ width }}>
        <TutorialSlide
          title={item.title}
          subtitle={item.subtitle}
          body={item.body}
          placeholder={visual}
          isFirst={'isFirst' in item ? item.isFirst : false}
          isLast={'isLast' in item ? item.isLast : false}
        />
      </Animated.View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={[styles.container, { backgroundColor }]}>
        {/* Skip button — slides 0–3 only */}
        {!isLastSlide && (
          <Pressable
            style={[styles.skipBtn, { top: insets.top + 16 }]}
            onPress={handleDismiss}
            hitSlop={8}
          >
            <ThemedText style={[styles.skipText, { color: iconColor }]}>Skip</ThemedText>
          </Pressable>
        )}

        {/* Slide pager */}
        <FlatList
          ref={flatListRef}
          data={[...SLIDES]}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          renderItem={renderSlide}
          style={styles.flatList}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />

        {/* Page dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentIndex ? tintColor : iconColor,
                  opacity: i === currentIndex ? 1 : 0.35,
                },
              ]}
            />
          ))}
        </View>

        {/* Navigation buttons */}
        <View style={[styles.navRow, { paddingBottom: insets.bottom + 24 }]}>
          {!isLastSlide ? (
            <Pressable
              style={({ pressed }) => [
                styles.nextBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={goToNext}
            >
              <ThemedText style={[styles.nextText, { color: tintColor }]}>
                Next →
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.getStartedBtn,
                { backgroundColor: tintColor, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={handleDismiss}
            >
              <ThemedText style={[styles.getStartedText, { color: onTintColor }]}>Get Started →</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flatList: {
    flex: 1,
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    zIndex: 10,
  },
  skipText: {
    fontSize: 15,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: DOT_GAP,
    marginBottom: 16,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  navRow: {
    alignItems: "center",
    paddingHorizontal: 28,
  },
  nextBtn: {
    alignSelf: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  nextText: {
    fontSize: 17,
    fontWeight: "600",
  },
  getStartedBtn: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    alignSelf: "center",
  },
  getStartedText: {
    fontSize: 17,
    fontWeight: "700",
    color: "white",
  },
});
