import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeLargeTextLayout,
  HUGE_TEXT_SCALE,
  LARGE_TEXT_SCALE,
} from '../largeTextLayout.ts';

test('default Dynamic Type size does not trigger stacked layouts', () => {
  const l = computeLargeTextLayout(1);
  assert.equal(l.fontScale, 1);
  assert.equal(l.isLargeText, false);
  assert.equal(l.isHugeText, false);
});

test('iOS large-but-not-accessibility sizes stay on the compact row layout', () => {
  // xSmall .. xxxLarge report roughly 0.82 .. 1.23 for body text.
  for (const scale of [0.82, 0.9, 1.0, 1.12, 1.23]) {
    assert.equal(computeLargeTextLayout(scale).isLargeText, false, `scale ${scale}`);
  }
});

test('accessibility sizes AX1..AX5 all trigger the stacked layout', () => {
  // AX1 .. AX5 report roughly 1.35 .. 3.1 for body text.
  for (const scale of [1.35, 1.64, 1.95, 2.35, 3.12]) {
    assert.equal(computeLargeTextLayout(scale).isLargeText, true, `scale ${scale}`);
  }
});

test('huge threshold separates AX3+ from AX1/AX2', () => {
  assert.equal(computeLargeTextLayout(1.35).isHugeText, false);
  assert.equal(computeLargeTextLayout(1.64).isHugeText, false);
  assert.equal(computeLargeTextLayout(HUGE_TEXT_SCALE).isHugeText, true);
  assert.equal(computeLargeTextLayout(3.12).isHugeText, true);
});

test('thresholds are inclusive at the boundary', () => {
  assert.equal(computeLargeTextLayout(LARGE_TEXT_SCALE).isLargeText, true);
  assert.equal(computeLargeTextLayout(LARGE_TEXT_SCALE - 0.01).isLargeText, false);
});

test('scaleSpace grows hit targets with text but is capped so padding cannot run away', () => {
  assert.equal(computeLargeTextLayout(1).scaleSpace(44), 44);
  assert.equal(computeLargeTextLayout(1.5).scaleSpace(44), 66);
  // Capped at 2x even though the text itself keeps scaling to ~3.1x.
  assert.equal(computeLargeTextLayout(3.12).scaleSpace(44), 88);
});

test('a missing or nonsense fontScale degrades to the default layout, never to zero-size chrome', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
    const l = computeLargeTextLayout(bad);
    assert.equal(l.fontScale, 1, `input ${String(bad)}`);
    assert.equal(l.isLargeText, false);
    assert.equal(l.scaleSpace(44), 44);
  }
});
