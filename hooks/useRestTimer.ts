// useRestTimer — wraps lib/restTimer state machine, ticks every second,
// integrates with the local-notification rest_timer reminder, and exposes a
// simple API to start/pause/resume/cancel/skip.

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useRestTimer() {
  const [state, setState] = useState<RestTimerState>({ kind: 'idle' });
  const { prefs } = useNotifications();
  const notifIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second while running
  useEffect(() => {
    if (state.kind === 'running') {
      intervalRef.current = setInterval(() => {
        setState((s) => tick(s));
      }, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [state.kind]);

  const cancelScheduledNotif = useCallback(async () => {
    const id = notifIdRef.current;
    if (id) {
      await cancelLocal(id);
      notifIdRef.current = null;
    }
  }, []);

  const start = useCallback(async (args: StartArgs, durationSecOverride?: number) => {
    const seconds = durationSecOverride ?? suggestRestSeconds(args);
    setState(startTimer(seconds, { setNumber: args.setNumber, exercise: args.exercise }));
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
  };
}
