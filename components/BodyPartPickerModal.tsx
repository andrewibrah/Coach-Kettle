import { Dispatch, SetStateAction } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { BodyPart } from "@/types/workout";

type Props = {
  visible: boolean;
  isDark: boolean;
  BODY_PARTS: BodyPart[];
  draftBodyParts: BodyPart[];
  setDraftBodyParts: Dispatch<SetStateAction<BodyPart[]>>;
  onCancel: () => void;
  onStart: () => void;
};

export function BodyPartPickerModal({
  visible,
  isDark,
  BODY_PARTS,
  draftBodyParts,
  setDraftBodyParts,
  onCancel,
  onStart,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable style={[styles.modalCard, isDark && styles.modalCardDark]} onPress={() => {}}>
          <ThemedText
            type="title"
            style={[styles.modalTitle, isDark ? styles.modalTextDark : styles.modalTextLight]}
          >
            What body part are you training
          </ThemedText>

          <ScrollView contentContainerStyle={styles.modalList}>
            {BODY_PARTS.map((bp) => {
              const selected = draftBodyParts.includes(bp);
              return (
                <Pressable
                  key={bp}
                  onPress={() => {
                    setDraftBodyParts((prev) =>
                      prev.includes(bp) ? prev.filter((x) => x !== bp) : [...prev, bp]
                    );
                  }}
                  style={[
                    styles.modalItem,
                    isDark && styles.modalItemDark,
                    selected && styles.modalItemSelected,
                    selected && isDark && styles.modalItemSelectedDark,
                  ]}
                >
                  <View style={styles.modalItemRow}>
                    <ThemedText
                      style={[
                        styles.modalItemText,
                        isDark ? styles.modalTextDark : styles.modalTextLight,
                      ]}
                    >
                      {bp}
                    </ThemedText>
                    <View style={[styles.checkDot, selected && styles.checkDotOn]}>
                      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.modalActions}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.modalActionBtn, pressed && styles.pillPressed]}
              >
                <Text style={styles.modalActionText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={onStart}
                disabled={draftBodyParts.length === 0}
                style={({ pressed }) => [
                  styles.modalActionBtn,
                  styles.modalActionPrimary,
                  draftBodyParts.length === 0 && styles.modalActionDisabled,
                  pressed && draftBodyParts.length !== 0 && styles.sendButtonPressed,
                ]}
              >
                <Text style={[styles.modalActionText, styles.modalActionPrimaryText]}>
                  Start workout
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    maxHeight: "70%",
  },
  modalCardDark: {
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  modalTitle: {
    marginBottom: 10,
    textAlign: "center",
  },
  modalList: {
    gap: 8,
    paddingBottom: 6,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 12,
  },
  modalItemDark: {
    borderColor: "#334155",
    backgroundColor: "#111827",
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemText: {
    fontSize: 16,
  },
  modalTextLight: {
    color: "#111827",
  },
  modalTextDark: {
    color: "#F9FAFB",
  },
  modalItemSelected: {
    borderColor: "#111827",
  },
  modalItemSelectedDark: {
    borderColor: "#60A5FA",
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  modalActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  modalActionPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  modalActionDisabled: {
    opacity: 0.5,
  },
  modalActionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  modalActionPrimaryText: {
    color: "#FFFFFF",
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkDotOn: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  checkMark: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  pillPressed: {
    opacity: 0.9,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
});
