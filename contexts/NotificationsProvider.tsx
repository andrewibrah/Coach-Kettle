// NotificationsProvider — bootstraps permissions, registers push token, and
// reconciles the scheduled local notifications based on the user's saved
// preferences. Exposes a minimal API for screens to read/update prefs and
// fire one-shot notifications (PR, rest timer, meal plan).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import {
  fetchPreferences,
  updatePreferences,
  requestPermissionsAndRegisterToken,
  reconcileScheduledNotifications,
  sendTestPush as sendTestPushApi,
} from '@/lib/notifications';
import type { NotificationPreferences } from '@/types/notifications';

interface NotificationsContextValue {
  loading: boolean;
  prefs: NotificationPreferences | null;
  pushToken: string | null;
  permissionGranted: boolean;
  requestPermission: () => Promise<{ granted: boolean; token: string | null }>;
  updatePrefs: (patch: Partial<NotificationPreferences>) => Promise<void>;
  sendTestPush: () => Promise<{ ok: boolean; sent_to: number }>;
  reschedule: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  loading: true,
  prefs: null,
  pushToken: null,
  permissionGranted: false,
  requestPermission: async () => ({ granted: false, token: null }),
  updatePrefs: async () => {},
  sendTestPush: async () => ({ ok: false, sent_to: 0 }),
  reschedule: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

const TRAINING_DAY_MAP: Record<number, number[]> = {
  1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  // Load prefs on auth ready
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) {
        if (isMounted.current) { setPrefs(null); setPushToken(null); setLoading(false); }
        return;
      }
      try {
        const p = await fetchPreferences();
        if (cancelled || !isMounted.current) return;
        setPrefs(p);
      } catch (e) {
        console.warn('[NotificationsProvider] fetch prefs error', e);
      } finally {
        if (!cancelled && isMounted.current) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Reconcile scheduled locals whenever prefs or training-day count change
  useEffect(() => {
    if (!prefs) return;
    const dpw = Number(profile?.training_days_per_week ?? 0);
    const trainingDays = TRAINING_DAY_MAP[dpw] ?? [];
    reconcileScheduledNotifications(prefs, trainingDays).catch((e) =>
      console.warn('[NotificationsProvider] reconcile error', e)
    );
  }, [prefs, profile?.training_days_per_week]);

  const requestPermission = useCallback(async () => {
    const result = await requestPermissionsAndRegisterToken();
    if (isMounted.current) {
      setPushToken(result.token);
      if (result.granted) {
        const p = await fetchPreferences();
        if (isMounted.current) setPrefs(p);
      }
    }
    return result;
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<NotificationPreferences>) => {
    const updated = await updatePreferences(patch);
    if (isMounted.current && updated) setPrefs(updated);
  }, []);

  const sendTestPush = useCallback(() => sendTestPushApi(), []);

  const reschedule = useCallback(async () => {
    if (!prefs) return;
    const dpw = Number(profile?.training_days_per_week ?? 0);
    const trainingDays = TRAINING_DAY_MAP[dpw] ?? [];
    await reconcileScheduledNotifications(prefs, trainingDays);
  }, [prefs, profile?.training_days_per_week]);

  const value = useMemo<NotificationsContextValue>(() => ({
    loading,
    prefs,
    pushToken,
    permissionGranted: prefs?.permission_granted ?? false,
    requestPermission,
    updatePrefs,
    sendTestPush,
    reschedule,
  }), [loading, prefs, pushToken, requestPermission, updatePrefs, sendTestPush, reschedule]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
