type ParsedRowKind = "normal" | "warmup" | "dropset" | "superset" | "cardio";

export type ParsedRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  kind?: ParsedRowKind;
};

export type GateDecisionReason =
  | "empty_message"
  | "multiple_entries_or_sets"
  | "ambiguous_same_as_previous"
  | "unsupported_units"
  | "non_lift_units"
  | "missing_exercise"
  | "missing_reps"
  | "conversational_question"
  | "success";

type FastPattern = "single" | "multi" | "dropset" | "superset" | "cardio" | "warmup";

export type GateDecision =
  | {
    kind: "fast";
    reason: "success";
    rows: ParsedRow[];
    meta?: { pattern?: FastPattern };
  }
  | { kind: "ai"; reason: GateDecisionReason; userHint?: string };

type GateContext = { lastExercise?: string };

const MULTI_REASON: GateDecisionReason = "multiple_entries_or_sets";
const KG_TO_LB = 2.20462;
const PLATE_WEIGHT = 45; // per plate
const BAR_WEIGHT = 45;

const numberRegex = /\d/;

// Patterns that indicate conversational questions rather than workout logging
const QUESTION_PATTERNS = [
  /^what\s+should\s+i/i,
  /^what\s+do\s+i/i,
  /^what\s+next/i,
  /^what\s+now/i,
  /^what\s+else/i,
  /^what's\s+next/i,
  /^what\s+about/i,
  /^what\s+can\s+i/i,
  /^what\s+exercise/i,
  /^now\s+what/i,
  /^next\s+exercise/i,
  /^next\s+set/i,
  /^how\s+many/i,
  /^how\s+much/i,
  /^should\s+i/i,
  /^can\s+i/i,
  /^is\s+it\s+ok/i,
  /^is\s+this/i,
  /^am\s+i/i,
  /^do\s+i/i,
  /^why/i,
  /^when/i,
  /^where/i,
  /^which/i,
  /^who/i,
  /^help/i,
  /^suggest/i,
  /^recommend/i,
  /^advice/i,
  /^tips?\s*(for|on)?/i,
  /\?$/,  // Ends with question mark
];


const isConversationalQuestion = (message: string): boolean => {
  const lower = message.toLowerCase().trim();
  const hasNumbers = /\d/.test(message);

  // If message has NO numbers, it's likely a conversation/question
  // (e.g. "What next", "Bench press", "I am tired")
  // Exception: short exercise names might be here, but we default to AI coach
  if (!hasNumbers) {
    return true;
  }

  // Even if it has numbers ("How many reps for 135?"), check question patterns
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // If message ends with ? and doesn't look like a workout entry
  if (message.trim().endsWith('?')) {
    return true;
  }

  return false;
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const formatWeight = (num: number) => {
  if (!Number.isFinite(num)) return "";
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const normalizeWeightToLbs = (value: string, unit?: string) => {
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
  userHint: userHintForReason(reason),
});

const userHintForReason = (reason: GateDecisionReason): string | undefined => {
  switch (reason) {
    case "empty_message":
      return 'Try something like "Bench 185 x 8".';
    case "multiple_entries_or_sets":
      return "One exercise per message. Format: Exercise Weight Reps.";
    case "ambiguous_same_as_previous":
      return "Say the exercise name or repeat the full set.";
    case "unsupported_units":
      return "Use lbs or kg (we convert). Skip plate math if unsure.";
    case "non_lift_units":
      return 'If cardio, try "Elliptical 15 min". Otherwise log weight/reps.';
    case "missing_exercise":
      return 'What exercise? Try "Bench 185 8" or just "135 10".';
    case "missing_reps":
      return "Add reps. Example: Exercise Weight Reps.";
    case "conversational_question":
      return undefined; // No hint needed, AI will respond
    default:
      return undefined;
  }
};

type NumberPair = { weight: string; reps: string };
type ParsedPairs = { pairs: NumberPair[]; leftoverNumericCount: number; numberCount: number };

const parsePairsFromTail = (tail: string): ParsedPairs => {
  const pairs: NumberPair[] = [];
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

const extractExercises = (segment: string, allowMultiple: boolean): string[] => {
  const cleaned = segment.replace(/\bsuperset\b/gi, "").replace(/\bss\b/gi, "").trim();
  if (!cleaned) return [];
  if (!allowMultiple) return [cleaned];
  const parts = cleaned
    .split(/\band\b|\/|,/i)
    .map((p) => normalizeSpaces(p))
    .filter(Boolean);
  if (parts.length) return parts;
  return [cleaned];
};

const hasMultipleExerciseSignals = (segment: string) =>
  /\b(and|&)\b/.test(segment) || /[,/]/.test(segment);

const hasCardioSignals = (lower: string) =>
  /\bcardio\b|\belliptical\b|\btreadmill\b|\bbike\b|\brow(er)?\b|\brun\b|\bjog\b/.test(lower) ||
  /\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b/.test(lower);

const buildFastDecision = (rows: ParsedRow[], pattern?: FastPattern): GateDecision => ({
  kind: "fast",
  reason: "success",
  rows,
  meta: pattern ? { pattern } : undefined,
});

export function decideAndParse(message: string, context: GateContext): GateDecision {
  const trimmed = message.trim();
  if (!trimmed) return makeAiDecision("empty_message");

  // Check for conversational questions first - route to AI for coach response
  if (isConversationalQuestion(trimmed)) {
    return makeAiDecision("conversational_question");
  }

  if (trimmed.includes("\n")) return makeAiDecision(MULTI_REASON);

  const normalized = normalizeSpaces(trimmed);
  const lower = normalized.toLowerCase();

  const tokens = normalized.split(" ");
  const firstNumberIdx = tokens.findIndex((tok) => numberRegex.test(tok));
  const warmupFlag = /\bwarm\s*-?\s*up\b/.test(lower);
  const isSuperset = /\bsuperset\b/.test(lower) || /\bss\b/.test(lower);
  const isDropset = /\bdrops?et\b/.test(lower) || /\bdrop set\b/.test(lower);
  const isCardio = hasCardioSignals(lower);

  if (/\bsame as\b/.test(lower)) return makeAiDecision("ambiguous_same_as_previous");

  const exerciseSegment =
    firstNumberIdx > -1 ? tokens.slice(0, firstNumberIdx).join(" ") : normalized;

  if (!isSuperset && exerciseSegment && hasMultipleExerciseSignals(exerciseSegment)) {
    return makeAiDecision(MULTI_REASON);
  }

  const exercises = extractExercises(exerciseSegment, isSuperset);

  if (!exercises.length && context.lastExercise) {
    exercises.push(context.lastExercise.trim());
  }
  if (!exercises.length) return makeAiDecision("missing_exercise");
  if (!isSuperset && exercises.length > 1) return makeAiDecision(MULTI_REASON);

  const tail = firstNumberIdx > -1 ? tokens.slice(firstNumberIdx).join(" ") : "";

  // Check for single number first (bodyweight exercise: reps only)
  // This must happen BEFORE parsePairsFromTail to prevent "20" being split into "2" and "0"
  const singleNumberMatch = tail.match(/^(?:x\s*)?(\d+)$/);
  if (singleNumberMatch && !isSuperset && !isDropset && !isCardio) {
    const reps = singleNumberMatch[1];
    const baseNotes: string[] = [];
    if (warmupFlag) baseNotes.push("warmup");
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: "0",
          reps: reps,
          notes: baseNotes.join(" "),
          kind: warmupFlag ? "warmup" : "normal",
        },
      ],
      warmupFlag ? "warmup" : "single"
    );
  }

  const { pairs, leftoverNumericCount, numberCount } = parsePairsFromTail(tail);

  if (isCardio) {
    const minutesMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)/);
    const distanceMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mile|miles|km)/);
    const hrMatch = lower.match(/hr\s*(\d+(?:\.\d+)?)/);
    const reps = minutesMatch?.[1] ?? distanceMatch?.[1] ?? pairs[0]?.reps ?? pairs[0]?.weight ?? "";
    const intensity = pairs[0]?.weight ?? "";
    const notesParts = ["cardio"];
    if (hrMatch?.[1]) notesParts.push(`HR ${hrMatch[1]}`);
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: intensity,
          reps: reps || "",
          notes: notesParts.join(" "),
          kind: "cardio",
        },
      ],
      "cardio"
    );
  }

  if (isSuperset) {
    if (exercises.length < 2) return makeAiDecision(MULTI_REASON);
    if (pairs.length < 2) return makeAiDecision("missing_reps");
    const rows: ParsedRow[] = [
      { exercise: exercises[0], weightLbs: pairs[0].weight, reps: pairs[0].reps, notes: "SS", kind: "superset" },
      { exercise: exercises[1], weightLbs: pairs[1].weight, reps: pairs[1].reps, notes: "SS", kind: "superset" },
    ];
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    if (leftoverNumericCount > 0 && pairs.length < 2) return makeAiDecision(MULTI_REASON);
    return buildFastDecision(rows, "superset");
  }

  if (isDropset && exercises.length === 1) {
    if (pairs.length < 2) return makeAiDecision(MULTI_REASON);
    const rows: ParsedRow[] = pairs.map((pair) => ({
      exercise: exercises[0],
      weightLbs: pair.weight,
      reps: pair.reps,
      notes: "DS",
      kind: "dropset",
    }));
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    return buildFastDecision(rows, "dropset");
  }

  if (pairs.length > 1) {
    const rows: ParsedRow[] = pairs.map((pair) => ({
      exercise: exercises[0],
      weightLbs: pair.weight,
      reps: pair.reps,
      notes: "",
      kind: "normal",
    }));
    if (rows.some((r) => !r.reps)) return makeAiDecision("missing_reps");
    if (leftoverNumericCount > 0) return makeAiDecision(MULTI_REASON);
    return buildFastDecision(rows, "multi");
  }

  if (pairs.length === 1) {
    const baseNotes: string[] = [];
    if (warmupFlag) baseNotes.push("warmup");
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: pairs[0].weight,
          reps: pairs[0].reps,
          notes: baseNotes.join(" "),
          kind: warmupFlag ? "warmup" : "normal",
        },
      ],
      warmupFlag ? "warmup" : "single"
    );
  }

  if (numberCount > 0) {
    return makeAiDecision("missing_reps");
  }

  return makeAiDecision("missing_reps");
}

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
    {
      message: "Bench 135 8",
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench",
      expectWeight: "135",
      expectReps: "8",
    },
    {
      message: "Lat pulldown 120x10",
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Lat pulldown",
      expectWeight: "120",
      expectReps: "10",
    },
    {
      message: "100 10",
      context: { lastExercise: "Bench" },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench",
      expectWeight: "100",
      expectReps: "10",
    },
    {
      message: "Bench 135 8, 155 6",
      expectKind: "fast",
      expectRowCount: 2,
      expectPattern: "multi",
    },
    {
      message: "Bench 185 8 then 165 10 dropset",
      expectKind: "fast",
      expectRowCount: 2,
      expectPattern: "dropset",
    },
    {
      message: "Bench and Push Ups superset 135 10 0 15",
      expectKind: "fast",
      expectRowCount: 2,
      expectPattern: "superset",
    },
    {
      message: "Elliptical 15 min HR 150",
      expectKind: "fast",
      expectRowCount: 1,
      expectPattern: "cardio",
    },
    {
      message: "Curls 20 10 warmup",
      expectKind: "fast",
      expectRowCount: 1,
      expectPattern: "warmup",
    },
    {
      message: "Squat 100kg 5",
      expectKind: "fast",
      expectRowCount: 1,
    },
    { message: "Bench and Leg press 135 8", expectKind: "ai" },
    { message: "", expectKind: "ai" },
  ];

  const failures: string[] = [];

  for (const test of cases) {
    const res = decideAndParse(test.message, test.context ?? {});
    if (res.kind !== test.expectKind) {
      failures.push(`"${test.message}" -> expected ${test.expectKind}, got ${res.kind}`);
      continue;
    }
    if (res.kind === "fast") {
      if (test.expectRowCount !== undefined && res.rows.length !== test.expectRowCount) {
        failures.push(`"${test.message}" rows mismatch: expected ${test.expectRowCount}, got ${res.rows.length}`);
      }
      if (test.expectExercise && res.rows[0]?.exercise !== test.expectExercise) {
        failures.push(
          `"${test.message}" exercise mismatch: expected "${test.expectExercise}" got "${res.rows[0]?.exercise}"`
        );
      }
      if (test.expectWeight !== undefined && res.rows[0]?.weightLbs !== test.expectWeight) {
        failures.push(
          `"${test.message}" weight mismatch: expected "${test.expectWeight}" got "${res.rows[0]?.weightLbs}"`
        );
      }
      if (test.expectReps && res.rows[0]?.reps !== test.expectReps) {
        failures.push(
          `"${test.message}" reps mismatch: expected "${test.expectReps}" got "${res.rows[0]?.reps}"`
        );
      }
      if (test.expectPattern && res.meta?.pattern !== test.expectPattern) {
        failures.push(
          `"${test.message}" pattern mismatch: expected "${test.expectPattern}" got "${res.meta?.pattern}"`
        );
      }
    }
  }

  if (failures.length) {
    // eslint-disable-next-line no-console
    console.warn("[structuredGate] dev tests failed:", failures);
  } else {
    // eslint-disable-next-line no-console
    console.log("[structuredGate] dev tests passed");
  }
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  runDevStructuredGateTests();
}
