/**
 * Full-screen image viewer modal.
 * Shows loading spinner while image loads.
 * Tap anywhere or press X to close.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/useThemeColor";

type Props = {
  visible: boolean;
  uri: string;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export function ImageViewerModal({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const dangerColor = useThemeColor({}, "danger");
  const placeholderColor = useThemeColor({}, "placeholder");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap background to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        {/* Loading spinner */}
        {loading && !error && (
          <ActivityIndicator
            size="large"
            color="#FFFFFF"
            style={styles.loader}
          />
        )}

        {/* Error message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorIcon, { color: dangerColor }]}>!</Text>
            <Text style={styles.errorText}>Failed to load image</Text>
            <Text style={[styles.errorSubtext, { color: placeholderColor }]}>
              The signed URL may have expired.{"\n"}Try closing and reopening this workout.
            </Text>
          </View>
        )}

        {/* Image */}
        {!error && (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={() => { setLoading(true); setError(false); }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  loader: {
    position: "absolute",
    zIndex: 5,
  },
  errorContainer: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  errorIcon: {
    fontSize: 40,
    fontWeight: "700",
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  image: {
    width: SCREEN_W - 32,
    height: SCREEN_H * 0.7,
  },
});
