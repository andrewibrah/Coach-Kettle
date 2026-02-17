import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  deleteWorkoutTemplate,
  fetchTemplateItems,
  fetchWorkoutTemplates,
  type WorkoutTemplate,
  type WorkoutTemplateItem,
} from "@/lib/profile";
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useState } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSelectTemplate: (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => void;
};

export function RoutineModal({ visible, userId, onClose, onSelectTemplate }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const cardBg = useThemeColor({}, "cardBackground");
  const textColor = useThemeColor({}, "text");
  const subtextColor = useThemeColor({}, "placeholder");
  const borderColor = useThemeColor({}, "border");
  const accentColor = useThemeColor({}, "tint");

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, WorkoutTemplateItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkoutTemplates(userId);
      setTemplates(data);
    } catch (error) {
      console.error("[RoutineModal] Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      loadTemplates();
      setExpandedId(null);
      setExpandedItems({});
    }
  }, [visible, loadTemplates]);

  const handleExpand = async (templateId: string) => {
    if (expandedId === templateId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(templateId);

    if (!expandedItems[templateId]) {
      setLoadingItems(templateId);
      try {
        const items = await fetchTemplateItems(templateId);
        setExpandedItems((prev) => ({ ...prev, [templateId]: items }));
      } catch (error) {
        console.error("[RoutineModal] Failed to load items:", error);
      } finally {
        setLoadingItems(null);
      }
    }
  };

  const handleDelete = (template: WorkoutTemplate) => {
    Alert.alert(
      "Delete Routine?",
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteWorkoutTemplate(template.id);
              setTemplates((prev) => prev.filter((t) => t.id !== template.id));
            } catch (error) {
              console.error("[RoutineModal] Failed to delete template:", error);
            }
          },
        },
      ]
    );
  };

  const handleSelect = async (template: WorkoutTemplate) => {
    let items = expandedItems[template.id];
    if (!items) {
      setLoadingItems(template.id);
      try {
        items = await fetchTemplateItems(template.id);
        setExpandedItems((prev) => ({ ...prev, [template.id]: items! }));
      } catch (error) {
        console.error("[RoutineModal] Failed to load items:", error);
        setLoadingItems(null);
        return;
      }
      setLoadingItems(null);
    }
    onSelectTemplate(template, items);
    onClose();
  };

  const renderTemplate = ({ item: template }: { item: WorkoutTemplate }) => {
    const isExpanded = expandedId === template.id;
    const items = expandedItems[template.id] || [];
    const isLoadingItems = loadingItems === template.id;

    return (
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        layout={Layout.springify()}
      >
        <Pressable
          onPress={() => handleExpand(template.id)}
          style={[
            styles.templateCard,
            { backgroundColor: isDark ? "#1c1c1e" : "#f5f5f5", borderColor },
          ]}
        >
          <View style={styles.templateHeader}>
            <View style={styles.templateInfo}>
              <Text style={[styles.templateName, { color: textColor }]}>
                {template.name}
              </Text>
              {template.description && (
                <Text style={[styles.templateDescription, { color: subtextColor }]}>
                  {template.description}
                </Text>
              )}
            </View>
            <View style={styles.templateActions}>
              <Pressable
                onPress={() => handleSelect(template)}
                style={[styles.actionButton, { backgroundColor: accentColor }]}
              >
                <IconSymbol name="plus" size={16} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => handleDelete(template)}
                style={[styles.actionButton, { backgroundColor: isDark ? "#3a3a3c" : "#e0e0e0" }]}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={textColor} />
              </Pressable>
              <IconSymbol
                name={isExpanded ? "chevron.up" : "chevron.down"}
                size={20}
                color={subtextColor}
              />
            </View>
          </View>

          {isExpanded && (
            <View style={styles.itemsList}>
              {isLoadingItems ? (
                <ActivityIndicator size="small" color={accentColor} style={styles.itemsLoader} />
              ) : items.length > 0 ? (
                items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={[styles.itemName, { color: textColor }]}>
                      {item.lift_name}
                    </Text>
                    <Text style={[styles.itemDetails, { color: subtextColor }]}>
                      {item.target_sets && item.target_reps
                        ? `${item.target_sets}×${item.target_reps}`
                        : item.target_sets
                        ? `${item.target_sets} sets`
                        : item.target_reps
                        ? `${item.target_reps} reps`
                        : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.emptyItems, { color: subtextColor }]}>
                  No exercises added
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </Animated.View>
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
        <View style={styles.container}>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: textColor }]}>Workout Routines</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <IconSymbol name="xmark" size={20} color={subtextColor} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            ) : templates.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="clipboard-text-outline"
                  size={48}
                  color={subtextColor}
                />
                <Text style={[styles.emptyText, { color: subtextColor }]}>
                  No routines saved yet
                </Text>
                <Text style={[styles.emptySubtext, { color: subtextColor }]}>
                  Create routines during onboarding or from settings
                </Text>
              </View>
            ) : (
              <FlatList
                data={templates}
                renderItem={renderTemplate}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
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
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  closeButton: {
    padding: 8,
  },
  loaderContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  templateCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
  },
  templateDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  templateActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
    gap: 8,
  },
  itemsLoader: {
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
  },
  itemDetails: {
    fontSize: 13,
  },
  emptyItems: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
});
