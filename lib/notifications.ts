// Client-side notifications: permissions, push-token registration with the
// server, and helpers for scheduling/cancelling local notifications.
//
// All `Notifications.*` calls are guarded behind a lazy import + try/catch so
// the app boots even if `expo-notifications` isn't installed yet. (Phase-1
// requirement: user runs `npx expo install expo-notifications`.)

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type { NotificationKind, NotificationPreferences } from '@/types/notifications';

const API = `${supabaseUrl}/functions/v1/notifications`;

type NotificationsModule = typeof import('expo-notifications');
let _Notifications: NotificationsModule | null | undefined;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (_Notifications !== undefined) return _Notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    _Notifications = mod;
    // Default handler — show alert + play sound when app is foregrounded
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return mod;
  } catch (e) {
    console.warn('[notifications] expo-notifications not installed yet — local notifications disabled');
    _Notifications = null;
    return null;
  }
}

// ---------- API ----------
export async function fetchPreferences(): Promise<NotificationPreferences | null> {
  const res = await fetchWithAuth(`${API}?action=prefs`, { method: 'GET' });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.prefs ?? null;
}

export async function updatePreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences | null> {
  const res = await fetchWithAuth(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'update_prefs', ...patch }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.prefs ?? null;
}

export async function registerPushToken(token: string, platform: 'ios' | 'android' | 'web', extras: { device_id?: string; app_version?: string } = {}): Promise<boolean> {
  const res = await fetchWithAuth(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'register_token', expo_push_token: token, platform, ...extras }),
  });
  return res.ok;
}

export async function revokePushToken(token: string): Promise<boolean> {
  const res = await fetchWithAuth(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'revoke_token', expo_push_token: token }),
  });
  return res.ok;
}

export async function sendTestPush(): Promise<{ ok: boolean; sent_to: number }> {
  const res = await fetchWithAuth(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'send_test' }),
  });
  return await res.json();
}

// ---------- Permissions + push token bootstrap ----------
export async function requestPermissionsAndRegisterToken(): Promise<{ granted: boolean; token: string | null }> {
  if ((Platform.OS as string) === 'web') return { granted: false, token: null };

  const N = await loadNotifications();
  if (!N) return { granted: false, token: null };

  try {
    const settings = await N.getPermissionsAsync();
    let granted = settings.granted ||
      settings.ios?.status === N.IosAuthorizationStatus.PROVISIONAL ||
      settings.ios?.status === N.IosAuthorizationStatus.AUTHORIZED;

    if (!granted) {
      const req = await N.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
      granted = req.granted ||
        req.ios?.status === N.IosAuthorizationStatus.PROVISIONAL ||
        req.ios?.status === N.IosAuthorizationStatus.AUTHORIZED;
    }
    if (!granted) return { granted: false, token: null };

    const projectId = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.eas as { projectId?: string } | undefined;
    const tokenObj = await N.getExpoPushTokenAsync(projectId?.projectId ? { projectId: projectId.projectId } : undefined);
    const token = tokenObj?.data ?? null;
    if (token) {
      const nativePlatform = Platform.OS as string;
      await registerPushToken(token, nativePlatform === 'android' ? 'android' : 'ios', {
        app_version: Constants.expoConfig?.version,
      });
    }
    return { granted: true, token };
  } catch (e) {
    console.warn('[notifications] permission/token error', e);
    return { granted: false, token: null };
  }
}

// ---------- Local schedules ----------

interface DailyTrigger { type: 'daily'; hour: number; minute: number }
interface WeeklyTrigger { type: 'weekly'; weekday: number; hour: number; minute: number } // 1=Sun..7=Sat
interface OneShotTrigger { type: 'oneshot'; seconds: number }

type LocalTrigger = DailyTrigger | WeeklyTrigger | OneShotTrigger;

const NOTIFICATION_KIND_KEY = 'kind';

/** Schedule a local notification; returns identifier so caller can cancel. */
export async function scheduleLocal(opts: {
  kind: NotificationKind;
  title: string;
  body: string;
  trigger: LocalTrigger;
  data?: Record<string, unknown>;
}): Promise<string | null> {
  const N = await loadNotifications();
  if (!N) return null;

  let trigger: import('expo-notifications').NotificationTriggerInput;
  if (opts.trigger.type === 'daily') {
    trigger = {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour: opts.trigger.hour,
      minute: opts.trigger.minute,
    };
  } else if (opts.trigger.type === 'weekly') {
    trigger = {
      type: N.SchedulableTriggerInputTypes.WEEKLY,
      weekday: opts.trigger.weekday,
      hour: opts.trigger.hour,
      minute: opts.trigger.minute,
    };
  } else {
    trigger = {
      type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: opts.trigger.seconds,
      repeats: false,
    };
  }

  const id = await N.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body,
      sound: 'default',
      data: { [NOTIFICATION_KIND_KEY]: opts.kind, ...(opts.data ?? {}) },
    },
    trigger,
  });
  return id ?? null;
}

export async function cancelLocal(identifier: string): Promise<void> {
  const N = await loadNotifications();
  if (!N) return;
  try { await N.cancelScheduledNotificationAsync(identifier); } catch { /* ignore */ }
}

export async function cancelAllLocalForKind(kind: NotificationKind): Promise<void> {
  const N = await loadNotifications();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => {
          const data = n.content?.data as Record<string, unknown> | null | undefined;
          return data?.[NOTIFICATION_KIND_KEY] === kind;
        })
        .map((n) => N.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch { /* ignore */ }
}

export async function cancelAllLocal(): Promise<void> {
  const N = await loadNotifications();
  if (!N) return;
  try { await N.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ }
}

// ---------- High-level schedulers (idempotent) ----------
export async function reconcileScheduledNotifications(prefs: NotificationPreferences, trainingDayWeekdays: number[]): Promise<void> {
  // Wipe and re-schedule the time-based kinds. One-shot kinds (rest_timer,
  // pr_celebration) are scheduled at the moment they're needed, not here.
  await Promise.all([
    cancelAllLocalForKind('workout_reminder'),
    cancelAllLocalForKind('nutrition_midday'),
    cancelAllLocalForKind('daily_feedback'),
    cancelAllLocalForKind('weekly_recalibration'),
    cancelAllLocalForKind('body_weight_reminder'),
  ]);

  if (!prefs.permission_granted) return;

  if (prefs.workout_reminder_enabled && trainingDayWeekdays.length > 0) {
    for (const wd of trainingDayWeekdays) {
      // expo-notifications weekday: 1=Sun..7=Sat ; our wd: 0=Sun..6=Sat
      await scheduleLocal({
        kind: 'workout_reminder',
        title: 'Time to train.',
        body: 'Open the app and get the session in.',
        trigger: { type: 'weekly', weekday: wd + 1, hour: prefs.workout_reminder_hour, minute: prefs.workout_reminder_minute },
      });
    }
  }

  if (prefs.nutrition_midday_enabled) {
    await scheduleLocal({
      kind: 'nutrition_midday',
      title: 'Mid-day nutrition check',
      body: 'Quick scan: protein on track? Log what you’ve eaten so far.',
      trigger: { type: 'daily', hour: prefs.nutrition_midday_hour, minute: 0 },
    });
  }

  if (prefs.daily_feedback_enabled) {
    await scheduleLocal({
      kind: 'daily_feedback',
      title: 'Your coach report is ready.',
      body: 'Open the app for today’s honest read.',
      trigger: { type: 'daily', hour: prefs.daily_feedback_hour, minute: 0 },
    });
  }

  if (prefs.weekly_recalibration_enabled) {
    // Sunday 9:00am
    await scheduleLocal({
      kind: 'weekly_recalibration',
      title: 'Weekly recalibration',
      body: 'Time to review last week and refresh the plan.',
      trigger: { type: 'weekly', weekday: 1, hour: 9, minute: 0 },
    });
  }

  if (prefs.body_weight_reminder_enabled) {
    // Sunday 8:00am
    await scheduleLocal({
      kind: 'body_weight_reminder',
      title: 'Log your weight',
      body: 'Weekly weigh-in keeps your targets accurate.',
      trigger: { type: 'weekly', weekday: 1, hour: 8, minute: 0 },
    });
  }
}

// ---------- Convenience fires (one-shot moments) ----------
export async function fireRestTimerNotification(seconds: number, exercise?: string, nextSetHint?: string): Promise<string | null> {
  return scheduleLocal({
    kind: 'rest_timer',
    title: 'Rest complete.',
    body: nextSetHint ?? (exercise ? `${exercise} — next set.` : 'Next set.'),
    trigger: { type: 'oneshot', seconds: Math.max(2, Math.round(seconds)) },
  });
}

export async function firePRCelebration(liftName: string, weight: number, reps: number): Promise<string | null> {
  return scheduleLocal({
    kind: 'pr_celebration',
    title: `New PR: ${liftName}`,
    body: `${weight} lbs × ${reps}. Banked it.`,
    trigger: { type: 'oneshot', seconds: 1 },
  });
}

export async function fireStreakMilestone(days: number): Promise<string | null> {
  return scheduleLocal({
    kind: 'streak_milestones',
    title: `${days}-day streak`,
    body: 'Momentum compounds. Don’t break it.',
    trigger: { type: 'oneshot', seconds: 1 },
  });
}

export async function fireMealPlanReady(): Promise<string | null> {
  return scheduleLocal({
    kind: 'meal_plan',
    title: 'Your week’s meal plan is ready.',
    body: 'Open Nutrition → This Week.',
    trigger: { type: 'oneshot', seconds: 1 },
  });
}
