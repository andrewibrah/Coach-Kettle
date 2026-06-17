import { Dispatch, SetStateAction } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Haptics from "expo-haptics";
import { useThemeColor } from "@/hooks/useThemeColor";



type Props = {
  workoutActive: boolean;
  loading: boolean;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  sendMessage: () => void;
  onStartWorkout: () => void;
  onEndWorkout: () => void;
  onClearRows: () => void;
  goToHistory: () => void;
  hasRows: boolean;
  startToastOpen: boolean;
  showStartToast: () => void;
};

export function WorkoutBottomBar({
  workoutActive,
  loading,
  messageInput,
  setMessageInput,
  sendMessage,
  onStartWorkout,
  onEndWorkout,
  onClearRows,
  goToHistory,
  hasRows,
  startToastOpen,
  showStartToast,
}: Props) {
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const placeholder = useThemeColor({}, 'placeholder');
  const inputBg = useThemeColor({}, 'inputBackground');
  const borderColor = useThemeColor({}, 'border');

  const disabledSend = !workoutActive || loading || !messageInput.trim();

  const handleSend = () => {
    // Debug log to trace button presses
    if (disabledSend) return;
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    sendMessage();
  };

  const handleStartWorkout = () => {
    if (Platform.OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onStartWorkout();
  };

  const handleEndWorkout = () => {
    if (Platform.OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onEndWorkout();
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 10 }]}>
      {/* Clear Button - Top Right */}


      <View style={[styles.inputRow, !workoutActive && styles.inputRowDisabled]}>
        {!workoutActive ? (
          <Pressable
            onPress={onStartWorkout}
            style={styles.inputTapCatcher}
            accessibilityRole="button"
            accessibilityLabel="Start a workout to send your first set"
          />
        ) : null}
        <TextInput
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder={workoutActive ? "Exercise  lbs  reps" : "Start a workout to log sets"}
          placeholderTextColor={placeholder}
          style={[
            styles.input,
            styles.messageInput,
            { color: textColor, backgroundColor: inputBg, borderColor: borderColor }
          ]}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={workoutActive && !loading}
        />
      </View>

      <View style={styles.bottomButtons}>
        <Pressable
          onPress={workoutActive ? handleEndWorkout : handleStartWorkout}
          style={({ pressed }) => [
            styles.pillButton,
            { backgroundColor: textColor, borderColor: textColor },
            workoutActive && styles.pillDanger,
            pressed && styles.pillPressed,
          ]}
        >
          <Text style={[styles.pillText, { color: workoutActive ? '#FFFFFF' : bgColor }]}>
            {workoutActive ? "End" : "Start"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSend}
          style={({ pressed }) => [
            styles.pillButton,
            { backgroundColor: textColor, borderColor: textColor },
            disabledSend && styles.pillDisabled,
            pressed && !disabledSend && styles.pillPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={bgColor} />
          ) : (
            <Text style={[styles.pillText, { color: bgColor }]}>Send</Text>
          )}
        </Pressable>
      </View>

      {startToastOpen ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastCard}>
            <Text style={[styles.toastText, { color: textColor }]}>Start a workout to send your first set</Text>
          </View>
        </View>
      ) : null}

    </View >
  );
}

const styles = StyleSheet.create({
  bottomWrap: {
    marginTop: 10,
    gap: 10,
    paddingHorizontal: 16,
  },
  inputRow: {
    position: "relative",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearBtnPressed: {
    opacity: 0.6,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  inputTapCatcher: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  messageInput: {
    flex: 1,
  },
  inputRowDisabled: {
    opacity: 0.7,
  },
  sendButtonPill: {
    // backgroundColor and borderColor set dynamically via isDark inline styles
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    // backgroundColor and borderColor set dynamically via isDark inline styles
  },
  pillPrimary: {
    // backgroundColor and borderColor set dynamically via isDark inline styles
  },
  pillDanger: {
    backgroundColor: "#B91C1C",
    borderColor: "#B91C1C",
  },
  pillDisabled: {
    opacity: 0.45,
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    // color set dynamically via isDark inline styles
  },
  pillPrimaryText: {
    // color set dynamically via isDark inline styles
  },
  toastWrap: {
    position: "absolute",
    top: -200,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toastCard: {
    // transparent
  },
  toastText: {
    fontSize: 18,
    fontWeight: "600",
    // color set dynamically via isDark inline styles
  },
  errorText: {
    color: "#B00020",
  },
  hint: {
    opacity: 0.7,
  },
});
