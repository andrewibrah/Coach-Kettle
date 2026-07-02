// Pure helpers for the rest timer dial/ruler picker.
// Keep these outside the Timer screen so duration math is testable and shared.

export const TIMER_DIAL = {
  minSec: 15,
  maxSec: 600,
  stepSec: 5,
  tickWidth: 14,
  presets: [60, 90, 120, 180] as const,
};

export function clampTimerSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return TIMER_DIAL.minSec;
  return Math.max(TIMER_DIAL.minSec, Math.min(TIMER_DIAL.maxSec, Math.round(seconds)));
}

export function snapTimerSeconds(seconds: number): number {
  const clamped = clampTimerSeconds(seconds);
  const steps = Math.round((clamped - TIMER_DIAL.minSec) / TIMER_DIAL.stepSec);
  return TIMER_DIAL.minSec + steps * TIMER_DIAL.stepSec;
}

export function timerSecondsToOffset(seconds: number, tickWidth = TIMER_DIAL.tickWidth): number {
  const snapped = snapTimerSeconds(seconds);
  const index = Math.round((snapped - TIMER_DIAL.minSec) / TIMER_DIAL.stepSec);
  return index * tickWidth;
}

export function timerOffsetToSeconds(offset: number, tickWidth = TIMER_DIAL.tickWidth): number {
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const index = Math.round(safeOffset / tickWidth);
  return snapTimerSeconds(TIMER_DIAL.minSec + index * TIMER_DIAL.stepSec);
}

export function buildTimerTicks(): number[] {
  const ticks: number[] = [];
  for (let seconds = TIMER_DIAL.minSec; seconds <= TIMER_DIAL.maxSec; seconds += TIMER_DIAL.stepSec) {
    ticks.push(seconds);
  }
  return ticks;
}

export function isPresetDuration(seconds: number): boolean {
  return (TIMER_DIAL.presets as readonly number[]).includes(seconds);
}
