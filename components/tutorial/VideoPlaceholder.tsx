import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { View, StyleSheet } from "react-native";

interface VideoPlaceholderProps {
  label: string;
}

export function VideoPlaceholder({ label }: VideoPlaceholderProps) {
  return (
    <View
      style={styles.container}
    >
      <View style={styles.playCircle}>
        <IconSymbol name="play.fill" size={24} color="white" />
      </View>
      <ThemedText style={styles.caption}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '90%',
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: '#1c1c1e',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    marginTop: 12,
    fontSize: 12,
    opacity: 0.5,
    color: "white",
  },
});
