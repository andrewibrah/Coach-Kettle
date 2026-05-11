import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useWindowDimensions, View, StyleSheet } from "react-native";

interface VideoPlaceholderProps {
  label: string;
}

export function VideoPlaceholder({ label }: VideoPlaceholderProps) {
  const { width } = useWindowDimensions();
  const backgroundColor = useThemeColor({}, 'cardBackground');

  const containerHeight = width * (16 / 9);

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height: containerHeight,
          backgroundColor,
        },
      ]}
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
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    overflow: "hidden",
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
