import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

// expo-video calls requireNativeModule('ExpoVideo') at module-evaluation time,
// which throws on any binary built before the module was compiled in (this
// crashed the app once already — see 56acc77). Optional require keeps the
// tutorial alive with a dark placeholder on stale binaries instead of crashing.
let expoVideo: typeof import("expo-video") | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoVideo = require("expo-video");
} catch {
  expoVideo = null;
}

interface GuideVideoProps {
  source: number; // require()'d local asset
  startTime?: number; // seconds to begin playback (default 0)
  endTime?: number;   // seconds to loop back to startTime (default: end of video)
}

export function GuideVideo(props: GuideVideoProps) {
  if (!expoVideo) return <View style={styles.wrapper} />;
  return <PlayerVideo {...props} />;
}

function PlayerVideo({ source, startTime = 0, endTime }: GuideVideoProps) {
  const { useVideoPlayer, VideoView } = expoVideo!;
  const player = useVideoPlayer(source, (p) => {
    p.loop = !endTime;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
    if (startTime > 0) {
      p.currentTime = startTime;
    }
    p.play();
  });

  useEffect(() => {
    if (!endTime) return;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= endTime) {
        player.currentTime = startTime;
        player.play();
      }
    });
    return () => sub.remove();
  }, [player, startTime, endTime]);

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
