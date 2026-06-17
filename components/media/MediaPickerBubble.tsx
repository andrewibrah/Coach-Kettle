/**
 * Horizontal thumbnail row with "+" add button for attaching gym photos/videos.
 * Renders inside SessionReviewModal and history detail.
 * Tap a thumbnail to view full-screen.
 */

import { useThemeColor } from "@/hooks/useThemeColor";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ImageViewerModal } from "@/components/media/ImageViewerModal";

export type MediaThumb = {
  uri: string;
  mediaType: "image" | "video";
  uploading?: boolean;
  error?: string;
};

type Props = {
  items: MediaThumb[];
  onAdd: () => void;
  onRemove?: (index: number) => void;
  disabled?: boolean;
  maxItems?: number;
};

export function MediaPickerBubble({
  items,
  onAdd,
  onRemove,
  disabled = false,
  maxItems = 10,
}: Props) {
  const textColor = useThemeColor({}, "text");
  const cardBg = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const mutedColor = useThemeColor({}, "placeholder");
  const dangerColor = useThemeColor({}, "danger");

  const canAdd = items.length < maxItems && !disabled;

  // Full-screen viewer state
  const [viewerUri, setViewerUri] = useState("");
  const [viewerVisible, setViewerVisible] = useState(false);

  // Track which thumbnails failed to load
  const [failedUris, setFailedUris] = useState<Set<string>>(new Set());

  const handleThumbPress = useCallback((item: MediaThumb) => {
    // Don't open viewer for uploading, missing URI, or broken images
    if (item.uploading || !item.uri || item.error || failedUris.has(item.uri)) return;
    setViewerUri(item.uri);
    setViewerVisible(true);
  }, [failedUris]);

  const handleImageError = useCallback((uri: string) => {
    setFailedUris((prev) => new Set(prev).add(uri));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerIcon, { color: mutedColor }]}>📷</Text>
        <Text style={[styles.headerText, { color: textColor }]}>
          Media
        </Text>
        <Text style={[styles.headerCount, { color: mutedColor }]}>
          {items.length}/{maxItems}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, idx) => {
          const hasFailed = failedUris.has(item.uri);
          const showImage = !item.uploading && !!item.uri && !hasFailed;

          return (
            <View key={idx} style={styles.thumbWrapper}>
              <Pressable
                onPress={() => handleThumbPress(item)}
                style={({ pressed }) => [
                  styles.thumb,
                  { borderColor },
                  pressed && !item.uploading && styles.thumbPressed,
                ]}
              >
                {item.uploading ? (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : showImage ? (
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                    onError={() => handleImageError(item.uri)}
                  />
                ) : (
                  <View style={styles.brokenOverlay}>
                    <Text style={styles.brokenIcon}>!</Text>
                  </View>
                )}
                {item.mediaType === "video" && !item.uploading && (
                  <View style={styles.videoBadge}>
                    <Text style={styles.videoBadgeText}>▶</Text>
                  </View>
                )}
                {item.error && (
                  <View style={[styles.errorBadge, { backgroundColor: dangerColor }]}>
                    <Text style={styles.errorBadgeText}>!</Text>
                  </View>
                )}
              </Pressable>
              {onRemove && !item.uploading && (
                <Pressable
                  onPress={() => onRemove(idx)}
                  style={({ pressed }) => [
                    styles.removeBtn,
                    pressed && { backgroundColor: dangerColor },
                  ]}
                  hitSlop={8}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {canAdd && (
          <Pressable
            onPress={onAdd}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor },
              pressed && styles.addBtnPressed,
            ]}
          >
            <Text style={[styles.addBtnIcon, { color: mutedColor }]}>+</Text>
            <Text style={[styles.addBtnLabel, { color: mutedColor }]}>
              Add
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Full-screen image viewer */}
      <ImageViewerModal
        visible={viewerVisible}
        uri={viewerUri}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

const THUMB_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 14,
  },
  headerText: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  headerCount: {
    fontSize: 13,
    fontWeight: "500",
  },
  scrollContent: {
    gap: 10,
    paddingRight: 4,
  },
  thumbWrapper: {
    position: "relative",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  thumbPressed: {
    opacity: 0.7,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  brokenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(60,60,60,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  brokenIcon: {
    color: "#9CA3AF",
    fontSize: 20,
    fontWeight: "700",
  },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  videoBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
  },
  errorBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  errorBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#374151",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtnPressed: {},
  removeBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  addBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  addBtnPressed: {
    opacity: 0.6,
  },
  addBtnIcon: {
    fontSize: 22,
    fontWeight: "300",
    lineHeight: 24,
  },
  addBtnLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
