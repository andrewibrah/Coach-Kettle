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
import { useAuth } from '@/components/AuthProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Colors } from '@/constants/theme';
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
} from '@/lib/profile';

export default function PRTrackingScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const activeColor = useThemeColor({}, 'tint');

  const { session } = useAuth();

  const cardBg = isDark ? Colors.dark.cardBackground : '#F2F2F7';
  const sectionTitleColor = '#8E8E93';

  const [trackedLifts, setTrackedLifts] = useState<PRTrackedLift[]>([]);
  const [prLifts, setPRLifts] = useState<PRLift[]>([]);
  const [selectedLiftHistory, setSelectedLiftHistory] = useState<PRHistory[] | null>(null);
  const [selectedLiftName, setSelectedLiftName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLiftName, setNewLiftName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

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

    try {
      const lift = await addTrackedLift(session.user.id, newLiftName.trim());
      if (lift) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTrackedLifts([...trackedLifts, lift]);
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
                    <View style={[styles.improvementBadge, { backgroundColor: '#34C75920' }]}>
                      <ThemedText style={styles.improvementText}>
                        +{record.improvement_pct.toFixed(1)}%
                      </ThemedText>
                    </View>
                  )}
                </View>
                <View style={styles.historyStats}>
                  <View style={styles.historyStat}>
                    <ThemedText style={styles.historyValue}>
                      {record.weight_lbs} x {record.reps}
                    </ThemedText>
                    <ThemedText style={styles.historyLabel}>Weight x Reps</ThemedText>
                  </View>
                  <View style={styles.historyStat}>
                    <ThemedText style={styles.historyValue}>
                      {record.estimated_1rm.toFixed(0)} lbs
                    </ThemedText>
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
            <TextInput
              style={[
                styles.addInput,
                { color: textColor, backgroundColor: isDark ? '#2c2c2e' : '#fff' },
              ]}
              value={newLiftName}
              onChangeText={setNewLiftName}
              placeholder="Enter lift name..."
              placeholderTextColor={isDark ? '#666' : '#999'}
              autoFocus
              onSubmitEditing={handleAddLift}
            />
            <View style={styles.addInputButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddInput(false);
                  setNewLiftName('');
                }}
              >
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, { backgroundColor: activeColor }]}
                onPress={handleAddLift}
                disabled={!newLiftName.trim()}
              >
                <ThemedText style={styles.confirmButtonText}>Add</ThemedText>
              </Pressable>
            </View>
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
                        <View style={styles.prInfo}>
                          <ThemedText style={styles.prValue}>
                            {pr.weight_lbs} lbs x {pr.reps}
                          </ThemedText>
                          <ThemedText style={styles.prE1rm}>
                            E1RM: {pr.estimated_1rm.toFixed(0)} lbs
                          </ThemedText>
                        </View>
                      ) : (
                        <ThemedText style={styles.noPR}>No PR recorded</ThemedText>
                      )}
                    </View>
                    <View style={styles.liftActions}>
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
                        <IconSymbol name="trash" size={20} color="#FF3B30" />
                      </Pressable>
                    </View>
                  </Pressable>
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
                  <ThemedText style={styles.summaryValue}>
                    {pr.estimated_1rm.toFixed(0)} lbs E1RM
                  </ThemedText>
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
  prInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  prValue: {
    fontSize: 14,
    opacity: 0.8,
  },
  prE1rm: {
    fontSize: 14,
    fontWeight: '600',
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
    color: '#34C759',
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
});
