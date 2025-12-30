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
} from "react-native";

import { ThemedText } from "@/components/themed-text";

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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ThemedText type="title" style={styles.title}>
            Coach Q&A
          </ThemedText>

          <Text style={styles.label}>Ask a question about your workout</Text>

          <TextInput
            value={question}
            onChangeText={onChangeQuestion}
            placeholder="e.g., How many sets of squats should I do next?"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
            numberOfLines={3}
            editable={!loading}
          />

          <Pressable
            onPress={onSubmit}
            disabled={disabled}
            style={({ pressed }) => [
              styles.submitButton,
              disabled && styles.submitButtonDisabled,
              pressed && !disabled && styles.submitButtonPressed,
            ]}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Ask Coach</Text>}
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <ScrollView style={styles.answerBox} contentContainerStyle={styles.answerContent}>
            {answer ? (
              <Text style={styles.answerText}>{answer}</Text>
            ) : (
              <Text style={styles.placeholderText}>Coach will respond here.</Text>
            )}
          </ScrollView>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: {
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    color: "#4B5563",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonPressed: {
    opacity: 0.9,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
  },
  answerBox: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
  },
  answerContent: {
    padding: 12,
  },
  answerText: {
    fontSize: 14,
    color: "#111827",
  },
  placeholderText: {
    color: "#9CA3AF",
  },
  closeButton: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 12,
    alignItems: "center",
  },
  closePressed: {
    opacity: 0.9,
  },
  closeText: {
    fontWeight: "700",
    color: "#111827",
  },
});
