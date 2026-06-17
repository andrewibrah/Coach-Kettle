import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    StyleSheet,
    View,
    ScrollView,
    Pressable,
    Alert,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    findNodeHandle,
} from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/contexts/AuthProvider';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
    WorkoutTemplate,
    WorkoutTemplateItem,
    fetchWorkoutTemplates,
    fetchTemplateItems,
    createWorkoutTemplate,
    deleteWorkoutTemplate,
    addTemplateItem,
    removeTemplateItem,
    updateTemplateItem,
    reorderTemplateItems,
} from '@/lib/profile';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function TemplatesScreen() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const activeColor = useThemeColor({}, 'tint');
    const onTint = useThemeColor({}, 'tintForeground');

    const { session } = useAuth();

    const cardBg = useThemeColor({}, 'cardBackground');
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

    // Edit exercise state
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editSets, setEditSets] = useState('');
    const [editReps, setEditReps] = useState('');
    const [editWeight, setEditWeight] = useState('');

    const scrollViewRef = useRef<ScrollView | null>(null);
    const templateDescriptionInputRef = useRef<TextInput | null>(null);
    const addExerciseNameInputRef = useRef<TextInput | null>(null);
    const addExerciseSetsInputRef = useRef<TextInput | null>(null);
    const addExerciseRepsInputRef = useRef<TextInput | null>(null);
    const addExerciseWeightInputRef = useRef<TextInput | null>(null);
    const editSetsInputRef = useRef<TextInput | null>(null);
    const editRepsInputRef = useRef<TextInput | null>(null);
    const editWeightInputRef = useRef<TextInput | null>(null);

    // Ref to the currently active form View — used to measure its position
    // relative to the ScrollView and scroll to it on keyboard focus.
    const activeFormRef = useRef<View | null>(null);

    const ensureInputVisible = useCallback(() => {
        requestAnimationFrame(() => {
            const formNode = activeFormRef.current;
            const svNode = scrollViewRef.current;
            if (formNode && svNode) {
                const svHandle = findNodeHandle(svNode);
                if (svHandle) {
                    formNode.measureLayout(
                        svHandle,
                        (_x: number, y: number) => {
                            svNode.scrollTo({ y: Math.max(0, y - 100), animated: true });
                        },
                        () => svNode.scrollToEnd({ animated: true })
                    );
                    return;
                }
            }
            scrollViewRef.current?.scrollToEnd({ animated: true });
        });
    }, []);

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
            setEditingItemId(null);
            return;
        }

        setExpandedId(templateId);
        setEditingItemId(null);

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

        const name = newName.trim();
        const description = newDescription.trim() || null;

        // Optimistic: show template instantly
        const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const optimisticTemplate: WorkoutTemplate = {
            id: tempId,
            user_id: session.user.id,
            name,
            description,
            display_order: templates.length + 1,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        setTemplates((prev) => [...prev, optimisticTemplate]);
        setNewName('');
        setNewDescription('');
        setShowNewForm(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
            const template = await createWorkoutTemplate(
                session.user.id,
                name,
                description ?? undefined
            );
            if (template) {
                setTemplates((prev) =>
                    prev.map((t) => (t.id === tempId ? template : t))
                );
            } else {
                throw new Error('create_failed');
            }
        } catch (error) {
            console.error('[Templates] Error creating:', error);
            setTemplates((prev) => prev.filter((t) => t.id !== tempId));
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
                        const previousTemplates = templates;
                        const previousExpandedItems = expandedItems;
                        const previousExpandedId = expandedId;

                        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
                        setExpandedItems((prev) => {
                            const next = { ...prev };
                            delete next[template.id];
                            return next;
                        });
                        if (expandedId === template.id) {
                            setExpandedId(null);
                        }

                        try {
                            const ok = await deleteWorkoutTemplate(template.id);
                            if (!ok) throw new Error('delete_failed');
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch (error) {
                            console.error('[Templates] Error deleting:', error);
                            setTemplates(previousTemplates);
                            setExpandedItems(previousExpandedItems);
                            setExpandedId(previousExpandedId);
                            Alert.alert('Error', 'Failed to delete template');
                        }
                    },
                },
            ]
        );
    };

    const handleAddExercise = async () => {
        if (!session?.user?.id || !addingToTemplateId || !newExerciseName.trim()) return;

        const templateId = addingToTemplateId;
        const name = newExerciseName.trim();
        const parsedSets = newExerciseSets ? parseInt(newExerciseSets, 10) : NaN;
        const parsedReps = newExerciseReps ? parseInt(newExerciseReps, 10) : NaN;
        const parsedWeight = newExerciseWeight ? parseFloat(newExerciseWeight) : NaN;
        const sets = Number.isFinite(parsedSets) ? parsedSets : null;
        const reps = Number.isFinite(parsedReps) ? parsedReps : null;
        const weight = Number.isFinite(parsedWeight) ? parsedWeight : null;
        const formSnapshot = {
            name: newExerciseName,
            sets: newExerciseSets,
            reps: newExerciseReps,
            weight: newExerciseWeight,
        };

        const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const optimisticItem: WorkoutTemplateItem = {
            id: tempId,
            template_id: templateId,
            user_id: session.user.id,
            lift_name: name,
            target_sets: sets,
            target_reps: reps,
            target_weight: weight,
            display_order: (expandedItems[templateId]?.length || 0) + 1,
            notes: null,
            created_at: new Date().toISOString(),
        };

        setExpandedItems((prev) => ({
            ...prev,
            [templateId]: [...(prev[templateId] || []), optimisticItem],
        }));
        setNewExerciseName('');
        setNewExerciseSets('');
        setNewExerciseReps('');
        setNewExerciseWeight('');
        requestAnimationFrame(() => addExerciseNameInputRef.current?.focus());
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
            const item = await addTemplateItem(
                session.user.id,
                templateId,
                name,
                sets ?? undefined,
                reps ?? undefined,
                weight ?? undefined,
                undefined,
                optimisticItem.display_order
            );

            if (item) {
                setExpandedItems((prev) => ({
                    ...prev,
                    [templateId]: (prev[templateId] || []).map((existing) =>
                        existing.id === tempId ? item : existing
                    ),
                }));
                return;
            }
            throw new Error('add_item_failed');
        } catch (error) {
            console.error('[Templates] Error adding exercise:', error);
            setExpandedItems((prev) => ({
                ...prev,
                [templateId]: (prev[templateId] || []).filter((existing) => existing.id !== tempId),
            }));
            setNewExerciseName(formSnapshot.name);
            setNewExerciseSets(formSnapshot.sets);
            setNewExerciseReps(formSnapshot.reps);
            setNewExerciseWeight(formSnapshot.weight);
            Alert.alert('Error', 'Failed to add exercise');
        }
    };

    const handleRemoveExercise = async (itemId: string, templateId: string) => {
        Alert.alert(
            'Delete Exercise',
            'Are you sure you want to remove this exercise?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const previousTemplateItems = expandedItems[templateId] || [];

                        setExpandedItems((prev) => ({
                            ...prev,
                            [templateId]: previousTemplateItems.filter((i) => i.id !== itemId),
                        }));
                        if (editingItemId === itemId) setEditingItemId(null);

                        try {
                            const ok = await removeTemplateItem(itemId);
                            if (!ok) throw new Error('remove_item_failed');
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch (error) {
                            console.error('[Templates] Error removing exercise:', error);
                            setExpandedItems((prev) => ({
                                ...prev,
                                [templateId]: previousTemplateItems,
                            }));
                            Alert.alert('Error', 'Failed to remove exercise');
                        }
                    },
                },
            ]
        );
    };

    const handleStartEdit = (item: WorkoutTemplateItem) => {
        setEditingItemId(item.id);
        setEditName(item.lift_name);
        setEditSets(item.target_sets?.toString() || '');
        setEditReps(item.target_reps?.toString() || '');
        setEditWeight(item.target_weight?.toString() || '');
    };

    const handleSaveEdit = async (itemId: string, templateId: string) => {
        if (!editName.trim()) return;
        const parsedSets = editSets ? parseInt(editSets, 10) : NaN;
        const parsedReps = editReps ? parseInt(editReps, 10) : NaN;
        const parsedWeight = editWeight ? parseFloat(editWeight) : NaN;

        try {
            const updated = await updateTemplateItem(itemId, {
                lift_name: editName.trim(),
                target_sets: Number.isFinite(parsedSets) ? parsedSets : null,
                target_reps: Number.isFinite(parsedReps) ? parsedReps : null,
                target_weight: Number.isFinite(parsedWeight) ? parsedWeight : null,
            });

            if (updated) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedItems((prev) => ({
                    ...prev,
                    [templateId]: prev[templateId].map((i) =>
                        i.id === itemId ? updated : i
                    ),
                }));
            }
            setEditingItemId(null);
        } catch (error) {
            console.error('[Templates] Error updating exercise:', error);
            Alert.alert('Error', 'Failed to update exercise');
        }
    };

    const handleMoveItem = async (templateId: string, itemId: string, direction: 'up' | 'down') => {
        const items = expandedItems[templateId];
        if (!items) return;

        const idx = items.findIndex((i) => i.id === itemId);
        if (idx < 0) return;
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === items.length - 1) return;

        const newItems = [...items];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];

        // Optimistic update
        setExpandedItems((prev) => ({ ...prev, [templateId]: newItems }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Persist to backend
        const reorderPayload = newItems.map((item, i) => ({
            id: item.id,
            display_order: i + 1,
        }));

        try {
            await reorderTemplateItems(reorderPayload);
        } catch (error) {
            console.error('[Templates] Error reordering:', error);
            // Revert on failure
            setExpandedItems((prev) => ({ ...prev, [templateId]: items }));
        }
    };

    const resetExerciseForm = () => {
        setAddingToTemplateId(null);
        setNewExerciseName('');
        setNewExerciseSets('');
        setNewExerciseReps('');
        setNewExerciseWeight('');
        activeFormRef.current = null;
    };

    // Get exercise count for a template (from API response or expanded items)
    const getExerciseCount = (template: WorkoutTemplate): number => {
        const expanded = expandedItems[template.id];
        if (expanded) return expanded.length;

        // Use count from the list query (Supabase returns { count: N } in the join)
        const countData = (template as any).workout_template_items;
        if (Array.isArray(countData) && countData.length > 0 && countData[0].count !== undefined) {
            return countData[0].count;
        }
        return 0;
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

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
            >
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
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
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onFocus={ensureInputVisible}
                            onSubmitEditing={() => templateDescriptionInputRef.current?.focus()}
                        />
                        <TextInput
                            ref={templateDescriptionInputRef}
                            style={[styles.input, { color: textColor, backgroundColor: inputBg }]}
                            value={newDescription}
                            onChangeText={setNewDescription}
                            placeholder="Description (optional)"
                            placeholderTextColor={isDark ? '#666' : '#999'}
                            returnKeyType="done"
                            onFocus={ensureInputVisible}
                            onSubmitEditing={() => {
                                if (newName.trim()) {
                                    handleCreateTemplate();
                                }
                            }}
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
                                <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Create</ThemedText>
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
                            const exerciseCount = getExerciseCount(template);

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
                                                {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
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
                                                        items.map((item, idx) => (
                                                            <View key={item.id} style={styles.exerciseRow}>
                                                                {editingItemId === item.id ? (
                                                                    // Edit mode
                                                                    <View
                                                                        ref={activeFormRef}
                                                                        style={styles.editForm}
                                                                    >
                                                                        <TextInput
                                                                            style={[styles.exerciseInput, { color: textColor, backgroundColor: inputBg }]}
                                                                            value={editName}
                                                                            onChangeText={setEditName}
                                                                            placeholder="Exercise name"
                                                                            placeholderTextColor={isDark ? '#666' : '#999'}
                                                                            autoFocus
                                                                            returnKeyType="next"
                                                                            blurOnSubmit={false}
                                                                            onFocus={ensureInputVisible}
                                                                            onSubmitEditing={() => editSetsInputRef.current?.focus()}
                                                                        />
                                                                        <View style={styles.exerciseInputRow}>
                                                                            <TextInput
                                                                                ref={editSetsInputRef}
                                                                                style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                                value={editSets}
                                                                                onChangeText={setEditSets}
                                                                                placeholder="Sets"
                                                                                placeholderTextColor={isDark ? '#666' : '#999'}
                                                                                keyboardType="numeric"
                                                                                returnKeyType="next"
                                                                                blurOnSubmit={false}
                                                                                onFocus={ensureInputVisible}
                                                                                onSubmitEditing={() => editRepsInputRef.current?.focus()}
                                                                            />
                                                                            <TextInput
                                                                                ref={editRepsInputRef}
                                                                                style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                                value={editReps}
                                                                                onChangeText={setEditReps}
                                                                                placeholder="Reps"
                                                                                placeholderTextColor={isDark ? '#666' : '#999'}
                                                                                keyboardType="numeric"
                                                                                returnKeyType="next"
                                                                                blurOnSubmit={false}
                                                                                onFocus={ensureInputVisible}
                                                                                onSubmitEditing={() => editWeightInputRef.current?.focus()}
                                                                            />
                                                                            <TextInput
                                                                                ref={editWeightInputRef}
                                                                                style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                                value={editWeight}
                                                                                onChangeText={setEditWeight}
                                                                                placeholder="Weight"
                                                                                placeholderTextColor={isDark ? '#666' : '#999'}
                                                                                keyboardType="decimal-pad"
                                                                                returnKeyType="done"
                                                                                onFocus={ensureInputVisible}
                                                                                onSubmitEditing={() => handleSaveEdit(item.id, template.id)}
                                                                            />
                                                                        </View>
                                                                        <View style={styles.editActions}>
                                                                            <Pressable
                                                                                style={[styles.editActionButton, { backgroundColor: '#FF3B30' }]}
                                                                                onPress={() => handleRemoveExercise(item.id, template.id)}
                                                                            >
                                                                                <ThemedText style={styles.editActionText}>Delete</ThemedText>
                                                                            </Pressable>
                                                                            <View style={styles.editActionsRight}>
                                                                                <Pressable
                                                                                    style={styles.cancelButton}
                                                                                    onPress={() => setEditingItemId(null)}
                                                                                >
                                                                                    <ThemedText>Cancel</ThemedText>
                                                                                </Pressable>
                                                                                <Pressable
                                                                                    style={[
                                                                                        styles.confirmButton,
                                                                                        { backgroundColor: activeColor },
                                                                                        !editName.trim() && styles.disabledButton,
                                                                                    ]}
                                                                                    onPress={() => handleSaveEdit(item.id, template.id)}
                                                                                    disabled={!editName.trim()}
                                                                                >
                                                                                    <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Save</ThemedText>
                                                                                </Pressable>
                                                                            </View>
                                                                        </View>
                                                                    </View>
                                                                ) : (
                                                                    // Display mode
                                                                    <>
                                                                        {/* Reorder buttons */}
                                                                        <View style={styles.reorderButtons}>
                                                                            <Pressable
                                                                                onPress={() => handleMoveItem(template.id, item.id, 'up')}
                                                                                style={[styles.reorderBtn, idx === 0 && styles.reorderBtnDisabled]}
                                                                                disabled={idx === 0}
                                                                            >
                                                                                <IconSymbol name="chevron.up" size={14} color={idx === 0 ? sectionTitleColor : textColor} />
                                                                            </Pressable>
                                                                            <Pressable
                                                                                onPress={() => handleMoveItem(template.id, item.id, 'down')}
                                                                                style={[styles.reorderBtn, idx === items.length - 1 && styles.reorderBtnDisabled]}
                                                                                disabled={idx === items.length - 1}
                                                                            >
                                                                                <IconSymbol name="chevron.down" size={14} color={idx === items.length - 1 ? sectionTitleColor : textColor} />
                                                                            </Pressable>
                                                                        </View>

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

                                                                        {/* Edit button */}
                                                                        <Pressable
                                                                            onPress={() => handleStartEdit(item)}
                                                                            style={({ pressed }) => [
                                                                                styles.editButton,
                                                                                pressed && styles.buttonPressed,
                                                                            ]}
                                                                        >
                                                                            <MaterialCommunityIcons
                                                                                name="pencil-outline"
                                                                                size={18}
                                                                                color={activeColor}
                                                                            />
                                                                        </Pressable>
                                                                    </>
                                                                )}
                                                            </View>
                                                        ))
                                                    ) : (
                                                        <ThemedText style={styles.noExercises}>
                                                            No exercises added yet
                                                        </ThemedText>
                                                    )}

                                                    {/* Add Exercise Form */}
                                                    {addingToTemplateId === template.id ? (
                                                        <View
                                                            ref={activeFormRef}
                                                            style={styles.addExerciseForm}
                                                        >
                                                            <TextInput
                                                                ref={addExerciseNameInputRef}
                                                                style={[styles.exerciseInput, { color: textColor, backgroundColor: inputBg }]}
                                                                value={newExerciseName}
                                                                onChangeText={setNewExerciseName}
                                                                placeholder="Exercise name"
                                                                placeholderTextColor={isDark ? '#666' : '#999'}
                                                                autoFocus
                                                                returnKeyType="next"
                                                                blurOnSubmit={false}
                                                                onFocus={ensureInputVisible}
                                                                onSubmitEditing={() => addExerciseSetsInputRef.current?.focus()}
                                                            />
                                                            <View style={styles.exerciseInputRow}>
                                                                <TextInput
                                                                    ref={addExerciseSetsInputRef}
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseSets}
                                                                    onChangeText={setNewExerciseSets}
                                                                    placeholder="Sets"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="numeric"
                                                                    returnKeyType="next"
                                                                    blurOnSubmit={false}
                                                                    onFocus={ensureInputVisible}
                                                                    onSubmitEditing={() => addExerciseRepsInputRef.current?.focus()}
                                                                />
                                                                <TextInput
                                                                    ref={addExerciseRepsInputRef}
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseReps}
                                                                    onChangeText={setNewExerciseReps}
                                                                    placeholder="Reps"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="numeric"
                                                                    returnKeyType="next"
                                                                    blurOnSubmit={false}
                                                                    onFocus={ensureInputVisible}
                                                                    onSubmitEditing={() => addExerciseWeightInputRef.current?.focus()}
                                                                />
                                                                <TextInput
                                                                    ref={addExerciseWeightInputRef}
                                                                    style={[styles.smallInput, { color: textColor, backgroundColor: inputBg }]}
                                                                    value={newExerciseWeight}
                                                                    onChangeText={setNewExerciseWeight}
                                                                    placeholder="Weight"
                                                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                                                    keyboardType="decimal-pad"
                                                                    returnKeyType="done"
                                                                    onFocus={ensureInputVisible}
                                                                    onSubmitEditing={() => {
                                                                        if (newExerciseName.trim()) {
                                                                            handleAddExercise();
                                                                        }
                                                                    }}
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
                                                                    <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Add</ThemedText>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        <Pressable
                                                            style={[styles.addExerciseButton, { borderColor: activeColor }]}
                                                            onPress={() => {
                                                                setAddingToTemplateId(template.id);
                                                                requestAnimationFrame(() => addExerciseNameInputRef.current?.focus());
                                                            }}
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
                        Tip: Your templates can be loaded from the main workout screen to quickly start a routine.
                    </ThemedText>
                </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    flex: {
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
    editButton: {
        padding: 8,
        marginLeft: 4,
    },
    reorderButtons: {
        marginRight: 10,
        alignItems: 'center',
        gap: 2,
    },
    reorderBtn: {
        padding: 4,
    },
    reorderBtnDisabled: {
        opacity: 0.3,
    },
    editForm: {
        flex: 1,
        gap: 8,
    },
    editActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    editActionsRight: {
        flexDirection: 'row',
        gap: 12,
    },
    editActionButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    editActionText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
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
    removeButton: {
        padding: 8,
        marginRight: -4,
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
