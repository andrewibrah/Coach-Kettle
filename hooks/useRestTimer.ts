// useRestTimer — wraps lib/restTimer state machine, ticks every second,
// integrates with the local-notification rest_timer reminder, and exposes a
// simple API to start/pause/resume/cancel/skip.
//
// Persistence: the live state is mirrored to AsyncStorage (start/end timestamps
// + duration + status) so a running timer survives a tab switch, refresh, or
// relaunch. Remaining time is always derived from `endsAt`, never from a counter,
// so it stays accurate regardless of how long the app was backgrounded.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RestTimerState,
  IntensityHints,
  startTimer,
  pauseTimer,
  resumeTimer,
  tick,
  suggestRestSeconds,
  getRemainingSec,
} from '@/lib/restTimer';
import { useNotifications } from '@/contexts/NotificationsProvider';
import { fireRestTimerNotification, cancelLocal } from '@/lib/notifications';

interface StartArgs extends IntensityHints {
  setNumber?: number;
  exercise?: string;
  nextSetHint?: string;
}

interface StartOpts {
  /** Also append a "Rest timer started" marker into the active workout log. */
  logRestEntry?: boolean;
}

type RestEntrySink = (info: { durationSec: number }) => void;

const STORAGE_KEY = 'rest_timer_v1';

// ── Web browser notification helpers (no-op on native) ───────────────────────
function webNotificationsAvailable(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}

function maybeRequestWebPermission(): void {
  if (!webNotificationsAvailable()) return;
  try {
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
  } catch { /* ignore */ }
}

function fireWebNotification(body: string): void {
  if (!webNotificationsAvailable()) return;
  try {
    if (Notification.permission === 'granted') new Notification('Rest complete', { body });
  } catch { /* ignore */ }
}

export function useRestTimer() {
  const [state, setState] = useState<RestTimerState>({ kind: 'idle' });
  // Forces a re-render on each tick so derived values (remainingSec, progress)
  // recompute even when `tick()` returns the same state reference.
  const [, setNowTick] = useState(0);
  const { prefs } = useNotifications();
  const notifIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedRef = useRef(false);
  const prevKindRef = useRef<RestTimerState['kind']>('idle');
  const restEntrySinkRef = useRef<RestEntrySink | null>(null);

  // ── Hydrate persisted state once on mount ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const saved = JSON.parse(raw) as RestTimerState;
            // Derive freshness from timestamps: a running timer may already be done.
            setState(saved.kind === 'running' ? tick(saved) : saved);
          } catch { /* ignore corrupt payload */ }
        }
      })
      .finally(() => {
        hydratedRef.current = true;
      });
  }, []);

  // ── Persist on every change (after hydration) ──────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (state.kind === 'idle' || state.kind === 'done') {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    } else {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
    }
  }, [state]);

  // ── Tick at 4Hz while running ──────────────────────────────────────────────
  // We bump `nowTick` every 250ms so the displayed remaining time and progress
  // ring redraw smoothly. `tick(state)` returns the SAME reference while still
  // running, so without an explicit re-render trigger the countdown appears
  // frozen until expiry.
  useEffect(() => {
    if (state.kind === 'running') {
      intervalRef.current = setInterval(() => {
        setState((s) => tick(s));
        setNowTick((n) => (n + 1) % 1_000_000);
      }, 250);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [state.kind]);

  // ── Fire completion side-effects only on a genuine running → done transition.
  // (Hydrating a timer that finished while the app was closed must NOT re-notify.)
  useEffect(() => {
    if (prevKindRef.current === 'running' && state.kind === 'done') {
      const body = state.exercise ? `${state.exercise} — next set.` : 'Time for your next set.';
      fireWebNotification(body);
    }
    prevKindRef.current = state.kind;
  }, [state.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelScheduledNotif = useCallback(async () => {
    const id = notifIdRef.current;
    if (id) {
      await cancelLocal(id);
      notifIdRef.current = null;
    }
  }, []);

  const registerRestEntrySink = useCallback((sink: RestEntrySink) => {
    restEntrySinkRef.current = sink;
    return () => {
      if (restEntrySinkRef.current === sink) restEntrySinkRef.current = null;
    };
  }, []);

  const start = useCallback(async (args: StartArgs, durationSecOverride?: number, opts?: StartOpts) => {
    const seconds = durationSecOverride ?? suggestRestSeconds(args);
    setState(startTimer(seconds, { setNumber: args.setNumber, exercise: args.exercise }));
    maybeRequestWebPermission();
    if (opts?.logRestEntry) restEntrySinkRef.current?.({ durationSec: seconds });
    await cancelScheduledNotif();
    if (prefs?.rest_timer_enabled && prefs?.permission_granted) {
      const id = await fireRestTimerNotification(seconds, args.exercise, args.nextSetHint);
      notifIdRef.current = id;
    }
  }, [cancelScheduledNotif, prefs?.rest_timer_enabled, prefs?.permission_granted]);

  const pause = useCallback(async () => {
    setState((s) => pauseTimer(s));
    await cancelScheduledNotif();
  }, [cancelScheduledNotif]);

  const resume = useCallback(async () => {
    let remaining = 0;
    setState((s) => {
      const next = resumeTimer(s);
      if (next.kind === 'running') remaining = Math.max(0, Math.ceil((next.endsAt - Date.now()) / 1000));
      return next;
    });
    if (remaining > 0 && prefs?.rest_timer_enabled && prefs?.permission_granted) {
      const id = await fireRestTimerNotification(remaining);
      notifIdRef.current = id;
    }
  }, [prefs?.rest_timer_enabled, prefs?.permission_granted]);

  const cancel = useCallback(async () => {
    setState({ kind: 'idle' });
    await cancelScheduledNotif();
  }, [cancelScheduledNotif]);

  const skip = useCallback(async () => {
    setState({ kind: 'done', durationSec: 0 });
    await cancelScheduledNotif();
  }, [cancelScheduledNotif]);

  useEffect(() => {
    return () => {
      // unmount cleanup
      if (intervalRef.current) clearInterval(intervalRef.current);
      const id = notifIdRef.current;
      if (id) cancelLocal(id).catch(() => undefined);
    };
  }, []);

  return {
    state,
    remainingSec: getRemainingSec(state),
    start,
    pause,
    resume,
    cancel,
    skip,
    registerRestEntrySink,
  };
}
