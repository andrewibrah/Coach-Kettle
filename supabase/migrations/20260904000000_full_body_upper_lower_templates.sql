-- ============================================================
-- Migration: seed missing Full Body and Upper/Lower program templates.
--
-- Bug (#7): VALID_SPLIT (programming/index.ts:30) accepts 'full_body' and
-- 'upper_lower', and 'full_body' is offered in the create-program UI, but
-- 0035_programming_engine.sql only ever seeded three templates: ppl-3day,
-- pp-sh-l-5day, pp-sh-l-6day. Selecting Full Body 100%-fails with
-- "template not found for split_type full_body" (a raw 500 surfaced
-- verbatim in the client toast).
--
-- All exercise slugs below were verified present in
-- 0032_exercise_library.sql / 20260708000100_exercise_dataset_seed.sql
-- before writing this migration (back-squat, barbell-bench-press,
-- barbell-row, overhead-press, plank, deadlift, incline-dumbbell-press,
-- lat-pulldown, lateral-raise, barbell-curl, romanian-deadlift, pullup,
-- leg-press, tricep-pushdown, hip-thrust — the same set already used by
-- the three existing seeded templates).
--
-- program_templates.slug is UNIQUE (no other constraint needs relaxing);
-- programming/index.ts is updated in the same change to look up by
-- (split_type, days_per_week) with a closest-day-count fallback, so these
-- new rows don't need to cover every 1-7 day count — just the sensible
-- variants for each split.
-- ============================================================

INSERT INTO public.program_templates (slug, name, description, split_type, days_per_week, goal_types, structure)
VALUES
  ('full-body-2day',
   '2-Day Full Body',
   'Two full-body sessions per week. Efficient for limited schedules while still hitting every muscle group twice.',
   'full_body', 2, '["muscle_building","strength","weight_loss","maintenance"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Full Body", "title": "Full Body A",
        "exercises": [
          {"slug":"barbell-bench-press","sets":3,"reps":[6,8],"rest":150},
          {"slug":"barbell-row","sets":3,"reps":[8,10],"rest":120},
          {"slug":"back-squat","sets":3,"reps":[5,8],"rest":180},
          {"slug":"overhead-press","sets":2,"reps":[8,10],"rest":90},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]},
       {"day": 2, "body_part": "Full Body", "title": "Full Body B",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60}
        ]}
     ]
   }'::jsonb),

  ('full-body-3day',
   '3-Day Full Body',
   'Every session trains the whole body. Best for beginners and anyone training three days a week.',
   'full_body', 3, '["muscle_building","strength","weight_loss","maintenance"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Full Body", "title": "Full Body A",
        "exercises": [
          {"slug":"back-squat","sets":3,"reps":[5,8],"rest":180},
          {"slug":"barbell-bench-press","sets":3,"reps":[6,8],"rest":150},
          {"slug":"barbell-row","sets":3,"reps":[8,10],"rest":120},
          {"slug":"overhead-press","sets":2,"reps":[8,10],"rest":90},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]},
       {"day": 2, "body_part": "Full Body", "title": "Full Body B",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60},
          {"slug":"barbell-curl","sets":2,"reps":[10,12],"rest":60}
        ]},
       {"day": 3, "body_part": "Full Body", "title": "Full Body C",
        "exercises": [
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":150},
          {"slug":"pullup","sets":3,"reps":[6,10],"rest":120},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"tricep-pushdown","sets":3,"reps":[10,15],"rest":60},
          {"slug":"hip-thrust","sets":3,"reps":[10,12],"rest":90}
        ]}
     ]
   }'::jsonb),

  ('full-body-4day',
   '4-Day Full Body',
   'Two alternating full-body sessions (A/B/A/B). More frequent stimulus per muscle than a 2 or 3-day split.',
   'full_body', 4, '["muscle_building","strength","weight_loss","maintenance"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Full Body", "title": "Full Body A",
        "exercises": [
          {"slug":"barbell-bench-press","sets":3,"reps":[6,8],"rest":150},
          {"slug":"barbell-row","sets":3,"reps":[8,10],"rest":120},
          {"slug":"back-squat","sets":3,"reps":[5,8],"rest":180},
          {"slug":"overhead-press","sets":2,"reps":[8,10],"rest":90},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]},
       {"day": 2, "body_part": "Full Body", "title": "Full Body B",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60}
        ]},
       {"day": 3, "body_part": "Full Body", "title": "Full Body A",
        "exercises": [
          {"slug":"barbell-bench-press","sets":3,"reps":[6,8],"rest":150},
          {"slug":"barbell-row","sets":3,"reps":[8,10],"rest":120},
          {"slug":"back-squat","sets":3,"reps":[5,8],"rest":180},
          {"slug":"overhead-press","sets":2,"reps":[8,10],"rest":90},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]},
       {"day": 4, "body_part": "Full Body", "title": "Full Body B",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60}
        ]}
     ]
   }'::jsonb),

  ('upper-lower-4day',
   '4-Day Upper/Lower',
   'Alternating upper and lower body sessions (Upper A / Lower A / Upper B / Lower B). Good balance of frequency and recovery.',
   'upper_lower', 4, '["muscle_building","strength","maintenance"]'::jsonb,
   '{
     "days": [
       {"day": 1, "body_part": "Upper", "title": "Upper A",
        "exercises": [
          {"slug":"barbell-bench-press","sets":4,"reps":[6,8],"rest":150},
          {"slug":"barbell-row","sets":4,"reps":[6,10],"rest":120},
          {"slug":"overhead-press","sets":3,"reps":[6,10],"rest":120},
          {"slug":"lat-pulldown","sets":3,"reps":[10,12],"rest":90},
          {"slug":"barbell-curl","sets":2,"reps":[10,12],"rest":60}
        ]},
       {"day": 2, "body_part": "Lower", "title": "Lower A",
        "exercises": [
          {"slug":"back-squat","sets":4,"reps":[5,8],"rest":180},
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":120},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"hip-thrust","sets":3,"reps":[8,12],"rest":120},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]},
       {"day": 3, "body_part": "Upper", "title": "Upper B",
        "exercises": [
          {"slug":"incline-dumbbell-press","sets":3,"reps":[8,12],"rest":120},
          {"slug":"pullup","sets":3,"reps":[6,10],"rest":120},
          {"slug":"lateral-raise","sets":3,"reps":[12,15],"rest":60},
          {"slug":"tricep-pushdown","sets":3,"reps":[10,15],"rest":60},
          {"slug":"barbell-curl","sets":2,"reps":[10,12],"rest":60}
        ]},
       {"day": 4, "body_part": "Lower", "title": "Lower B",
        "exercises": [
          {"slug":"deadlift","sets":3,"reps":[3,5],"rest":210},
          {"slug":"leg-press","sets":3,"reps":[10,12],"rest":120},
          {"slug":"hip-thrust","sets":3,"reps":[8,12],"rest":120},
          {"slug":"romanian-deadlift","sets":3,"reps":[8,10],"rest":120},
          {"slug":"plank","sets":3,"reps":[30,60],"rest":60}
        ]}
     ]
   }'::jsonb)

ON CONFLICT (slug) DO NOTHING;
