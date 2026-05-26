// Lightweight rest-timer state machine for in-session coaching.
// Pure logic — no React. Lives in lib/ so it can be unit-tested and consumed
// by a hook (hooks/useRestTimer.ts) and the AuthLockProvider lifecycle.

export type RestTimerState =
  | { kind: 'idle' }
  | { kind: 'running'; endsAt: number; durationSec: number; setNumber?: number; exercise?: string }
  | { kind: 'paused'; remainingSec: number; durationSec: number; setNumber?: number; exercise?: string }
  | { kind: 'done';   durationSec: number; setNumber?: number; exercise?: string };

export interface IntensityHints {
  /** Approximate top set reps (lower = heavier → longer rest). */
  repsLastSet?: number;
  /** Is this a compound? Compounds get longer rest by default. */
  isCompound?: boolean;
  /** Optional explicit override from a program/template. */
  prescribedRestSec?: number;
}

/**
 * Suggest a rest duration in seconds based on the intensity of the prior set.
 * Single source of truth: heavy compounds get 2:30–3:00, hypertrophy 60–120s,
 * accessory isolation 45–75s.
 */
export function suggestRestSeconds(h: IntensityHints): number {
  if (h.prescribedRestSec && h.prescribedRestSec > 0) {
    return Math.min(Math.max(h.prescribedRestSec, 15), 600);
  }
  const reps = h.repsLastSet ?? 8;
  const compound = h.isCompound ?? false;
  if (compound) {
    if (reps <= 5) return 180;      // 3:00
    if (reps <= 8) return 150;      // 2:30
    if (reps <= 12) return 120;     // 2:00
    return 90;
  }
  // Isolation
  if (reps <= 8) return 90;
  if (reps <= 12) return 75;
  return 60;
}

export function startTimer(durationSec: number, opts: { setNumber?: number; exercise?: string } = {}): RestTimerState {
  const safe = Math.min(Math.max(Math.round(durationSec), 5), 600);
  return { kind: 'running', endsAt: Date.now() + safe * 1000, durationSec: safe, ...opts };
}

export function pauseTimer(state: RestTimerState): RestTimerState {
  if (state.kind !== 'running') return state;
  const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  return { kind: 'paused', remainingSec: remaining, durationSec: state.durationSec, setNumber: state.setNumber, exercise: state.exercise };
}

export function resumeTimer(state: RestTimerState): RestTimerState {
  if (state.kind !== 'paused') return state;
  return { kind: 'running', endsAt: Date.now() + state.remainingSec * 1000, durationSec: state.durationSec, setNumber: state.setNumber, exercise: state.exercise };
}

export function tick(state: RestTimerState): RestTimerState {
  if (state.kind !== 'running') return state;
  if (Date.now() >= state.endsAt) {
    return { kind: 'done', durationSec: state.durationSec, setNumber: state.setNumber, exercise: state.exercise };
  }
  return state;
}

export function getRemainingSec(state: RestTimerState): number {
  if (state.kind === 'running') return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  if (state.kind === 'paused') return state.remainingSec;
  return 0;
}

export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Compound exercise heuristic — matches names in our seed library. */
const COMPOUND_NAMES = new Set([
  'bench', 'bench press', 'barbell bench press',
  'squat', 'back squat', 'front squat',
  'deadlift', 'romanian deadlift', 'sumo deadlift',
  'overhead press', 'ohp', 'military press',
  'barbell row', 'pendlay row', 'bent over row',
  'pull-up', 'pullup', 'pullups', 'chin up', 'chinup',
  'incline bench', 'incline dumbbell press',
  'hip thrust',
]);

export function isCompoundExercise(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (COMPOUND_NAMES.has(n)) return true;
  for (const k of COMPOUND_NAMES) if (n.includes(k)) return true;
  return false;
}
