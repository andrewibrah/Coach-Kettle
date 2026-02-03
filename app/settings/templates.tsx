import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    View,
    ScrollView,
    Pressable,
    Alert,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/components/AuthProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Colors } from '@/constants/theme';
import {
    WorkoutTemplate,
    WorkoutTemplateItem,
    fetchWorkoutTemplates,
    fetchTemplateItems,
    createWorkoutTemplate,
    deleteWorkoutTemplate,
    addTemplateItem,
    removeTemplateItem,
} from '@/lib/profile';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function TemplatesScreen() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const activeColor = useThemeColor({}, 'tint');

    const { session } = useAuth();

    const cardBg = isDark ? Colors.dark.cardBackground : '#F2F2F7';
    const sectionTitleColor = '#8E8E93';
    const inputBg = isDark ? '#2c2c2e' : '#fff';

    const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
    const [expandedItems, setExpandedItems] = useState<Record<string, WorkoutTemplateItem[]>>({});
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loadingItems, setLoadingItems] = useState<string | null>(null);

    // New template form
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');

    // Add exercise to template
    const [addingToTemplateId, setAddingToTemplateId] = useState<string | null>(null);
    const [newExerciseName, setNewExerciseName] = useState('');
    const [newExerciseSets, setNewExerciseSets] = useState('');
    const [newExerciseReps, setNewExerciseReps] = useState('');
    const [newExerciseWeight, setNewExerciseWeight] = useState('');

    const loadTemplates = useCallback(async () => {
        if (!session?.user?.id) return;

        setLoading(true);
        try {
            const data = await fetchWorkoutTemplates(session.user.id);
            setTemplates(data);
        } catch (error) {
            console.error('[Templates] Error loading:', error);
        } finally {
            setLoading(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

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
                console.error('[Templates] Error loading items:', error);
            } finally {
                setLoadingItems(null);
            }
        }
    };

    const handleCreateTemplate = async () => {
        if (!session?.user?.id || !newName.trim()) return;

        try {
            const template = await createWorkoutTemplate(
                session.user.id,
                newName.trim(),
                newDescription.trim() || undefined
            );
            if (template) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTemplates((prev) => [...prev, template]);
                setNewName('');
                setNewDescription('');
                setShowNewForm(false);
            }
        } catch (error) {
            console.error('[Templates] Error creating:', error);
            Alert.alert('Error', 'Failed to create template');
        }
    };

    const handleDeleteTemplate = async (template: WorkoutTemplate) => {
        Alert.alert(
            'Delete Template',
            `Are you sure you want to delete "${template.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteWorkoutTemplate(template.id);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setTemplates((prev) => prev.filter((t) => t.id !== template.id));
                        } catch (error) {
                            console.error('[Templates] Error deleting:', error);
                        }
                    },
                },
            ]
        );
    };

    const handleAddExercise = async () => {
        if (!session?.user?.id || !addingToTemplateId || !newExerciseName.trim()) return;

        try {
            const item = await addTemplateItem(
                session.user.id,
                addingToTemplateId,
                newExerciseName.trim(),
                newExerciseSets ? parseInt(newExerciseSets, 10) : undefined,
                newExerciseReps ? parseInt(newExerciseReps, 10) : undefined,
                newExerciseWeight ? parseFloat(newExerciseWeight) : undefined,
                undefined,
                (expandedItems[addingToTemplateId]?.length || 0) + 1
            );

            if (item) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedItems((prev) => ({
                    ...prev,
                    [addingToTemplateId]: [...(prev[addingToTemplateId] || []), item],
                }));
                resetExerciseForm();
            }
        } catch (error) {
            console.error('[Templates] Error adding exercise:', error);
            Alert.alert('Error', 'Failed to add exercise');
        }
    };

    const handleRemoveExercise = async (itemId: string, templateId: string) => {
        try {
            await removeTemplateItem(itemId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpandedItems((prev) => ({
                ...prev,
                [templateId]: prev[templateId].filter((i) => i.id !== itemId),
            }));
        } catch (error) {
            console.error('[Templates] Error removing exercise:', error);
        }
    };

    const resetExerciseForm = () => {
        setAddingToTemplateId(null);
        setNewExerciseName('');
        setNewExerciseSets('');
        setNewExerciseReps('');
        setNewExerciseWeight('');
    };

    if (loading) {
        return (
            <ThemedView style={[styles.container, { backgroundColor }]}>
                <ScreenHeader title="Templates" />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={activeColor} />
                </View>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={[styles.container, { backgroundColor }]}>
            <ScreenHeader
                title="Templates"
                rightElement={
                    <Pressable
                        onPress={() => setShowNewForm(true)}
                        style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
                    >
                        <IconSymbol name="plus" size={24} color={activeColor} />
                    </Pressable>
                }
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* New Template Form */}
                {showNewForm && (
                    <Animated.View
                        entering={FadeIn}
                        exiting={FadeOut}
                        style={[styles.formCard, { backgroundColor: cardBg }]}
                    >
                        <ThemedText style={styles.formTitle}>New Template</ThemedText>
                        <TextInput
                            style={[styles.input, { color: textColor, backgroundColor: inputBg }]}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Template name (e.g., Push Day)"
                            placeholderTextColor={isDark ? '#666' : '#999'}
                            autoFocus
                        />
                        <TextInput
                            style={[styles.input, { color: textColor, backgroundColor: inputBg }]}
                            value={newDescription}
                            onChangeText={setNewDescription}
                            placeholder="Description (optional)"
                            placeholderTextColor={isDark ? '#666' : '#999'}
                        />
                        <View style={styles.formButtons}>
                            <Pressable
                                style={styles.cancelButton}
                                onPress={() => {
                                    setShowNewForm(false);
                                    setNewName('');
                                    setNewDescription('');
                                }}
                            >
                                <ThemedText>Cancel</ThemedText>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.confirmButton,
                                    { backgroundColor: activeColor },
                                    !newName.trim() && styles.disabledButton,
                                ]}
                                onPress={handleCreateTemplate}
                                disabled={!newName.trim()}
                            >
                                <ThemedText style={styles.confirmButtonText}>Create</ThemedText>
                            </Pressable>
                        </View>
                    </Animated.View>
                )}

                {/* Templates List */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>
                        Your Templates
                    </ThemedText>

                    {templates.length === 0 ? (
                        <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
                            <MaterialCommunityIcons
                                name="clipboard-text-outline"
                                size={48}
                                color={sectionTitleColor}
                            />
                            <ThemedText style={styles.emptyText}>No templates yet</ThemedText>
                            <ThemedText style={styles.emptySubtext}>
                                Create a template to save your favorite workout routines
                            </ThemedText>
                        </View>
                    ) : (
                        templates.map((template) => {
                            const isExpanded = expandedId === template.id;
                            const items = expandedItems[template.id] || [];
                            const isLoadingItems = loadingItems === template.id;

                            return (
                                <Animated.View
                                    key={template.id}
                                    layout={Layout.springify()}
                                    style={[styles.templateCard, { backgroundColor: cardBg }]}
                                >
                                    <Pressable
                                        onPress={() => handleExpand(template.id)}
                                        style={styles.templateHeader}
                                    >
                                        <View style={styles.templateInfo}>
                                            <ThemedText style={styles.templateName}>{template.name}</ThemedText>
                                            {template.description && (
                                                <ThemedText style={styles.templateDescription}>
                                                    {template.description}
                                                </ThemedText>
                                            )}
                                            <ThemedText style={styles.exerciseCount}>
                                                {items.length || '?'} exercises
                                            </ThemedText>
                                        </View>
                                        <View style={styles.templateActions}>
                                            <Pressable
                                                onPress={() => handleDeleteTemplate(template)}
                                                style={styles.actionButton}
                                            >
                                                <MaterialCommunityIcons
                                                    name="trash-can-outline"
                                                    size={20}
                                                    color="#FF3B30"
                                                />
                                            </Pressable>
                                            <IconSymbol
                                                name={isExpanded ? 'chevron.up' : 'chevron.down'}
                                                size={20}
                                                color={sectionTitleColor}
                                            />
                                        </View>
                                    </Pressable>

                                    {isExpanded && (
                                        <View style={styles.expandedContent}>
                                            {isLoadingItems ? (
                                                <ActivityIndicator size="small" color={activeColor} style={styles.loader} />
                                            ) : (
                                                <>
                                                    {items.length > 0 ? (
                                                        items.map((item) => (
                                                            <View key={item.id} style={styles.exerciseRow}>
                                                                <View style={styles.exerciseInfo}>
                                                                    <ThemedText style={styles.exerciseName}>
                                                                        {item.lift_name}
                                                                    </ThemedText>
                                                                    <ThemedText style={styles.exerciseDetails}>
                                                                        {item.target_sets && item.target_reps
                                                                            ? `${item.target_sets} × ${item.target_reps}`
                                                                            : item.target_sets
                                                                                ? `${item.target_sets} sets`
                                                                                : item.target_reps
                                                                                    ? `${item.target_reps} reps`
                                                                                    : ''}
                                                                        {item.target_weight ? ` @ ${item.target_weight} lbs` : ''}
                                                                    </ThemedText>
                                                                </View>
                                                                <Pressable
                                                                    onPress={() => handleRemoveExercise(item.id, template.id)}
                                                                    style={({ pressed }) => [
                                                                        styles.removeButton,
                                                                        pressed && styles.buttonPressed,
                                                                    ]}
                                                                >
                                                                    <IconSymbol name="xmark" size={16} color="#FF3B30" />
                                                                </Pressable>
                                                            </View>
                                                        ))
                                                    ) : (
                                                        <ThemedText style={styles.noExercises}>
                                                            No exercises added yet
                                                        </ThemedText>
                                                    )}

                                                    {/* Add Exercise Form */}
                                                    {addingToTemplateId === template.id ? (
                                                        <View style={styles.addExerciseForm}>
                                                            <TextInput
                                                                style={[styles.exerciseInput, { color: textColor, backgroundColor: inputBg }]}
                                                                value={newExerciseName}
                                                                onChangeText={setNewExerciseName}
                                                                placeholder="Exercise name"
                                                                placeholderTextColor={isDark ? '#666' : '#999'}
                                                                autoFocus
                                                            />
                                                            <View style={styles.exerciseInputRow}>
                                                                <TextInput
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseSets}
                                                                    onChangeText={setNewExerciseSets}
                                                                    placeholder="Sets"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="numeric"
                                                                />
                                                                <TextInput
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseReps}
                                                                    onChangeText={setNewExerciseReps}
                                                                    placeholder="Reps"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="numeric"
                                                                />
                                                                <TextInput
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseWeight}
                                                                    onChangeText={setNewExerciseWeight}
                                                                    placeholder="Weight"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="decimal-pad"
                                                                />
                                                            </View>
                                                            <View style={styles.formButtons}>
                                                                <Pressable style={styles.cancelButton} onPress={resetExerciseForm}>
                                                                    <ThemedText>Cancel</ThemedText>
                                                                </Pressable>
                                                                <Pressable
                                                                    style={[
                                                                        styles.confirmButton,
                                                                        { backgroundColor: activeColor },
                                                                        !newExerciseName.trim() && styles.disabledButton,
                                                                    ]}
                                                                    onPress={handleAddExercise}
                                                                    disabled={!newExerciseName.trim()}
                                                                >
                                                                    <ThemedText style={styles.confirmButtonText}>Add</ThemedText>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        <Pressable
                                                            style={[styles.addExerciseButton, { borderColor: activeColor }]}
                                                            onPress={() => setAddingToTemplateId(template.id)}
                                                        >
                                                            <IconSymbol name="plus" size={16} color={activeColor} />
                                                            <ThemedText style={[styles.addExerciseText, { color: activeColor }]}>
                                                                Add Exercise
                                                            </ThemedText>
                                                        </Pressable>
                                                    )}
                                                </>
                                            )}
                                        </View>
                                    )}
                                </Animated.View>
                            );
                        })
                    )}
                </View>

                <View style={styles.infoSection}>
                    <ThemedText style={styles.infoText}>
                        💡 Tip: Your templates can be loaded from the main workout screen to quickly start a routine.
                    </ThemedText>
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        padding: 8,
    },
    buttonPressed: {
        opacity: 0.7,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    formCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    formTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    input: {
        fontSize: 16,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginBottom: 12,
    },
    formButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    cancelButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    confirmButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.5,
    },
    emptyCard: {
        padding: 32,
        borderRadius: 12,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
    },
    emptySubtext: {
        fontSize: 14,
        opacity: 0.6,
        textAlign: 'center',
    },
    templateCard: {
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    templateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    templateInfo: {
        flex: 1,
    },
    templateName: {
        fontSize: 17,
        fontWeight: '600',
    },
    templateDescription: {
        fontSize: 14,
        opacity: 0.6,
        marginTop: 2,
    },
    exerciseCount: {
        fontSize: 13,
        opacity: 0.5,
        marginTop: 4,
    },
    templateActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    actionButton: {
        padding: 4,
    },
    expandedContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(128, 128, 128, 0.2)',
    },
    loader: {
        paddingVertical: 20,
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(128, 128, 128, 0.1)',
    },
    exerciseInfo: {
        flex: 1,
    },
    exerciseName: {
        fontSize: 15,
        fontWeight: '500',
    },
    exerciseDetails: {
        fontSize: 13,
        opacity: 0.6,
    },
    removeButton: {
        padding: 8,
        marginRight: -4,
    },
    noExercises: {
        fontSize: 14,
        opacity: 0.5,
        textAlign: 'center',
        paddingVertical: 16,
    },
    addExerciseForm: {
        paddingTop: 12,
        gap: 8,
    },
    exerciseInput: {
        fontSize: 15,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    exerciseInputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    smallInput: {
        flex: 1,
        fontSize: 15,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    addExerciseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginTop: 12,
        borderWidth: 1,
        borderRadius: 8,
        borderStyle: 'dashed',
        gap: 6,
    },
    addExerciseText: {
        fontSize: 14,
        fontWeight: '500',
    },
    infoSection: {
        marginTop: 8,
        paddingVertical: 16,
    },
    infoText: {
        fontSize: 14,
        opacity: 0.6,
        textAlign: 'center',
        lineHeight: 20,
    },
});
