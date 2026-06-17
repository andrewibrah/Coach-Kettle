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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { E1RMInfoTooltip } from '@/components/ui/E1RMInfoTooltip';
import { useAuth } from '@/contexts/AuthProvider';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  PRTrackedLift,
  PRLift,
  PRHistory,
  fetchTrackedLifts,
  fetchPRLifts,
  fetchPRHistory,
  addTrackedLift,
  removeTrackedLift,
  toggleTrackedLift,
  setPRLift,
} from '@/lib/profile';

export default function PRTrackingScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const activeColor = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { session } = useAuth();

  const cardBg = useThemeColor({}, 'cardBackground');
  const inputBg = useThemeColor({}, 'inputBackground');
  const placeholder = useThemeColor({}, 'placeholder');
  const sectionTitleColor = '#8E8E93'; // iOS system gray, same in both themes
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');

  const [trackedLifts, setTrackedLifts] = useState<PRTrackedLift[]>([]);
  const [prLifts, setPRLifts] = useState<PRLift[]>([]);
  const [selectedLiftHistory, setSelectedLiftHistory] = useState<PRHistory[] | null>(null);
  const [selectedLiftName, setSelectedLiftName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLiftName, setNewLiftName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [addStep, setAddStep] = useState<'name' | 'values'>('name');
  const [prWeight, setPrWeight] = useState('');
  const [prReps, setPrReps] = useState('');
  const [calculatedE1rm, setCalculatedE1rm] = useState<number | null>(null);
  const [editingPRId, setEditingPRId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const [lifts, prs] = await Promise.all([
        fetchTrackedLifts(session.user.id),
        fetchPRLifts(session.user.id),
      ]);
      setTrackedLifts(lifts);
      setPRLifts(prs);
    } catch (error) {
      console.error('Error loading PR data:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddLift = async () => {
    if (!session?.user?.id || !newLiftName.trim()) return;

    const trimmedName = newLiftName.trim();

    // Check if lift already exists in local state
    const existingLift = trackedLifts.find(
      (l) => l.lift_name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingLift) {
      // If it exists but is inactive, reactivate it
      if (!existingLift.is_active) {
        await handleToggleLift(existingLift);
      }
      setNewLiftName('');
      setShowAddInput(false);
      return;
    }

    try {
      const lift = await addTrackedLift(session.user.id, trimmedName);
      if (lift) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Only add if not already in list (handles race conditions)
        setTrackedLifts((prev) => {
          if (prev.some((l) => l.id === lift.id)) {
            return prev.map((l) => (l.id === lift.id ? lift : l));
          }
          return [...prev, lift];
        });
        setNewLiftName('');
        setShowAddInput(false);
      }
    } catch (error) {
      console.error('Error adding lift:', error);
      Alert.alert('Error', 'Failed to add lift. Please try again.');
    }
  };

  const handleRemoveLift = async (lift: PRTrackedLift) => {
    Alert.alert(
      'Remove Lift',
      `Are you sure you want to stop tracking PRs for ${lift.lift_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTrackedLift(lift.id);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTrackedLifts(trackedLifts.filter((l) => l.id !== lift.id));
            } catch (error) {
              console.error('Error removing lift:', error);
            }
          },
        },
      ]
    );
  };

  const handleToggleLift = async (lift: PRTrackedLift) => {
    try {
      await toggleTrackedLift(lift.id, !lift.is_active);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTrackedLifts(
        trackedLifts.map((l) =>
          l.id === lift.id ? { ...l, is_active: !l.is_active } : l
        )
      );
    } catch (error) {
      console.error('Error toggling lift:', error);
    }
  };

  const handleViewHistory = async (liftName: string) => {
    if (!session?.user?.id) return;

    setSelectedLiftName(liftName);
    try {
      const history = await fetchPRHistory(session.user.id, liftName);
      setSelectedLiftHistory(history);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const getPRForLift = (liftName: string): PRLift | undefined => {
    return prLifts.find(
      (pr) => pr.lift_name.toLowerCase() === liftName.toLowerCase()
    );
  };

  const updateE1rmPreview = (weight: string, reps: string) => {
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (w > 0 && r > 0) {
      const e1rm = w * (1 + r / 30);
      setCalculatedE1rm(e1rm);
    } else {
      setCalculatedE1rm(null);
    }
  };

  const handleSkipPRValues = async () => {
    await handleAddLift(); // Add without PR
    resetAddForm();
  };

  const handleAddWithPR = async () => {
    if (!session?.user?.id) return;

    await handleAddLift(); // Add tracked lift first

    // Then set PR if values provided
    if (prWeight && prReps) {
      const weight = parseFloat(prWeight);
      const reps = parseInt(prReps, 10);
      if (weight > 0 && reps > 0) {
        try {
          await setPRLift(session.user.id, newLiftName.trim(), weight, reps);
          await loadData();
        } catch (error) {
          console.error('Error setting PR:', error);
          Alert.alert('Error', 'Failed to set PR value');
        }
      }
    }

    resetAddForm();
  };

  const resetAddForm = () => {
    setShowAddInput(false);
    setNewLiftName('');
    setPrWeight('');
    setPrReps('');
    setCalculatedE1rm(null);
    setAddStep('name');
  };

  const handleSaveEdit = async (lift: PRTrackedLift) => {
    const weight = parseFloat(editWeight);
    const reps = parseInt(editReps, 10);

    if (!session?.user?.id || weight <= 0 || reps <= 0) {
      Alert.alert('Invalid Input', 'Please enter valid weight and reps');
      return;
    }

    try {
      setLoading(true);
      await setPRLift(session.user.id, lift.lift_name, weight, reps);
      await loadData();
      setEditingPRId(null);
      setEditWeight('');
      setEditReps('');

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error updating PR:', error);
      Alert.alert('Error', 'Failed to update PR');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 20, backgroundColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={activeColor} />
        </View>
      </ThemedView>
    );
  }

  // Show history view if selected
  if (selectedLiftHistory !== null && selectedLiftName) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 20, backgroundColor }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              setSelectedLiftHistory(null);
              setSelectedLiftName(null);
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          >
            <IconSymbol name="chevron.left" size={28} color={textColor} />
          </Pressable>
          <ThemedText type="subtitle" style={styles.title}>
            {selectedLiftName} History
          </ThemedText>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {selectedLiftHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="chart.line.uptrend.xyaxis" size={48} color={sectionTitleColor} />
              <ThemedText style={styles.emptyText}>No PR history yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Start logging workouts to track your progress
              </ThemedText>
            </View>
          ) : (
            selectedLiftHistory.map((record, index) => (
              <Animated.View
                key={record.id}
                entering={FadeIn.delay(index * 50)}
                style={[styles.historyCard, { backgroundColor: cardBg }]}
              >
                <View style={styles.historyHeader}>
                  <ThemedText style={styles.historyDate}>
                    {new Date(record.achieved_at).toLocaleDateString()}
                  </ThemedText>
                  {record.improvement_pct && (
                    <View style={[styles.improvementBadge, { backgroundColor: successColor + '20' }]}>
                      <ThemedText style={[styles.improvementText, { color: successColor }]}>
                        +{record.improvement_pct.toFixed(1)}%
                      </ThemedText>
                    </View>
                  )}
                </View>
                <View style={styles.historyStats}>
                  <View style={styles.historyStat}>
                    <ThemedText style={styles.historyValue}>
                      {record.weight_lbs} × {record.reps}
                    </ThemedText>
                    <ThemedText style={styles.historyLabel}>Weight × Reps</ThemedText>
                  </View>
                  <View style={styles.historyStat}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <ThemedText style={styles.historyValue}>
                        {record.estimated_1rm.toFixed(0)} lbs
                      </ThemedText>
                      <E1RMInfoTooltip />
                    </View>
                    <ThemedText style={styles.historyLabel}>Est. 1RM</ThemedText>
                  </View>
                </View>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 20, backgroundColor }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
        >
          <IconSymbol name="chevron.left" size={28} color={textColor} />
        </Pressable>
        <ThemedText type="subtitle" style={styles.title}>
          PR Tracking
        </ThemedText>
        <Pressable
          onPress={() => setShowAddInput(true)}
          style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
        >
          <IconSymbol name="plus" size={24} color={activeColor} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Add New Lift */}
        {showAddInput && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[styles.addInputContainer, { backgroundColor: cardBg }]}
          >
            {addStep === 'name' ? (
              <>
                <TextInput
                  style={[
                    styles.addInput,
                    { color: textColor, backgroundColor: inputBg },
                  ]}
                  value={newLiftName}
                  onChangeText={setNewLiftName}
                  placeholder="Enter lift name (e.g., Bench Press)"
                  placeholderTextColor={placeholder}
                  autoFocus
                  onSubmitEditing={() => {
                    if (newLiftName.trim()) setAddStep('values');
                  }}
                />
                <View style={styles.addInputButtons}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={resetAddForm}
                  >
                    <ThemedText>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmButton,
                      { backgroundColor: activeColor },
                      !newLiftName.trim() && styles.disabledButton,
                    ]}
                    onPress={() => {
                      if (newLiftName.trim()) setAddStep('values');
                    }}
                    disabled={!newLiftName.trim()}
                  >
                    <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Continue</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <ThemedText style={styles.stepLabel}>
                  Set initial PR for &quot;{newLiftName}&quot; (optional)
                </ThemedText>
                <View style={styles.prInputRow}>
                  <TextInput
                    style={[
                      styles.prInput,
                      { color: textColor, backgroundColor: inputBg },
                    ]}
                    placeholder="Weight (lbs)"
                    placeholderTextColor={placeholder}
                    keyboardType="decimal-pad"
                    value={prWeight}
                    onChangeText={(text) => {
                      setPrWeight(text);
                      updateE1rmPreview(text, prReps);
                    }}
                  />
                  <ThemedText style={styles.multiplier}>×</ThemedText>
                  <TextInput
                    style={[
                      styles.prInput,
                      { color: textColor, backgroundColor: inputBg },
                    ]}
                    placeholder="Reps"
                    placeholderTextColor={placeholder}
                    keyboardType="numeric"
                    value={prReps}
                    onChangeText={(text) => {
                      setPrReps(text);
                      updateE1rmPreview(prWeight, text);
                    }}
                  />
                </View>
                {calculatedE1rm !== null && (
                  <View style={[styles.e1rmPreview, { backgroundColor: activeColor + '20' }]}>
                    <ThemedText style={[styles.e1rmPreviewText, { color: activeColor }]}>
                      Est. 1RM: {calculatedE1rm.toFixed(1)} lbs
                    </ThemedText>
                  </View>
                )}
                <View style={styles.addInputButtons}>
                  <Pressable style={styles.cancelButton} onPress={handleSkipPRValues}>
                    <ThemedText>Skip</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmButton, { backgroundColor: activeColor }]}
                    onPress={handleAddWithPR}
                  >
                    <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Add Lift</ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Tracked Lifts */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Tracked Lifts
          </ThemedText>

          {trackedLifts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
              <ThemedText style={styles.emptyCardText}>
                No lifts being tracked. Tap + to add one.
              </ThemedText>
            </View>
          ) : (
            trackedLifts.map((lift) => {
              const pr = getPRForLift(lift.lift_name);
              return (
                <Animated.View
                  key={lift.id}
                  layout={Layout.springify()}
                  style={[
                    styles.liftCard,
                    { backgroundColor: cardBg },
                    !lift.is_active && styles.liftCardInactive,
                  ]}
                >
                  {editingPRId === lift.id ? (
                    <View style={styles.liftCardContent}>
                      <View style={styles.liftInfo}>
                        <ThemedText style={styles.liftName}>{lift.lift_name}</ThemedText>
                        <View style={styles.prInputRow}>
                          <TextInput
                            style={[
                              styles.prInput,
                              { color: textColor, backgroundColor: inputBg },
                            ]}
                            value={editWeight}
                            onChangeText={setEditWeight}
                            keyboardType="decimal-pad"
                            placeholder="Weight"
                            placeholderTextColor={placeholder}
                          />
                          <ThemedText style={styles.multiplier}>×</ThemedText>
                          <TextInput
                            style={[
                              styles.prInput,
                              { color: textColor, backgroundColor: inputBg },
                            ]}
                            value={editReps}
                            onChangeText={setEditReps}
                            keyboardType="numeric"
                            placeholder="Reps"
                            placeholderTextColor={placeholder}
                          />
                        </View>
                        <View style={styles.editButtonRow}>
                          <Pressable
                            style={styles.cancelButton}
                            onPress={() => {
                              setEditingPRId(null);
                              setEditWeight('');
                              setEditReps('');
                            }}
                          >
                            <ThemedText>Cancel</ThemedText>
                          </Pressable>
                          <Pressable
                            style={[styles.confirmButton, { backgroundColor: activeColor }]}
                            onPress={() => handleSaveEdit(lift)}
                          >
                            <ThemedText style={[styles.confirmButtonText, { color: onTint }]}>Save</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.liftCardContent}
                      onPress={() => handleViewHistory(lift.lift_name)}
                    >
                      <View style={styles.liftInfo}>
                        <ThemedText
                          style={[styles.liftName, !lift.is_active && styles.liftNameInactive]}
                        >
                          {lift.lift_name}
                        </ThemedText>
                        {pr ? (
                          <View style={styles.prInfoContainer}>
                            <View style={styles.prInfo}>
                              <ThemedText style={styles.prValue}>
                                {pr.weight_lbs} lbs × {pr.reps}
                              </ThemedText>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <ThemedText style={styles.prE1rm}>
                                  E1RM: {pr.estimated_1rm.toFixed(0)} lbs
                                </ThemedText>
                                <E1RMInfoTooltip />
                              </View>
                            </View>
                            <ThemedText style={styles.prDate}>
                              Set on {new Date(pr.achieved_at).toLocaleDateString()}
                            </ThemedText>
                          </View>
                        ) : (
                          <ThemedText style={styles.noPR}>No PR recorded</ThemedText>
                        )}
                      </View>
                      <View style={styles.liftActions}>
                        {pr && (
                          <Pressable
                            style={styles.actionButton}
                            onPress={() => {
                              setEditingPRId(lift.id);
                              setEditWeight(pr.weight_lbs.toString());
                              setEditReps(pr.reps.toString());
                            }}
                          >
                            <IconSymbol name="pencil" size={20} color={activeColor} />
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => handleToggleLift(lift)}
                        >
                          <IconSymbol
                            name={lift.is_active ? 'eye.fill' : 'eye.slash.fill'}
                            size={20}
                            color={lift.is_active ? activeColor : sectionTitleColor}
                          />
                        </Pressable>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => handleRemoveLift(lift)}
                        >
                          <IconSymbol name="trash" size={20} color={dangerColor} />
                        </Pressable>
                      </View>
                    </Pressable>
                  )}
                </Animated.View>
              );
            })
          )}
        </View>

        {/* Current Records Summary */}
        {prLifts.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>
              Current Records
            </ThemedText>
            <View style={[styles.summaryCard, { backgroundColor: cardBg }]}>
              {prLifts.map((pr) => (
                <View key={pr.id} style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLift}>{pr.lift_name}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ThemedText style={styles.summaryValue}>
                      {pr.estimated_1rm.toFixed(0)} lbs E1RM
                    </ThemedText>
                    <E1RMInfoTooltip />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addInputContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  addInput: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  addInputButtons: {
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
  emptyCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyCardText: {
    opacity: 0.6,
    textAlign: 'center',
  },
  liftCard: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  liftCardInactive: {
    opacity: 0.6,
  },
  liftCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  liftInfo: {
    flex: 1,
  },
  liftName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  liftNameInactive: {
    opacity: 0.6,
  },
  prInfoContainer: {
    gap: 4,
  },
  prInfo: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  prValue: {
    fontSize: 14,
    opacity: 0.8,
  },
  prE1rm: {
    fontSize: 14,
    fontWeight: '600',
  },
  prDate: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  noPR: {
    fontSize: 14,
    opacity: 0.5,
  },
  liftActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLift: {
    fontSize: 15,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 8,
    textAlign: 'center',
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyDate: {
    fontSize: 14,
    opacity: 0.6,
  },
  improvementBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  improvementText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyStats: {
    flexDirection: 'row',
    gap: 24,
  },
  historyStat: {
    flex: 1,
  },
  historyValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  historyLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  stepLabel: {
    fontSize: 14,
    marginBottom: 12,
    opacity: 0.7,
  },
  prInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  prInput: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  multiplier: {
    fontSize: 20,
    opacity: 0.5,
  },
  e1rmPreview: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  e1rmPreviewText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.3,
  },
  editButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
