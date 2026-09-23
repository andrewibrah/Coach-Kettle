// Regression guard for the rest-timer dial geometry.
//
// The defect this encodes: the tick strip was padded with half the WINDOW
// width while the centre indicator is positioned at 50% of the dial TRACK.
// The card is inset from the window (20pt screen padding + 1pt card border),
// so every tick rendered 21pt right of the indicator — the dial pointed a
// constant ~7.5s away from the number it displayed, at every setting.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TIMER_DIAL,
  buildTimerTicks,
  computeDialPadding,
  snapTimerSeconds,
  timerOffsetToSeconds,
  timerSecondsToOffset,
} from '../timerDial.ts';

const { tickWidth, minSec, maxSec, stepSec } = TIMER_DIAL;

/** Where the tick for `sec` actually paints, relative to the track's left edge. */
function tickCenterInTrack(sec: number, trackWidth: number): number {
  const index = (snapTimerSeconds(sec) - minSec) / stepSec;
  return computeDialPadding(trackWidth) + index * tickWidth + tickWidth / 2 - timerSecondsToOffset(sec);
}

test('selected tick lands exactly under the centre indicator', () => {
  // Track widths for the real card (window - 40pt padding - 2pt border) across
  // an iPhone SE, a 15 Pro, and a Pro Max.
  for (const trackWidth of [375 - 42, 393 - 42, 430 - 42]) {
    for (let sec = minSec; sec <= maxSec; sec += stepSec) {
      assert.equal(
        tickCenterInTrack(sec, trackWidth),
        trackWidth / 2,
        `tick for ${sec}s off-centre at track width ${trackWidth}`,
      );
    }
  }
});

test('window-derived padding is what put the tick off the indicator', () => {
  // The old math: computeDialPadding(window) inside a track inset by 21pt.
  const trackWidth = 393 - 42;
  const windowWidth = 393;
  const stale = computeDialPadding(windowWidth) + 0 * tickWidth + tickWidth / 2 - timerSecondsToOffset(minSec);
  assert.equal(stale - trackWidth / 2, 21, 'expected the measured 21pt skew');
});

test('padding is inert until the track has been measured', () => {
  assert.equal(computeDialPadding(0), 0);
  assert.equal(computeDialPadding(-10), 0);
  assert.equal(computeDialPadding(Number.NaN), 0);
});

test('scroll offset round-trips back to the same duration', () => {
  for (let sec = minSec; sec <= maxSec; sec += stepSec) {
    assert.equal(timerOffsetToSeconds(timerSecondsToOffset(sec)), sec);
    // Every valid offset must also be a snapToInterval={tickWidth} stop, or the
    // strip settles between two ticks after a fling.
    assert.equal(timerSecondsToOffset(sec) % tickWidth, 0);
  }
});

test('the strip scrolls to exactly the last tick, no dead travel past 10:00', () => {
  const trackWidth = 393 - 42;
  const ticks = buildTimerTicks();
  const contentWidth = ticks.length * tickWidth + 2 * computeDialPadding(trackWidth);
  const maxScroll = contentWidth - trackWidth;

  assert.equal(maxScroll, timerSecondsToOffset(maxSec));
  assert.equal(timerOffsetToSeconds(maxScroll), maxSec);
});

test('every preset sits on a real tick', () => {
  const ticks = new Set(buildTimerTicks());
  for (const preset of TIMER_DIAL.presets) {
    assert.ok(ticks.has(preset), `preset ${preset}s is not on the 5s grid`);
  }
});
