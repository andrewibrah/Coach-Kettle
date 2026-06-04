// Notification preferences. Allows the user to grant permission, toggle each
// notification category, pick reminder times, and send a test push.

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '@/contexts/NotificationsProvider';
import type { NotificationPreferences } from '@/types/notifications';

const KIND_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'rest_timer_enabled',            label: 'Rest timer',              description: 'Buzz when your rest is up.' },
  { key: 'workout_reminder_enabled',      label: 'Workout reminders',       description: 'Daily nudge on your scheduled training days.' },
  { key: 'nutrition_midday_enabled',      label: 'Mid-day nutrition check', description: 'Catch macro gaps before dinner.' },
  { key: 'daily_feedback_enabled',        label: 'Daily coach report',      description: 'Your honest end-of-day read.' },
  { key: 'pr_celebration_enabled',        label: 'PR celebrations',         description: 'Push when you hit a new PR.' },
  { key: 'streak_milestones_enabled',     label: 'Streak milestones',       description: 'Acknowledge 3/7/14/30-day streaks.' },
  { key: 'harshness_escalation_enabled',  label: 'Accountability nudges',   description: 'Direct messages when you slip multiple days.' },
  { key: 'meal_plan_enabled',             label: 'Meal plan ready',         description: 'When this week’s plan is generated.' },
  { key: 'weekly_recalibration_enabled',  label: 'Weekly recalibration',    description: 'Sunday reminder to review and adjust.' },
  { key: 'body_weight_reminder_enabled',  label: 'Weekly weigh-in',         description: 'Sunday reminder to log your weight.' },
  { key: 'resting_hr_alert_enabled',      label: 'Resting HR alerts',       description: 'When RHR spikes — recovery flag.' },
  { key: 'inactivity_reengagement_enabled', label: 'Re-engagement',         description: '3+ days of inactivity wake-up.' },
];

export default function NotificationsSettingsScreen() {
  const { prefs, permissionGranted, requestPermission, updatePrefs, sendTestPush, loading } = useNotifications();
  const insets = useSafeAreaInsets();
  const bg = useThemeColor({}, 'background');
  const cardBg = useThemeColor({}, 'cardBackground');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const subtle = useThemeColor({}, 'placeholder');

  const [busy, setBusy] = useState(false);

  const handleRequestPermission = async () => {
    setBusy(true);
    try {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          'Notifications disabled',
          'Enable notifications for Coach Kettle in iOS Settings to receive coach reports, workout reminders, and rest-timer alerts.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTestPush = async () => {
    setBusy(true);
    try {
      const r = await sendTestPush();
      Alert.alert(r.ok ? 'Sent' : 'Could not send', r.ok ? `Test push sent to ${r.sent_to} device(s).` : 'Make sure notifications are enabled and you’re running on a real device.');
    } finally {
      setBusy(false);
    }
  };

  const setToggle = (key: keyof NotificationPreferences) => async (val: boolean) => {
    await updatePrefs({ [key]: val } as Partial<NotificationPreferences>);
  };

  const adjustHour = async (key: 'workout_reminder_hour' | 'nutrition_midday_hour' | 'daily_feedback_hour', delta: number) => {
    if (!prefs) return;
    const current = (prefs as unknown as Record<string, number>)[key] ?? 0;
    const next = ((current + delta) + 24) % 24;
    await updatePrefs({ [key]: next } as Partial<NotificationPreferences>);
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>

        {/* Permission card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <ThemedText type="subtitle">Permission</ThemedText>
          <ThemedText style={{ color: subtle, marginTop: 4 }}>
            {permissionGranted ? 'Notifications are enabled.' : 'Notifications need to be enabled for any of this to fire.'}
          </ThemedText>
          {!permissionGranted && (
            <Pressable
              onPress={handleRequestPermission}
              style={({ pressed }) => [styles.btn, { backgroundColor: tint }, pressed && { opacity: 0.7 }]}
              disabled={busy}
            >
              <ThemedText style={[styles.btnText, { color: onTint }]}>
                {busy ? 'Working…' : 'Enable notifications'}
              </ThemedText>
            </Pressable>
          )}
          {permissionGranted && (
            <Pressable
              onPress={handleTestPush}
              style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.7 }]}
              disabled={busy}
            >
              <ThemedText style={[styles.btnText, { color: tint }]}>Send test push</ThemedText>
            </Pressable>
          )}
        </View>

        {/* Times */}
        {prefs && (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <ThemedText type="subtitle">Reminder times</ThemedText>
            <View style={styles.row}>
              <ThemedText style={{ flex: 1 }}>Workout reminder</ThemedText>
              <Stepper value={prefs.workout_reminder_hour} onDec={() => adjustHour('workout_reminder_hour', -1)} onInc={() => adjustHour('workout_reminder_hour', 1)} suffix=":00" tint={tint} />
            </View>
            <View style={styles.row}>
              <ThemedText style={{ flex: 1 }}>Mid-day check</ThemedText>
              <Stepper value={prefs.nutrition_midday_hour} onDec={() => adjustHour('nutrition_midday_hour', -1)} onInc={() => adjustHour('nutrition_midday_hour', 1)} suffix=":00" tint={tint} />
            </View>
            <View style={styles.row}>
              <ThemedText style={{ flex: 1 }}>Daily coach report</ThemedText>
              <Stepper value={prefs.daily_feedback_hour} onDec={() => adjustHour('daily_feedback_hour', -1)} onInc={() => adjustHour('daily_feedback_hour', 1)} suffix=":00" tint={tint} />
            </View>
          </View>
        )}

        {/* Toggles */}
        {prefs && (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <ThemedText type="subtitle">What gets pushed</ThemedText>
            {KIND_LABELS.map(({ key, label, description }) => (
              <View key={String(key)} style={styles.row}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <ThemedText style={{ fontWeight: '600' }}>{label}</ThemedText>
                  <ThemedText style={{ color: subtle, fontSize: 12, marginTop: 2 }}>{description}</ThemedText>
                </View>
                <Switch
                  value={Boolean((prefs as unknown as Record<string, boolean>)[key as string])}
                  onValueChange={setToggle(key)}
                  trackColor={{ true: tint, false: undefined }}
                  disabled={!permissionGranted}
                />
              </View>
            ))}
          </View>
        )}

        {loading && <ActivityIndicator color={tint} />}
      </ScrollView>
    </ThemedView>
  );
}

function Stepper({ value, onDec, onInc, suffix, tint }: { value: number; onDec: () => void; onInc: () => void; suffix?: string; tint: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}>
        <ThemedText style={{ color: tint, fontSize: 18, fontWeight: '700' }}>−</ThemedText>
      </Pressable>
      <ThemedText style={{ minWidth: 50, textAlign: 'center', fontWeight: '600' }}>{value.toString().padStart(2, '0')}{suffix ?? ''}</ThemedText>
      <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}>
        <ThemedText style={{ color: tint, fontSize: 18, fontWeight: '700' }}>+</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  card: { padding: 16, borderRadius: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnText: { fontWeight: '700' },
  stepBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
