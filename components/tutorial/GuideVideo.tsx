import { useVideoPlayer, VideoView } from "expo-video";
import React from "react";
import { StyleSheet, View } from "react-native";

interface GuideVideoProps {
  source: number; // require()'d local asset
}

export function GuideVideo({ source }: GuideVideoProps) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <View style={styles.wrapper}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: "90%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1c1c1e",
  },
  video: { flex: 1 },
});
