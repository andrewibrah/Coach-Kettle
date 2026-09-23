import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCoachPresentation } from '../coachingEvidence.ts';
import type { DailyFeedback } from '../../types/coaching.ts';

const report = { feedback_date: '2026-09-07', workout_completed: false,
  did_well: 'Calories were close to target', needs_improvement: 'Nothing flagged', tomorrow_focus: 'Eat more',
} as DailyFeedback;

test('matching-day partial logs show observed totals and the current resolved target, not adherence praise', () => {
  const view = getCoachPresentation(report, { date: '2026-09-07',
    totals: { log_count: 1, calories: 500, protein_g: 30 } as any,
    todayTarget: { target: { calories: 2300, protein_g: 170 }, explanation: 'Weekly override' } as any,
  });
  assert.match(view.needs_improvement, /500.*2300/);
  assert.match(view.needs_improvement, /incomplete/);
  assert.match(view.availability, /Weekly override/);
  assert.doesNotMatch(JSON.stringify(view), /close to target|Eat more/);
});

test('legacy report without matching-day evidence cannot repeat calorie praise', () => {
  const snapshot = JSON.stringify(report);
  const view = getCoachPresentation(report);
  assert.doesNotMatch(JSON.stringify(view), /close to target|Nothing flagged|Eat more/);
  assert.match(view.availability, /snapshot|unavailable/i);
  assert.equal(JSON.stringify(report), snapshot);
});
