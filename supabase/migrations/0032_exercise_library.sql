-- ============================================================
-- Migration 0032: Canonical exercise library
-- Provides a structured, searchable exercise catalog with
-- muscle-group metadata, equipment tags, difficulty, and a
-- placeholder for demo media. Powers Education layer + Program
-- generation. Public read; service-role write.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exercises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    aliases         JSONB NOT NULL DEFAULT '[]'::jsonb,
    category        TEXT NOT NULL CHECK (category IN ('compound', 'isolation', 'cardio', 'mobility')),
    primary_muscles JSONB NOT NULL DEFAULT '[]'::jsonb,
    secondary_muscles JSONB NOT NULL DEFAULT '[]'::jsonb,
    equipment       JSONB NOT NULL DEFAULT '[]'::jsonb,
    difficulty      TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'intermediate',
    body_part       TEXT NOT NULL CHECK (body_part IN ('Push','Pull','Legs','Abs','Chest','Back','Bis','Tris','Shoulders','Cardio','Mobility','Full Body')),
    description     TEXT,
    cues            JSONB NOT NULL DEFAULT '[]'::jsonb,
    common_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
    demo_video_url  TEXT,
    demo_image_url  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.exercises IS 'Canonical exercise library. Used for programming, education layer, and PR tracking normalization.';

CREATE INDEX IF NOT EXISTS idx_exercises_body_part ON public.exercises (body_part);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises (category);
CREATE INDEX IF NOT EXISTS idx_exercises_name_lower ON public.exercises (LOWER(name));

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exercises FROM anon, authenticated;

-- Public read for any authenticated user (catalog)
GRANT SELECT ON public.exercises TO authenticated;
CREATE POLICY exercises_read_all ON public.exercises
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE TRIGGER trg_exercises_updated_at
    BEFORE UPDATE ON public.exercises
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------
-- Seed: a tight set of common exercises. Education layer + program
-- generator look these up by slug. Idempotent via slug uniqueness.
-- ----------------------------------------------------------------
INSERT INTO public.exercises
  (slug, name, aliases, category, primary_muscles, secondary_muscles, equipment, difficulty, body_part, description, cues, common_mistakes)
VALUES
  ('barbell-bench-press', 'Barbell Bench Press',
    '["bench","bench press","flat bench"]', 'compound',
    '["chest"]', '["triceps","front_delts"]', '["barbell","bench","rack"]',
    'intermediate', 'Push',
    'Horizontal press building chest, triceps, and anterior deltoid mass. Cornerstone for upper-body pushing strength.',
    '["Plant feet, drive through heels","Retract scapulae and keep shoulder blades down","Bar touches mid-chest with elbows ~70°","Press in a slight arc back over shoulders"]',
    '["Flaring elbows to 90° (shoulder strain)","Bouncing the bar off chest","Losing scapular set at lockout"]'),

  ('back-squat', 'Back Squat',
    '["squat","barbell squat"]', 'compound',
    '["quads","glutes"]', '["hamstrings","spinal_erectors","core"]', '["barbell","rack"]',
    'intermediate', 'Legs',
    'Loaded knee-and-hip flexion under a barbell. Most efficient lower-body strength and mass builder.',
    '["Brace 360° before unracking","Break at hips and knees together","Sit between the heels, not behind them","Drive the floor away on the way up"]',
    '["Knees collapsing inward","Forward chest pitch","Going to depth without bracing"]'),

  ('deadlift', 'Conventional Deadlift',
    '["dl","conventional deadlift"]', 'compound',
    '["hamstrings","glutes","spinal_erectors"]', '["traps","lats","forearms"]', '["barbell"]',
    'advanced', 'Pull',
    'Floor-to-lockout hip hinge. Total posterior-chain builder; technically demanding under heavy load.',
    '["Bar over mid-foot, shins lightly touching","Take slack out before the pull","Push the floor away — don''t yank","Stand all the way up; don''t hyperextend"]',
    '["Rounded lower back","Hips shooting up before bar moves","Hyperextending at lockout"]'),

  ('overhead-press', 'Overhead Press',
    '["ohp","standing press","military press"]', 'compound',
    '["front_delts"]', '["triceps","upper_chest","traps"]', '["barbell","rack"]',
    'intermediate', 'Shoulders',
    'Vertical pressing from shoulders to overhead. Builds shoulder strength and improves bench lockout.',
    '["Grip just outside shoulder width","Elbows slightly in front of bar","Squeeze glutes — no leg drive","Bar travels in a straight line above mid-foot"]',
    '["Excessive lower-back arch","Pressing in front of head","Soft core / leg drift"]'),

  ('barbell-row', 'Barbell Row',
    '["bb row","bent over row","pendlay row"]', 'compound',
    '["lats","mid_traps","rhomboids"]', '["biceps","spinal_erectors"]', '["barbell"]',
    'intermediate', 'Pull',
    'Horizontal pulling movement targeting back thickness and mid-back density.',
    '["Hinge to ~45°","Pull bar to lower ribs","Lead with elbows, not hands","Control the eccentric"]',
    '["Standing too upright (turns into shrug)","Jerking with hips","Failing to retract scapulae"]'),

  ('pullup', 'Pull-Up',
    '["pullups","chinup","chin up"]', 'compound',
    '["lats"]', '["biceps","rear_delts","mid_traps"]', '["pullup_bar","bodyweight"]',
    'intermediate', 'Pull',
    'Vertical pull from a hang. Best mass builder for the lats; scales with bodyweight + added load.',
    '["Hollow body, ribs down","Pull elbows to ribs","Chest to bar at top","Full hang at bottom — no kipping"]',
    '["Kipping for reps","Half range of motion","Shoulders shrugging up at top"]'),

  ('romanian-deadlift', 'Romanian Deadlift',
    '["rdl","stiff leg deadlift"]', 'compound',
    '["hamstrings","glutes"]', '["spinal_erectors","forearms"]', '["barbell"]',
    'intermediate', 'Legs',
    'Hip-dominant pulling pattern with minimal knee flexion. Targets hamstrings + glutes through a long stretch.',
    '["Soft knees, locked angle","Push hips back, not down","Bar slides down thighs","Stop when hamstrings call uncle"]',
    '["Bending the knees mid-rep","Rounding the lower back","Trying to go too low"]'),

  ('incline-dumbbell-press', 'Incline Dumbbell Press',
    '["incline db press","incline press"]', 'compound',
    '["upper_chest"]', '["front_delts","triceps"]', '["dumbbells","incline_bench"]',
    'intermediate', 'Push',
    'Incline pressing biased toward upper chest. Easier on shoulders than incline barbell for many lifters.',
    '["Bench 30–45°","Press over upper chest, not face","Slight pause at chest","Full lockout, no clanging"]',
    '["Incline too steep (becomes shoulder press)","Bouncing dumbbells off chest","Asymmetric press path"]'),

  ('lat-pulldown', 'Lat Pulldown',
    '["pulldown"]', 'compound',
    '["lats"]', '["biceps","mid_traps"]', '["cable","lat_pulldown"]',
    'beginner', 'Back',
    'Cable-based vertical pull. Great for building the pulling pattern before owning bodyweight pull-ups.',
    '["Slight backward lean — not a sit-up","Drive elbows down and back","Bar to upper chest","Control the negative"]',
    '["Pulling behind the neck","Using momentum / body sway","Stopping at forehead"]'),

  ('barbell-curl', 'Barbell Curl',
    '["bb curl"]', 'isolation',
    '["biceps"]', '["forearms"]', '["barbell","ez_bar"]',
    'beginner', 'Bis',
    'Direct biceps work with a straight or EZ bar.',
    '["Elbows pinned to sides","No swinging","Squeeze at top","Lower with control"]',
    '["Using shoulders / hips for reps","Partial range of motion","Wrist hyperextension"]'),

  ('tricep-pushdown', 'Triceps Pushdown',
    '["pushdown","cable pushdown"]', 'isolation',
    '["triceps"]', '[]', '["cable"]',
    'beginner', 'Tris',
    'Cable isolation for triceps long and lateral heads.',
    '["Elbows tucked at sides","Full lockout at bottom","Slow eccentric","Squeeze 1s at lockout"]',
    '["Elbows flaring forward","Using body english","Stopping short of lockout"]'),

  ('lateral-raise', 'Dumbbell Lateral Raise',
    '["side raise","lat raise"]', 'isolation',
    '["side_delts"]', '["traps"]', '["dumbbells"]',
    'beginner', 'Shoulders',
    'Direct side-delt work for shoulder width.',
    '["Tilt pinky up at top","Lead with elbows","Raise to shoulder height — not higher","Control the descent"]',
    '["Using momentum","Shrugging traps","Going way past shoulder height"]'),

  ('leg-press', 'Leg Press',
    '["plate-loaded leg press","45 degree leg press"]', 'compound',
    '["quads","glutes"]', '["hamstrings"]', '["leg_press"]',
    'beginner', 'Legs',
    'Machine-loaded knee + hip extension. Easier to brace than squat; great accessory or main quad lift.',
    '["Feet shoulder width on platform","Lower under control to ~90°","Drive through whole foot","Don''t lock knees aggressively"]',
    '["Letting lower back round off pad","Half reps","Locking out too hard"]'),

  ('hip-thrust', 'Barbell Hip Thrust',
    '["bb hip thrust","glute bridge"]', 'compound',
    '["glutes"]', '["hamstrings"]', '["barbell","bench"]',
    'intermediate', 'Legs',
    'Hip-extension powerhouse for glute development.',
    '["Upper back on bench, feet planted","Tuck chin","Drive hips to ribcage height","Squeeze glutes 1s at top"]',
    '["Hyperextending lower back to reach height","Feet too far away","No glute squeeze at top"]'),

  ('plank', 'Plank',
    '["forearm plank"]', 'isolation',
    '["abs","core"]', '["glutes"]', '["bodyweight"]',
    'beginner', 'Abs',
    'Isometric anti-extension core hold.',
    '["Forearms under shoulders","Straight line ear to ankle","Squeeze glutes","Breathe normally — don''t hold breath"]',
    '["Hips sagging","Hips piking up","Holding breath"]'),

  ('treadmill-run', 'Treadmill Run',
    '["run","jog","treadmill"]', 'cardio',
    '["legs","cardio"]', '[]', '["treadmill"]',
    'beginner', 'Cardio',
    'Steady-state or interval running on a treadmill.',
    '["Land mid-foot, not heel","Relaxed shoulders","Cadence ~170–180 spm","Don''t lean on the handles"]',
    '["Heel-striking hard","Death-gripping handles","Stride too long"]'),

  ('rowing-erg', 'Rowing Erg',
    '["rower","erg","concept2"]', 'cardio',
    '["legs","back","cardio"]', '["biceps","core"]', '["rower"]',
    'beginner', 'Cardio',
    'Full-body steady-state or interval rowing.',
    '["Legs → back → arms on the drive","Arms → back → legs on the recovery","Catch with shins vertical","Stroke rate 22–28 for steady state"]',
    '["Arms-only pulling","Slamming the seat","Hunched back at the catch"]')
ON CONFLICT (slug) DO NOTHING;
