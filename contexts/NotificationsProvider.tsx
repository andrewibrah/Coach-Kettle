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
import { resolveTrainingDays } from '@/lib/trainingSchedule';
import type { NotificationPreferences } from '@/types/notifications';

interface NotificationsContextValue {
  loading: boolean;
  saving: boolean;
  error: string | null;
  reloadPrefs: () => Promise<void>;
  prefs: NotificationPreferences | null;
  getConfirmedPrefs: () => NotificationPreferences | null;
  pushToken: string | null;
  permissionGranted: boolean;
  requestPermission: () => Promise<{ granted: boolean; token: string | null }>;
  updatePrefs: (patch: Partial<NotificationPreferences>) => Promise<void>;
  sendTestPush: () => Promise<{ ok: boolean; sent_to: number }>;
  reschedule: () => Promise<void>;
}

interface PreferencesScope {
  userId: string | null;
  revision: number;
  phase: 'idle' | 'saving' | 'refreshing';
  ready: boolean;
  refreshPending: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  loading: true,
  saving: false,
  error: null,
  reloadPrefs: async () => {},
  prefs: null,
  getConfirmedPrefs: () => null,
  pushToken: null,
  permissionGranted: false,
  requestPermission: async () => ({ granted: false, token: null }),
  updatePrefs: async () => {},
  sendTestPush: async () => ({ ok: false, sent_to: 0 }),
  reschedule: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fence old-account responses even before the auth-change effect runs.
  const scope = useRef<PreferencesScope>({ userId, revision: 0, phase: 'idle', ready: false, refreshPending: false });
  if (scope.current.userId !== userId) scope.current = { userId, revision: 0, phase: 'idle', ready: false, refreshPending: false };
  const renderedScope = scope.current;
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  // Updated at acknowledgement time, not after the next consumer render.
  const confirmedPrefs = useRef<NotificationPreferences | null>(null);
  const isMounted = useRef(true);
  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);
  const getConfirmedPrefs = useCallback(() => {
    const p = confirmedPrefs.current;
    return isMounted.current && p?.user_id === scope.current.userId ? p : null;
  }, []);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const reloadPrefs = useCallback(async () => {
    const owner = renderedScope;
    if (!userId || scope.current !== owner || !isMounted.current) return;
    // One owner-local lane covers saves AND refreshes. React loading is display
    // state, never a lock: callers may retain a callback from an older render.
    if (owner.phase !== 'idle') { owner.refreshPending = true; return; }
    owner.phase = 'refreshing';
    setLoading(true);
    try {
      do {
        owner.refreshPending = false;
        const revision = ++owner.revision;
        setError(null);
        try {
          const p = await fetchPreferences(userId);
          if (!isMounted.current || scope.current !== owner || owner.revision !== revision) return;
          if (p.user_id !== userId) throw new Error('Unconfirmed preferences');
          owner.ready = true;
          confirmedPrefs.current = p;
          setPrefs(p);
        } catch {
          if (isMounted.current && scope.current === owner && owner.revision === revision) {
            setError('Preferences could not be loaded. Retry when connected.');
          }
        }
        // Registration can finish while this GET is in flight. Drain its intent
        // before releasing the lane, even if this GET failed.
      } while (isMounted.current && scope.current === owner && owner.refreshPending);
    } finally {
      owner.phase = 'idle';
      if (isMounted.current && scope.current === owner) setLoading(false);
    }
  }, [userId, renderedScope]);

  useEffect(() => {
    confirmedPrefs.current = null;
    setPrefs(null);
    setPushToken(null);
    setSaving(false);
    setError(null);
    setLoading(Boolean(userId));
    void reloadPrefs();
  }, [userId, reloadPrefs]);

  // Reconcile scheduled locals whenever prefs or training-day count change
  useEffect(() => {
    if (!prefs || prefs.user_id !== userId) return;
    const dpw = Number(profile?.training_days_per_week ?? 0);
    const trainingDays = resolveTrainingDays(dpw, profile?.training_days);
    reconcileScheduledNotifications(prefs, trainingDays).catch((e) =>
      console.warn('[NotificationsProvider] reconcile error', e)
    );
  }, [prefs, userId, profile?.training_days_per_week, profile?.training_days]);

  const requestPermission = useCallback(async () => {
    const owner = renderedScope;
    if (!userId || scope.current !== owner || !isMounted.current) return { granted: false, token: null };
    const result = await requestPermissionsAndRegisterToken(userId);
    if (isMounted.current && scope.current === owner && owner.userId === userId) {
      setPushToken(result.token);
      if (result.granted) await reloadPrefs();
    }
    return result;
  }, [reloadPrefs, userId, renderedScope]);

  const updatePrefs = useCallback(async (patch: Partial<NotificationPreferences>) => {
    const owner = renderedScope;
    if (!userId || !isMounted.current || scope.current !== owner || !owner.ready || owner.phase === 'refreshing') throw new Error('Preferences are not ready.');
    if (owner.phase === 'saving') throw new Error('Preferences are already saving.');
    owner.phase = 'saving';
    ++owner.revision;
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePreferences(patch, userId);
      if (!isMounted.current || scope.current !== owner) throw new Error('Account changed.');
      if (!updated || updated.user_id !== userId) throw new Error('Unconfirmed preferences');
      confirmedPrefs.current = updated;
      setPrefs(updated);
    } catch (e) {
      if (isMounted.current && scope.current === owner) setError('Preferences were not saved. Please retry.');
      throw e;
    } finally {
      owner.phase = 'idle';
      if (isMounted.current && scope.current === owner) {
        setSaving(false);
        if (owner.refreshPending) await reloadPrefs();
      }
    }
  }, [userId, renderedScope, reloadPrefs]);

  const sendTestPush = useCallback(() => sendTestPushApi(), []);

  const reschedule = useCallback(async () => {
    if (!prefs || prefs.user_id !== userId) return;
    const dpw = Number(profile?.training_days_per_week ?? 0);
    const trainingDays = resolveTrainingDays(dpw, profile?.training_days);
    await reconcileScheduledNotifications(prefs, trainingDays);
  }, [prefs, userId, profile?.training_days_per_week, profile?.training_days]);

  // Only the current account's prefs are ever exposed (fences a stale render).
  const ownPrefs = prefs?.user_id === userId ? prefs : null;
  const value = useMemo<NotificationsContextValue>(() => ({
    loading: loading || Boolean(userId && !ownPrefs && !error),
    saving,
    error,
    reloadPrefs,
    prefs: ownPrefs,
    getConfirmedPrefs,
    pushToken,
    permissionGranted: ownPrefs?.permission_granted ?? false,
    requestPermission,
    updatePrefs,
    sendTestPush,
    reschedule,
  }), [getConfirmedPrefs, loading, saving, error, reloadPrefs, userId, ownPrefs, pushToken, requestPermission, updatePrefs, sendTestPush, reschedule]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
