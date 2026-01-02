import { Dispatch, SetStateAction } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";


type Props = {
  visible: boolean;
  question: string;
  onChangeQuestion: Dispatch<SetStateAction<string>>;
  loading: boolean;
  answer: string | null;
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
};

export function CoachModal({
  visible,
  question,
  onChangeQuestion,
  loading,
  answer,
  error,
  onSubmit,
  onClose,
}: Props) {
  const disabled = loading || !question.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Coach</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View style={styles.errorBubble}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {answer ? (
              <View style={styles.aiBubble}>
                <Text style={styles.aiText}>{answer}</Text>
              </View>
            ) : null}

            {/* If loading, show a thinking indicator or just keep the input disabled/loading state */}
            {loading && !answer ? (
              <ActivityIndicator style={{ alignSelf: "center", marginTop: 20 }} color="#9CA3AF" />
            ) : null}
          </ScrollView>

          <View style={styles.inputFooter}>
            <TextInput
              value={question}
              onChangeText={onChangeQuestion}
              placeholder="Ask anything..."
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              multiline
              editable={!loading}
            />
            <Pressable
              onPress={onSubmit}
              disabled={disabled}
              style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
            >
              <Text style={styles.sendArrow}>↑</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    height: "80%", // Fixed height to feel like a window
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
    color: "#9CA3AF",
    lineHeight: 24,
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 16,
    flexGrow: 1,
    justifyContent: "flex-end", // Bottom alignment for chat
  },
  aiBubble: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    maxWidth: "85%",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  aiText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
  inputFooter: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: "#111827",
  },
  sendBtn: {
    backgroundColor: "#111827",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2, // Align with text input baseline roughly
  },
  sendBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
  sendArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: -2,
  },
  errorBubble: {
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
  },
});
