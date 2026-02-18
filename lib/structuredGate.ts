type ParsedRowKind = "normal" | "warmup" | "dropset" | "superset" | "cardio";

export type ParsedRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  kind?: ParsedRowKind;
  // Cardio-specific fields
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
};

export type GateDecisionReason =
  | "empty_message"
  | "multiple_entries_or_sets"
  | "missing_exercise"
  | "missing_reps"
  | "conversational_question"
  | "end_workout_intent"
  | "fill_skeleton_row"
  | "success";

type FastPattern = "single" | "multi" | "dropset" | "superset" | "cardio" | "warmup";

export type GateDecision =
  | {
    kind: "fast";
    reason: "success";
    rows: ParsedRow[];
    meta?: { pattern?: FastPattern };
  }
  | { kind: "ai"; reason: GateDecisionReason }
  | { kind: "end_workout"; reason: "end_workout_intent" }
  | {
    kind: "fill_skeleton";
    reason: "fill_skeleton_row";
    weight: string;
    reps?: string;
    targetRowIndex: number;
  };

export interface SkeletonRow {
  id: string;
  exercise: string;
  weightLbs: string;
  reps: string;
}

type GateContext = {
  lastExercise?: string;
  currentRows?: SkeletonRow[];
};

const KG_TO_LB = 2.20462;
const PLATE_WEIGHT = 45;
const BAR_WEIGHT = 45;

const numberRegex = /\d/;

// ─── End-workout detection ───────────────────────────────────────────────────

const END_WORKOUT_PATTERNS = [
  /^(i'?m\s+)?done$/i,
  /^(i'?m\s+)?finished$/i,
  /^(that'?s\s+)?it$/i,
  /^end\s*(workout|session)?$/i,
  /^finish\s*(workout|session)?$/i,
  /^done\s*(for\s+today|with\s+workout|working\s+out)?$/i,
  /^finished\s*(for\s+today|with\s+workout|working\s+out)?$/i,
  /^wrap\s*(it\s+)?up$/i,
  /^that'?s\s+(a\s+)?wrap$/i,
  /^all\s+done$/i,
  /^good\s+workout$/i,
  /^great\s+workout$/i,
  /^save\s*(workout|session)?$/i,
  /^end\s+it$/i,
  /^call\s+it\s+(a\s+day|quits)$/i,
  /^(let'?s\s+)?finish\s+up$/i,
  /^time\s+to\s+(go|leave|end)$/i,
];

const isEndWorkoutIntent = (message: string): boolean =>
  END_WORKOUT_PATTERNS.some((p) => p.test(message));

// ─── Same-set detection ──────────────────────────────────────────────────────

const SAME_SET_RE = /^(?:same|again|same\s+set|same\s+weight)$/i;

const isSameSet = (message: string): boolean => SAME_SET_RE.test(message.trim());

// ─── Conversational question detection ──────────────────────────────────────
// Only catches clearly non-workout inputs (no digits at all, or strong question signals).

const QUESTION_PREFIX_RE =
  /^(?:what(?:'?s)?|how|should|can|is|am|do|why|when|where|which|who|help|suggest|recommend|advice|tips?)\b/i;

const isConversationalQuestion = (message: string): boolean => {
  const trimmed = message.trim();
  // No digits → not a workout entry
  if (!numberRegex.test(trimmed)) return true;
  // Explicit question word prefix
  if (QUESTION_PREFIX_RE.test(trimmed)) return true;
  // Ends with ?
  if (trimmed.endsWith("?")) return true;
  return false;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const formatWeight = (num: number): string => {
  if (!Number.isFinite(num)) return "";
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const normalizeWeightToLbs = (value: string, unit?: string): string => {
  const raw = parseFloat(value);
  if (!Number.isFinite(raw)) return "";
  if (!unit) return formatWeight(raw);
  const u = unit.toLowerCase();
  if (u.startsWith("kg")) return formatWeight(raw * KG_TO_LB);
  if (u.startsWith("plate")) return formatWeight(raw * PLATE_WEIGHT * 2 + BAR_WEIGHT);
  return formatWeight(raw);
};

const makeAiDecision = (reason: GateDecisionReason): GateDecision => ({
  kind: "ai",
  reason,
});

const buildFastDecision = (rows: ParsedRow[], pattern?: FastPattern): GateDecision => ({
  kind: "fast",
  reason: "success",
  rows,
  meta: pattern ? { pattern } : undefined,
});

// ─── Pair parsing ─────────────────────────────────────────────────────────────

type NumberPair = { weight: string; reps: string };
type ParsedPairs = { pairs: NumberPair[]; leftoverNumericCount: number; numberCount: number };

const parsePairsFromTail = (tail: string): ParsedPairs => {
  const pairs: NumberPair[] = [];

  // Handle alternating comma-separated pairs: "100,10,120,10" → [(100,10),(120,10)]
  // Requires ≥4 comma-separated pure numbers (even count).
  const commaTokens = tail.trim().split(/\s*,\s*/);
  if (
    commaTokens.length >= 4 &&
    commaTokens.length % 2 === 0 &&
    commaTokens.every((v) => /^\d+(?:\.\d+)?$/.test(v.trim()))
  ) {
    for (let i = 0; i < commaTokens.length; i += 2) {
      pairs.push({
        weight: normalizeWeightToLbs(commaTokens[i].trim()),
        reps: commaTokens[i + 1].trim(),
      });
    }
    return { pairs, leftoverNumericCount: 0, numberCount: commaTokens.length };
  }

  // Standard regex: matches "weight [unit] [x] reps" pairs
  const pairRegex =
    /(\d+(?:\.\d+)?)(?:\s*(kg|kgs?|lb|lbs?|plates?|plate))?\s*(?:x|×)?\s*(\d+(?:\.\d+)?)(?:\s*reps?)?/gi;
  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(tail))) {
    pairs.push({
      weight: normalizeWeightToLbs(match[1], match[2]),
      reps: match[3],
    });
  }

  const numberCount = (tail.match(/\d+(?:\.\d+)?/g) ?? []).length;
  const leftoverNumericCount = Math.max(0, numberCount - pairs.length * 2);
  return { pairs, leftoverNumericCount, numberCount };
};

// ─── Exercise extraction ──────────────────────────────────────────────────────

const extractExercises = (segment: string, allowMultiple: boolean): string[] => {
  const cleaned = segment.replace(/\bsuperset\b/gi, "").replace(/\bss\b/gi, "").trim();
  if (!cleaned) return [];
  if (!allowMultiple) return [cleaned];
  const parts = cleaned
    .split(/\band\b|\/|,/i)
    .map((p) => normalizeSpaces(p))
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
};

const hasMultipleExerciseSignals = (segment: string): boolean =>
  /\b(and|&)\b/.test(segment) || /[,/]/.test(segment);

const hasCardioSignals = (lower: string): boolean => {
  // Explicit "cardio" keyword always triggers cardio mode
  if (/\bcardio\b/.test(lower)) return true;

  // Must have BOTH a cardio machine/activity AND a time/distance indicator
  const hasCardioActivity = /\belliptical\b|\btreadmill\b|\bbike\b|\brower\b|\brun\b|\bjog\b|\bstairmaster\b|\bstairclimber\b|\bcycling\b/.test(lower);
  const hasTimeOrDistance = /\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b|\bhour\b|\bhr\b/.test(lower);

  return hasCardioActivity && hasTimeOrDistance;
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function decideAndParse(message: string, context: GateContext): GateDecision {
  const trimmed = message.trim();

  if (!trimmed) return makeAiDecision("empty_message");

  if (isEndWorkoutIntent(trimmed.toLowerCase())) {
    return { kind: "end_workout", reason: "end_workout_intent" };
  }

  // "Same" → duplicate the last row that has weight + reps
  if (isSameSet(trimmed)) {
    if (context.currentRows && context.currentRows.length > 0) {
      const lastFilled = [...context.currentRows]
        .reverse()
        .find((r) => r.exercise && r.weightLbs && r.reps);
      if (lastFilled) {
        return buildFastDecision(
          [
            {
              exercise: lastFilled.exercise,
              weightLbs: lastFilled.weightLbs,
              reps: lastFilled.reps,
              notes: "",
              kind: "normal",
            },
          ],
          "single"
        );
      }
    }
    // No prior row to duplicate — let AI handle it
    return makeAiDecision("conversational_question");
  }

  // ─── Skeleton fill (routine-aware) ─────────────────────────────────────────
  if (context.currentRows && context.currentRows.length > 0) {
    const nextEmptyIdx = context.currentRows.findIndex(
      (row) => row.exercise && !row.weightLbs
    );

    if (nextEmptyIdx !== -1) {
      const weightOnlyMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:lbs?|kg)?$/i);
      if (weightOnlyMatch) {
        return {
          kind: "fill_skeleton",
          reason: "fill_skeleton_row",
          weight: normalizeWeightToLbs(
            weightOnlyMatch[1],
            trimmed.toLowerCase().includes("kg") ? "kg" : undefined
          ),
          targetRowIndex: nextEmptyIdx,
        };
      }

      const weightRepsMatch = trimmed.match(
        /^(\d+(?:\.\d+)?)\s*(?:lbs?|kg)?\s*(?:x|×|for|,)?\s*(\d+)(?:\s*reps?)?$/i
      );
      if (weightRepsMatch) {
        return {
          kind: "fill_skeleton",
          reason: "fill_skeleton_row",
          weight: normalizeWeightToLbs(
            weightRepsMatch[1],
            trimmed.toLowerCase().includes("kg") ? "kg" : undefined
          ),
          reps: weightRepsMatch[2],
          targetRowIndex: nextEmptyIdx,
        };
      }
    }
  }

  // ─── Conversational / question → AI ────────────────────────────────────────
  if (isConversationalQuestion(trimmed)) {
    return makeAiDecision("conversational_question");
  }

  if (trimmed.includes("\n")) return makeAiDecision("multiple_entries_or_sets");

  const normalized = normalizeSpaces(trimmed);
  const lower = normalized.toLowerCase();
  const tokens = normalized.split(" ");

  const firstNumberIdx = tokens.findIndex((tok) => numberRegex.test(tok));
  const warmupFlag = /\bwarm\s*-?\s*up\b/.test(lower);
  const isSuperset = /\bsuperset\b/.test(lower) || /\bss\b/.test(lower);
  const isDropset = /\bdrops?et\b/.test(lower) || /\bdrop set\b/.test(lower);
  const isCardio = hasCardioSignals(lower);

  const exerciseSegment =
    firstNumberIdx > -1 ? tokens.slice(0, firstNumberIdx).join(" ") : normalized;

  if (!isSuperset && exerciseSegment && hasMultipleExerciseSignals(exerciseSegment)) {
    return makeAiDecision("multiple_entries_or_sets");
  }

  const exercises = extractExercises(exerciseSegment, isSuperset);

  if (!exercises.length && context.lastExercise) {
    exercises.push(context.lastExercise.trim());
  }
  if (!exercises.length) return makeAiDecision("missing_exercise");
  if (!isSuperset && exercises.length > 1) return makeAiDecision("multiple_entries_or_sets");

  const tail = firstNumberIdx > -1 ? tokens.slice(firstNumberIdx).join(" ") : "";

  // Bodyweight: single number only → reps with no weight
  const singleNumberMatch = tail.match(/^(?:x\s*)?(\d+)$/);
  if (singleNumberMatch && !isSuperset && !isDropset && !isCardio) {
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: "0",
          reps: singleNumberMatch[1],
          notes: warmupFlag ? "warmup" : "",
          kind: warmupFlag ? "warmup" : "normal",
        },
      ],
      warmupFlag ? "warmup" : "single"
    );
  }

  const { pairs, leftoverNumericCount, numberCount } = parsePairsFromTail(tail);

  // ─── Cardio ─────────────────────────────────────────────────────────────────
  if (isCardio) {
    const minutesMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)/);
    const milesMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mile|miles)/);
    const kmMatch = lower.match(/(\d+(?:\.\d+)?)\s*km/);
    const metersMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:m|meters?)\b/);
    const hrMatch = lower.match(/(?:hr|heart\s*rate)\s*(\d+)/i);
    const caloriesMatch = lower.match(/(\d+)\s*(?:cal|cals|calories?|kcal)/);
    const levelMatch = lower.match(/(?:level|lvl|resistance|incline)\s*(\d+)/i);

    // Extract cardio values
    const durationMins = minutesMatch ? parseFloat(minutesMatch[1]) : undefined;
    const distance = milesMatch ? parseFloat(milesMatch[1])
      : kmMatch ? parseFloat(kmMatch[1])
      : metersMatch ? parseFloat(metersMatch[1])
      : undefined;
    const distanceUnit: 'miles' | 'km' | 'meters' | undefined = milesMatch ? 'miles'
      : kmMatch ? 'km'
      : metersMatch ? 'meters'
      : undefined;
    const heartRate = hrMatch ? parseInt(hrMatch[1], 10) : undefined;
    const calories = caloriesMatch ? parseInt(caloriesMatch[1], 10) : undefined;
    const level = levelMatch ? parseInt(levelMatch[1], 10) : undefined;

    // Build display values for backwards compat (reps shows duration, weightLbs shows distance)
    const displayReps = durationMins ? `${durationMins}` : distance ? `${distance}` : "";
    const displayWeight = distance && durationMins ? `${distance}` : "";

    // Build notes
    const notesParts: string[] = [];
    if (durationMins) notesParts.push(`${durationMins} min`);
    if (distance && distanceUnit) notesParts.push(`${distance} ${distanceUnit}`);
    if (calories) notesParts.push(`${calories} cal`);
    if (heartRate) notesParts.push(`HR ${heartRate}`);
    if (level) notesParts.push(`Lvl ${level}`);

    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: displayWeight,
          reps: displayReps,
          notes: notesParts.join(", "),
          kind: "cardio",
          isCardio: true,
          durationMins,
          distance,
          distanceUnit,
          heartRate,
          calories,
          level,
        },
      ],
      "cardio"
    );
  }

  // ─── Superset ───────────────────────────────────────────────────────────────
  if (isSuperset) {
    if (exercises.length < 2) return makeAiDecision("multiple_entries_or_sets");
    if (pairs.length < 2) return makeAiDecision("missing_reps");
    const rows: ParsedRow[] = [
      { exercise: exercises[0], weightLbs: pairs[0].weight, reps: pairs[0].reps, notes: "SS", kind: "superset" },
      { exercise: exercises[1], weightLbs: pairs[1].weight, reps: pairs[1].reps, notes: "SS", kind: "superset" },
    ];
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    return buildFastDecision(rows, "superset");
  }

  // ─── Dropset ─────────────────────────────────────────────────────────────────
  if (isDropset && exercises.length === 1) {
    if (pairs.length < 2) return makeAiDecision("multiple_entries_or_sets");
    const rows: ParsedRow[] = pairs.map((pair) => ({
      exercise: exercises[0],
      weightLbs: pair.weight,
      reps: pair.reps,
      notes: "DS",
      kind: "dropset" as ParsedRowKind,
    }));
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    return buildFastDecision(rows, "dropset");
  }

  // ─── Multiple sets (e.g. "bench 100 10 120 10 140 6" or "100,10,120,10") ───
  if (pairs.length > 1) {
    const rows: ParsedRow[] = pairs.map((pair) => ({
      exercise: exercises[0],
      weightLbs: pair.weight,
      reps: pair.reps,
      notes: "",
      kind: "normal" as ParsedRowKind,
    }));
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    if (leftoverNumericCount > 0) return makeAiDecision("multiple_entries_or_sets");
    return buildFastDecision(rows, "multi");
  }

  // ─── Single set ─────────────────────────────────────────────────────────────
  if (pairs.length === 1) {
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: pairs[0].weight,
          reps: pairs[0].reps,
          notes: warmupFlag ? "warmup" : "",
          kind: warmupFlag ? "warmup" : "normal",
        },
      ],
      warmupFlag ? "warmup" : "single"
    );
  }

  // Numbers present but no valid pairs found → let AI handle
  if (numberCount > 0) return makeAiDecision("missing_reps");

  return makeAiDecision("missing_reps");
}

// ─── Dev tests (runs in __DEV__ only) ────────────────────────────────────────

type DevTestCase = {
  message: string;
  context?: GateContext;
  expectKind: GateDecision["kind"];
  expectRowCount?: number;
  expectPattern?: string;
  expectExercise?: string;
  expectWeight?: string;
  expectReps?: string;
};

function runDevStructuredGateTests() {
  const cases: DevTestCase[] = [
    // Basic single set
    { message: "Bench 135 8", expectKind: "fast", expectRowCount: 1, expectExercise: "Bench", expectWeight: "135", expectReps: "8" },
    { message: "Lat pulldown 120x10", expectKind: "fast", expectRowCount: 1, expectExercise: "Lat pulldown", expectWeight: "120", expectReps: "10" },
    // Shorthand with lastExercise
    { message: "100 10", context: { lastExercise: "Bench" }, expectKind: "fast", expectRowCount: 1, expectExercise: "Bench", expectWeight: "100", expectReps: "10" },
    // Multi-set space-separated
    { message: "Bench 135 8 155 6", expectKind: "fast", expectRowCount: 2, expectPattern: "multi" },
    // Multi-set comma-pair format
    { message: "Bench 100,10,120,10", expectKind: "fast", expectRowCount: 2, expectPattern: "multi" },
    // Multi-set space pairs shorthand
    { message: "130 10 140 10 200 6", context: { lastExercise: "Squat" }, expectKind: "fast", expectRowCount: 3, expectPattern: "multi" },
    // Dropset
    { message: "Bench 185 8 165 10 dropset", expectKind: "fast", expectRowCount: 2, expectPattern: "dropset" },
    // Superset
    { message: "Bench and Push Ups superset 135 10 0 15", expectKind: "fast", expectRowCount: 2, expectPattern: "superset" },
    // Cardio
    { message: "Elliptical 15 min HR 150", expectKind: "fast", expectRowCount: 1, expectPattern: "cardio" },
    // Warmup
    { message: "Curls 20 10 warmup", expectKind: "fast", expectRowCount: 1, expectPattern: "warmup" },
    // kg conversion
    { message: "Squat 100kg 5", expectKind: "fast", expectRowCount: 1 },
    // Questions → AI
    { message: "What exercise should I do?", expectKind: "ai" },
    { message: "How many reps for bench?", expectKind: "ai" },
    { message: "", expectKind: "ai" },
    // Multiple exercises → AI
    { message: "Bench and Leg press 135 8", expectKind: "ai" },
    // Same → fast (with context)
    {
      message: "same",
      context: { currentRows: [{ id: "1", exercise: "Bench Press", weightLbs: "185", reps: "8" }] },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench Press",
      expectWeight: "185",
      expectReps: "8",
    },
    // Skeleton fill
    {
      message: "150",
      context: { currentRows: [{ id: "1", exercise: "Bench Press", weightLbs: "", reps: "10" }] },
      expectKind: "fill_skeleton",
    },
    {
      message: "150 8",
      context: { currentRows: [{ id: "1", exercise: "Bench Press", weightLbs: "", reps: "10" }] },
      expectKind: "fill_skeleton",
    },
    // Explicit exercise with skeleton context → fast (not skeleton fill)
    {
      message: "Bench 185 8",
      context: { currentRows: [{ id: "1", exercise: "Bench Press", weightLbs: "", reps: "10" }] },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench",
      expectWeight: "185",
      expectReps: "8",
    },
  ];

  const failures: string[] = [];

  for (const test of cases) {
    const res = decideAndParse(test.message, test.context ?? {});
    if (res.kind !== test.expectKind) {
      failures.push(`"${test.message}" → expected ${test.expectKind}, got ${res.kind}`);
      continue;
    }
    if (res.kind === "fast") {
      if (test.expectRowCount !== undefined && res.rows.length !== test.expectRowCount) {
        failures.push(`"${test.message}" rows: expected ${test.expectRowCount}, got ${res.rows.length}`);
      }
      if (test.expectExercise && res.rows[0]?.exercise !== test.expectExercise) {
        failures.push(`"${test.message}" exercise: expected "${test.expectExercise}" got "${res.rows[0]?.exercise}"`);
      }
      if (test.expectWeight !== undefined && res.rows[0]?.weightLbs !== test.expectWeight) {
        failures.push(`"${test.message}" weight: expected "${test.expectWeight}" got "${res.rows[0]?.weightLbs}"`);
      }
      if (test.expectReps && res.rows[0]?.reps !== test.expectReps) {
        failures.push(`"${test.message}" reps: expected "${test.expectReps}" got "${res.rows[0]?.reps}"`);
      }
      if (test.expectPattern && res.meta?.pattern !== test.expectPattern) {
        failures.push(`"${test.message}" pattern: expected "${test.expectPattern}" got "${res.meta?.pattern}"`);
      }
    }
  }

  if (failures.length) {
    // eslint-disable-next-line no-console
    console.warn("[structuredGate] tests FAILED:", failures);
  } else {
    // eslint-disable-next-line no-console
    console.log("[structuredGate] all tests passed ✓");
  }
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  runDevStructuredGateTests();
}
