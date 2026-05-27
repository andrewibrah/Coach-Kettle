// GuideVideo — safe placeholder used until the expo-video native module is
// compiled into the binary via `npx expo prebuild`.
//
// WHY THIS EXISTS:
//   expo-video's NativeVideoModule calls requireNativeModule('ExpoVideo') at
//   module evaluation time (not at render time). If the native binary doesn't
//   contain the compiled ExpoVideo module, that throws on every app launch —
//   crashing the app before any screen renders.
//
//   The "expo-video" app.json plugin was never committed, so npx expo prebuild
//   never wired up the native module. This placeholder removes that dependency
//   so the build is safe without a native rebuild.
//
// TO RESTORE REAL VIDEO:
//   1. Ensure `expo-video` is in package.json and committed.
//   2. Ensure the `"expo-video"` entry is in the app.json plugins array and committed.
//   3. Run `npx expo prebuild --clean`.
//   4. Rebuild the native binary (eas build / Xcode archive).
//   5. Swap this file back to the real VideoView implementation.

import React from "react";
import { StyleSheet, View } from "react-native";

interface GuideVideoProps {
  source: number; // require()'d asset — unused until native rebuild
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GuideVideo({ source }: GuideVideoProps) {
  return <View style={styles.wrapper} />;
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
});
