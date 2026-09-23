import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

import { computeLargeTextLayout, type LargeTextLayout } from "@/lib/largeTextLayout";

export {
  LARGE_TEXT_SCALE,
  HUGE_TEXT_SCALE,
  computeLargeTextLayout,
  type LargeTextLayout,
} from "@/lib/largeTextLayout";

/** Reactive Dynamic Type layout flags for the current window. */
export function useLargeTextLayout(): LargeTextLayout {
  const { fontScale } = useWindowDimensions();
  return useMemo(() => computeLargeTextLayout(fontScale), [fontScale]);
}
