import { Dispatch, SetStateAction } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme
} from "react-native";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";


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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = isDark ? "#374151" : "#D6D6D6";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={[styles.card, { backgroundColor, borderColor }]}>
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <ThemedText style={styles.headerTitle}>Coach</ThemedText>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <ThemedText style={styles.closeText}>×</ThemedText>
            </Pressable>
          </View>

          <ScrollView
            style={[styles.chatArea, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {answer ? (
              <ThemedView style={[styles.aiBubble, { backgroundColor, borderColor }]}>
                <ThemedText style={styles.aiText}>{answer}</ThemedText>
              </ThemedView>
            ) : null}

            {/* If loading, show a thinking indicator or just keep the input disabled/loading state */}
            {loading && !answer ? (
              <ActivityIndicator style={{ alignSelf: "center", marginTop: 20 }} color={isDark ? "#9CA3AF" : "#6B7280"} />
            ) : null}
          </ScrollView>

          <ThemedView style={[styles.inputFooter, { backgroundColor, borderTopColor: borderColor }]}>
            <TextInput
              value={question}
              onChangeText={onChangeQuestion}
              placeholder="Ask anything..."
              placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
              style={[styles.input, { backgroundColor: isDark ? "#374151" : "#F3F4F6", color: textColor }]}
              multiline
              editable={!loading}
            />
            <Pressable
              onPress={onSubmit}
              disabled={disabled}
              style={[
                styles.sendBtn, 
                { backgroundColor: isDark ? "#111827" : "#111827" },
                disabled && styles.sendBtnDisabled
              ]}
            >
              <Text style={styles.sendArrow}>↑</Text>
            </Pressable>
          </ThemedView>
        </ThemedView>
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
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
    lineHeight: 24,
    opacity: 0.6,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 16,
    flexGrow: 1,
    justifyContent: "flex-end", // Bottom alignment for chat
  },
  aiBubble: {
    padding: 12,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    maxWidth: "85%",
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  aiText: {
    fontSize: 15,
    lineHeight: 22,
  },
  inputFooter: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2, // Align with text input baseline roughly
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: -2,
  },
});
