import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveTemplate,
  REQUESTABLE_SPLITS,
  UI_DAYS_PER_WEEK_RANGE,
  type TemplateSummary,
} from '../programTemplates.ts';

// ---------- resolveTemplate: pure algorithm ----------

const FIXTURE: TemplateSummary[] = [
  { split_type: 'ppl_3day', days_per_week: 3 },
  { split_type: 'full_body', days_per_week: 2 },
  { split_type: 'full_body', days_per_week: 4 },
];

test('resolveTemplate returns the exact (split, days) match when present', () => {
  const result = resolveTemplate(FIXTURE, 'ppl_3day', 3);
  assert.deepEqual(result, { split_type: 'ppl_3day', days_per_week: 3 });
});

test('resolveTemplate falls back to the closest days_per_week for the split', () => {
  // full_body has 2 and 4 seeded; 3 is equidistant -> lower value wins via reduce's strict "<".
  assert.deepEqual(resolveTemplate(FIXTURE, 'full_body', 3), { split_type: 'full_body', days_per_week: 2 });
  // 5 is closer to 4.
  assert.deepEqual(resolveTemplate(FIXTURE, 'full_body', 5), { split_type: 'full_body', days_per_week: 4 });
  // 1 is closer to 2.
  assert.deepEqual(resolveTemplate(FIXTURE, 'full_body', 1), { split_type: 'full_body', days_per_week: 2 });
});

test('resolveTemplate returns null when the split has no seeded template at all', () => {
  assert.equal(resolveTemplate(FIXTURE, 'upper_lower', 4), null);
});

// ---------- Regression guard: every requestable split resolves for every offered day count ----------
//
// Parses the real seed migrations (not a hand-typed fixture) so this test
// fails the moment a new split is added to the UI/validator without at
// least one seeded program_templates row — the exact bug #7 was.

function loadSeededTemplates(): TemplateSummary[] {
  const migrationsDir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  const pairs: TemplateSummary[] = [];
  const rowPattern = /'(ppl_3day|pp_sh_l_5day|pp_sh_l_6day|upper_lower|full_body|custom)',\s*(\d+),\s*'\[/g;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    if (!sql.includes('program_templates')) continue;
    for (const match of sql.matchAll(rowPattern)) {
      pairs.push({ split_type: match[1], days_per_week: Number(match[2]) });
    }
  }
  return pairs;
}

test('every requestable split has at least one seeded program_templates row', () => {
  const templates = loadSeededTemplates();
  assert.ok(templates.length > 0, 'expected to find seeded program_templates rows in supabase/migrations/*.sql');

  for (const split of REQUESTABLE_SPLITS) {
    const hasAny = templates.some((t) => t.split_type === split);
    assert.ok(hasAny, `split "${split}" has no seeded program_templates row — #7-class bug`);
  }
});

test('resolveTemplate resolves a template for every requestable split at every day count the UI offers', () => {
  const templates = loadSeededTemplates();

  for (const split of REQUESTABLE_SPLITS) {
    for (const daysPerWeek of UI_DAYS_PER_WEEK_RANGE) {
      const resolved = resolveTemplate(templates, split, daysPerWeek);
      assert.ok(
        resolved,
        `no template resolves for split="${split}" daysPerWeek=${daysPerWeek} — picking this combination in the UI would 400/500`
      );
    }
  }
});
