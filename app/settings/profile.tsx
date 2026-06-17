import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProfile } from '@/contexts/ProfileContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';

const FOCUS_OPTIONS = [
  { label: 'Strength', value: 'strength' },
  { label: 'Lean Muscle', value: 'lean_muscle' },
  { label: 'Fat Loss', value: 'fat_loss' },
  { label: 'Other', value: 'other' },
];

export default function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const activeColor = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');

  const { profile, profileLoading, updateProfile, refreshProfile } = useProfile();

  // Refresh profile when screen mounts to ensure we have latest data
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const cardBg = useThemeColor({}, 'cardBackground');
  const sectionTitleColor = '#8E8E93';

  // Form state
  const [heightValue, setHeightValue] = useState(profile?.height_value?.toString() || '');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(profile?.height_unit || 'in');
  const [dob, setDob] = useState<Date | null>(profile?.dob ? new Date(profile.dob) : null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentWeight, setCurrentWeight] = useState(profile?.current_weight?.toString() || '');
  const [goalWeight, setGoalWeight] = useState(profile?.goal_weight?.toString() || '');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>(profile?.weight_unit || 'lb');
  const [focus, setFocus] = useState<string | null>(profile?.focus || null);
  const [focusOther, setFocusOther] = useState(profile?.focus_other || '');
  const [saving, setSaving] = useState(false);

  // Update state when profile loads
  useEffect(() => {
    if (profile) {
      setHeightValue(profile.height_value?.toString() || '');
      setHeightUnit(profile.height_unit || 'in');
      setDob(profile.dob ? new Date(profile.dob) : null);
      setCurrentWeight(profile.current_weight?.toString() || '');
      setGoalWeight(profile.goal_weight?.toString() || '');
      setWeightUnit(profile.weight_unit || 'lb');
      setFocus(profile.focus || null);
      setFocusOther(profile.focus_other || '');
    }
  }, [profile]);

  const calculateAge = (date: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};

      if (heightValue) updates.height_value = parseFloat(heightValue);
      else updates.height_value = null;
      updates.height_unit = heightUnit;

      if (dob) updates.dob = dob.toISOString().split('T')[0];
      else updates.dob = null;

      if (currentWeight) updates.current_weight = parseFloat(currentWeight);
      else updates.current_weight = null;
      if (goalWeight) updates.goal_weight = parseFloat(goalWeight);
      else updates.goal_weight = null;
      updates.weight_unit = weightUnit;

      updates.focus = focus;
      updates.focus_other = focus === 'other' ? focusOther : null;

      const success = await updateProfile(updates);

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Saved', 'Your profile has been updated.');
      } else {
        Alert.alert('Error', 'Failed to save profile. Please try again.');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Show loading state while profile is being fetched
  if (profileLoading) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer, { paddingTop: insets.top + 20, backgroundColor }]}>
        <ActivityIndicator size="large" color={activeColor} />
        <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
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
          Edit Profile
        </ThemedText>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, pressed && styles.buttonPressed]}
        >
          <ThemedText style={[styles.saveText, { color: activeColor }]}>
            {saving ? 'Saving...' : 'Save'}
          </ThemedText>
        </Pressable>
      </View>

      {!profile && (
        <View style={[styles.infoBox, { backgroundColor: isDark ? '#0a2540' : '#E8F4FD', marginHorizontal: 20, marginBottom: 16 }]}>
          <IconSymbol name="info.circle" size={18} color={activeColor} />
          <ThemedText style={[styles.infoText, { color: isDark ? '#64B5F6' : '#0066CC' }]}>
            Fill out your profile to personalize your experience. All fields are optional.
          </ThemedText>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Physical Stats */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Physical Stats
          </ThemedText>

          {/* Height */}
          <View style={[styles.fieldRow, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.fieldLabel}>Height</ThemedText>
            <View style={styles.fieldInput}>
              <Pressable
                style={[styles.inputField, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}
                onPress={() => {
                  Alert.prompt(
                    'Enter Height',
                    `Height in ${heightUnit === 'cm' ? 'centimeters' : 'inches'}`,
                    (text) => text && setHeightValue(text),
                    'plain-text',
                    heightValue
                  );
                }}
              >
                <ThemedText>{heightValue || 'Not set'}</ThemedText>
              </Pressable>
              <View style={styles.unitToggle}>
                <Pressable
                  style={[
                    styles.unitOption,
                    heightUnit === 'in' && { backgroundColor: activeColor },
                  ]}
                  onPress={() => setHeightUnit('in')}
                >
                  <ThemedText style={[styles.unitText, heightUnit === 'in' && [styles.unitTextActive, { color: onTint }]]}>
                    in
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.unitOption,
                    heightUnit === 'cm' && { backgroundColor: activeColor },
                  ]}
                  onPress={() => setHeightUnit('cm')}
                >
                  <ThemedText style={[styles.unitText, heightUnit === 'cm' && [styles.unitTextActive, { color: onTint }]]}>
                    cm
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Age/DOB */}
          <Pressable
            style={[styles.fieldRow, { backgroundColor: cardBg }]}
            onPress={() => setShowDatePicker(true)}
          >
            <ThemedText style={styles.fieldLabel}>Date of Birth</ThemedText>
            <View style={styles.fieldValue}>
              <ThemedText>
                {dob ? `${dob.toLocaleDateString()} (${calculateAge(dob)} years)` : 'Not set'}
              </ThemedText>
              <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
            </View>
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={dob || new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) setDob(selectedDate);
              }}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              themeVariant={isDark ? 'dark' : 'light'}
            />
          )}

          {/* Current Weight */}
          <View style={[styles.fieldRow, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.fieldLabel}>Current Weight</ThemedText>
            <View style={styles.fieldInput}>
              <Pressable
                style={[styles.inputField, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}
                onPress={() => {
                  Alert.prompt(
                    'Enter Weight',
                    `Current weight in ${weightUnit}`,
                    (text) => text && setCurrentWeight(text),
                    'plain-text',
                    currentWeight
                  );
                }}
              >
                <ThemedText>{currentWeight || 'Not set'}</ThemedText>
              </Pressable>
              <View style={styles.unitToggle}>
                <Pressable
                  style={[
                    styles.unitOption,
                    weightUnit === 'lb' && { backgroundColor: activeColor },
                  ]}
                  onPress={() => setWeightUnit('lb')}
                >
                  <ThemedText style={[styles.unitText, weightUnit === 'lb' && [styles.unitTextActive, { color: onTint }]]}>
                    lb
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.unitOption,
                    weightUnit === 'kg' && { backgroundColor: activeColor },
                  ]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <ThemedText style={[styles.unitText, weightUnit === 'kg' && [styles.unitTextActive, { color: onTint }]]}>
                    kg
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Goal Weight */}
          <View style={[styles.fieldRow, { backgroundColor: cardBg }]}>
            <ThemedText style={styles.fieldLabel}>Goal Weight</ThemedText>
            <View style={styles.fieldInput}>
              <Pressable
                style={[styles.inputField, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}
                onPress={() => {
                  Alert.prompt(
                    'Enter Goal Weight',
                    `Goal weight in ${weightUnit}`,
                    (text) => text && setGoalWeight(text),
                    'plain-text',
                    goalWeight
                  );
                }}
              >
                <ThemedText>{goalWeight || 'Not set'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Fitness Focus */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Fitness Focus
          </ThemedText>

          {FOCUS_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.focusOption,
                { backgroundColor: cardBg },
                focus === option.value && { borderColor: activeColor, borderWidth: 2 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFocus(option.value);
              }}
            >
              <ThemedText style={styles.focusLabel}>{option.label}</ThemedText>
              {focus === option.value && (
                <IconSymbol name="checkmark.circle.fill" size={22} color={activeColor} />
              )}
            </Pressable>
          ))}

          {focus === 'other' && (
            <Pressable
              style={[styles.fieldRow, { backgroundColor: cardBg, marginTop: 8 }]}
              onPress={() => {
                Alert.prompt(
                  'Describe Your Goal',
                  'What is your fitness focus?',
                  (text) => text && setFocusOther(text),
                  'plain-text',
                  focusOther
                );
              }}
            >
              <ThemedText style={styles.fieldLabel}>Describe</ThemedText>
              <ThemedText style={{ opacity: focusOther ? 1 : 0.5 }}>
                {focusOther || 'Tap to enter'}
              </ThemedText>
            </Pressable>
          )}
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.6,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  fieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputField: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  unitOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
  },
  unitTextActive: {
    color: '#fff',
  },
  focusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  focusLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
