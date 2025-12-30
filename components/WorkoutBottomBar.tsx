import { Dispatch, SetStateAction } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";

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
  error: string | null;
  aiReason?: string;
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
  error,
  aiReason,
}: Props) {
  const disabledSend = !workoutActive || loading || !messageInput.trim();

  const handleSend = () => {
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

  return (
    <View style={styles.bottomWrap}>
      <View style={[styles.inputRow, !workoutActive && styles.inputRowDisabled]}>
        {!workoutActive ? (
          <Pressable
            onPress={showStartToast}
            style={styles.inputTapCatcher}
            accessibilityRole="button"
            accessibilityLabel="Start a workout to send your first set"
          />
        ) : null}
        <TextInput
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder={workoutActive ? "e.g. Leg press 4 plates 10 reps" : "Start a workout to log sets"}
          style={[styles.input, styles.messageInput]}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={workoutActive && !loading}
        />

        <Pressable
          onPress={handleSend}
          disabled={disabledSend}
          style={({ pressed }) => [
            styles.sendButton,
            disabledSend && styles.sendButtonDisabled,
            pressed && !disabledSend && styles.sendButtonPressed,
          ]}
        >
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </Pressable>
      </View>

      <View style={styles.bottomButtons}>
        <Pressable onPress={goToHistory} style={({ pressed }) => [styles.pillButton, pressed && styles.pillPressed]}>
          <Text style={styles.pillText}>History</Text>
        </Pressable>

        <Pressable
          onPress={workoutActive ? handleEndWorkout : handleStartWorkout}
          style={({ pressed }) => [
            styles.pillButton,
            styles.pillPrimary,
            workoutActive && styles.pillDanger,
            pressed && styles.pillPressed,
          ]}
        >
          <Text style={[styles.pillText, styles.pillPrimaryText]}>
            {workoutActive ? "End" : "Start"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onClearRows}
          disabled={!hasRows}
          style={({ pressed }) => [
            styles.pillButton,
            !hasRows && styles.pillDisabled,
            pressed && hasRows && styles.pillPressed,
          ]}
        >
          <Text style={styles.pillText}>Clear</Text>
        </Pressable>
      </View>

      {startToastOpen ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastCard}>
            <Text style={styles.toastText}>Start a workout to send your first set</Text>
          </View>
        </View>
      ) : null}

      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
      {aiReason ? <ThemedText style={styles.errorHint}>{aiReason}</ThemedText> : null}

      <ThemedText style={styles.hint}>
        {workoutActive
          ? 'Tip: "Exercise Weight Reps" — e.g., Bench 185x8 or Lat Pulldown 120 10.'
          : "Pick a body part, then log sets fast."}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomWrap: {
    marginTop: 10,
    gap: 10,
  },
  inputRow: {
    position: "relative",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
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
    borderColor: "#D6D6D6",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
  },
  messageInput: {
    flex: 1,
  },
  inputRowDisabled: {
    opacity: 0.7,
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#111827",
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  pillPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
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
    color: "#111827",
  },
  pillPrimaryText: {
    color: "#FFFFFF",
  },
  toastWrap: {
    alignItems: "center",
  },
  toastCard: {
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#111827",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#B00020",
  },
  errorHint: {
    color: "#6B7280",
    fontStyle: "italic",
  },
  hint: {
    opacity: 0.7,
  },
});
