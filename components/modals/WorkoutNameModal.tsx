import { useThemeColor } from "@/hooks/useThemeColor";
import {
    fetchTemplateItems,
    fetchWorkoutTemplates,
    type WorkoutTemplate,
    type WorkoutTemplateItem,
} from "@/lib/profile";
import { BlurView } from "expo-blur";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type Props = {
    visible: boolean;
    userId?: string;
    onClose: () => void;
    onConfirm: (name: string) => void;
    onSelectTemplate?: (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => void;
};

export function WorkoutNameModal({ visible, userId, onClose, onConfirm, onSelectTemplate }: Props) {
    const [name, setName] = useState("");
    const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectingTemplateId, setSelectingTemplateId] = useState<string | null>(null);

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const cardBg = useThemeColor({}, 'cardBackground');
    const textColor = useThemeColor({}, 'text');
    const placeholderColor = useThemeColor({}, 'placeholder');
    const borderColor = useThemeColor({}, 'border');
    const inputBg = useThemeColor({}, 'inputBackground');
    const buttonBg = useThemeColor({}, 'inputBackground');
    const primaryBtn = useThemeColor({}, 'text');
    const primaryBtnText = useThemeColor({}, 'background');
    const accentColor = useThemeColor({}, 'tint');

    const loadTemplates = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const data = await fetchWorkoutTemplates(userId);
            setTemplates(data);
        } catch (error) {
            console.error("[WorkoutNameModal] Failed to load templates:", error);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (visible && userId) {
            loadTemplates();
            setName("");
            setSelectingTemplateId(null);
        }
    }, [visible, userId, loadTemplates]);

    const handleConfirm = () => {
        if (!name.trim()) return;
        onConfirm(name.trim());
        setName("");
    };

    const handleSelectTemplate = async (template: WorkoutTemplate) => {
        if (!onSelectTemplate) {
            // Just use template name if no handler provided
            onConfirm(template.name);
            setName("");
            return;
        }

        setSelectingTemplateId(template.id);
        try {
            const items = await fetchTemplateItems(template.id);
            onSelectTemplate(template, items);
            onClose();
        } catch (error) {
            console.error("[WorkoutNameModal] Failed to load template items:", error);
        } finally {
            setSelectingTemplateId(null);
        }
    };

    const renderTemplate = ({ item: template }: { item: WorkoutTemplate }) => {
        const isSelecting = selectingTemplateId === template.id;

        return (
            <Pressable
                onPress={() => handleSelectTemplate(template)}
                disabled={isSelecting}
                style={({ pressed }) => [
                    styles.templateItem,
                    { backgroundColor: inputBg },
                    pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Load routine ${template.name}`}
            >
                <Text style={[styles.templateName, { color: textColor }]}>
                    {template.name}
                </Text>
                {isSelecting && (
                    <ActivityIndicator size="small" color={accentColor} />
                )}
            </Pressable>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.container}
                >
                    <View style={[styles.card, { backgroundColor: cardBg }]}>
                        <Text style={[styles.title, { color: textColor }]}>Name your workout</Text>

                        <TextInput
                            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
                            placeholder="e.g. Leg Day"
                            placeholderTextColor={placeholderColor}
                            value={name}
                            onChangeText={setName}
                            autoFocus
                            onSubmitEditing={handleConfirm}
                            returnKeyType="done"
                        />

                        {/* Template quick-start section */}
                        {templates.length > 0 && (
                            <View style={styles.templateSection}>
                                <Text style={[styles.templateSectionTitle, { color: placeholderColor }]}>
                                    Or start from a routine
                                </Text>
                                <FlatList
                                    data={templates}
                                    renderItem={renderTemplate}
                                    keyExtractor={(item) => item.id}
                                    style={styles.templateList}
                                    showsVerticalScrollIndicator={false}
                                    scrollEnabled={templates.length > 3}
                                />
                            </View>
                        )}

                        {loading && templates.length === 0 && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color={accentColor} />
                            </View>
                        )}

                        <View style={styles.buttonRow}>
                            <Pressable onPress={onClose} style={[styles.cancelButton, { backgroundColor: buttonBg }]} accessibilityRole="button" accessibilityLabel="Cancel">
                                <Text style={[styles.cancelText, { color: textColor }]}>Cancel</Text>
                            </Pressable>

                            <Pressable
                                onPress={handleConfirm}
                                style={[styles.confirmButton, { backgroundColor: primaryBtn }, !name.trim() && styles.disabled]}
                                disabled={!name.trim()}
                                accessibilityRole="button"
                                accessibilityLabel="Start workout"
                                accessibilityState={{ disabled: !name.trim() }}
                            >
                                <Text style={[styles.confirmText, { color: primaryBtnText }]}>Start</Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    card: {
        width: "100%",
        maxWidth: 320,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 24,
        gap: 16,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
    },
    input: {
        borderRadius: 14,
        padding: 16,
        fontSize: 16,
        borderWidth: 1,
    },
    templateSection: {
        gap: 8,
    },
    templateSectionTitle: {
        fontSize: 13,
        fontWeight: "500",
        textAlign: "center",
    },
    templateList: {
        maxHeight: 150,
    },
    templateItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        marginBottom: 6,
    },
    templateName: {
        fontSize: 15,
        fontWeight: "500",
    },
    loadingContainer: {
        paddingVertical: 12,
        alignItems: "center",
    },
    buttonRow: {
        flexDirection: "row",
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
    },
    cancelText: {
        fontWeight: "600",
        fontSize: 16,
    },
    confirmButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
    },
    confirmText: {
        fontWeight: "600",
        fontSize: 16,
    },
    disabled: {
        opacity: 0.5,
    },
});
