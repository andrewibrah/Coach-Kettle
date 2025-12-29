export type GateDecision =
  | {
      kind: "fast";
      row: { exercise: string; weightLbs: string; reps: string; notes: string };
    }
  | { kind: "ai"; reason: string };

type GateContext = { lastExercise?: string };

const MULTI_REASON = "multiple_entries_or_sets";

const MULTI_SEPARATORS = [";", "/"];
const LIST_KEYWORDS = ["then", "next", "also"];

const numberRegex = /\d/;

const stripPunctuation = (value: string) => value.replace(/^[\s\-,:;/]+|[\s\-,:;/]+$/g, "");

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

function hasMultipleSets(normalized: string, lower: string): boolean {
  if (MULTI_SEPARATORS.some((sep) => normalized.includes(sep))) return true;
  if (normalized.includes(" + ")) return true;
  if (LIST_KEYWORDS.some((kw) => lower.includes(` ${kw} `))) return true;

  // "and" before the first number is a strong sign of multiple exercises
  const firstDigitIdx = normalized.search(/\d/);
  if (firstDigitIdx > 0) {
    const prefix = lower.slice(0, firstDigitIdx);
    if (/\band\b/.test(prefix)) return true;
  }

  const commaParts = normalized.split(",");
  const numericCommaParts = commaParts.filter((part) => numberRegex.test(part));
  if (commaParts.length > 1 && numericCommaParts.length >= 2) return true;

  const andParts = normalized.split(/\band\b/i).map((p) => p.trim());
  const andPartsWithNumbers = andParts.filter((p) => numberRegex.test(p));
  if (andParts.length >= 2 && andPartsWithNumbers.length >= 2) return true;

  const pairMatches = [...lower.matchAll(/\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\b/gi)];
  if (pairMatches.length >= 2) return true;

  const rawNumbers = [...lower.matchAll(/\b\d+(?:\.\d+)?\b/g)];
  if (rawNumbers.length >= 4) return true;

  return false;
}

type ParsedNumbers = {
  weight?: string;
  reps?: string;
  usedIndices: Set<number>;
  leftoverNumericCount: number;
};

function extractNumbers(tokens: string[], lowerTokens: string[]): ParsedNumbers {
  let weight: string | undefined;
  let reps: string | undefined;
  const usedIndices = new Set<number>();

  // 1) Attached x-notation (e.g., 135x8 or 135lbsx8)
  for (let i = 0; i < tokens.length; i++) {
    const cleaned = tokens[i].replace(/[.,]$/, "");
    const attached = cleaned.match(/^(\d+(?:\.\d+)?)(?:lbs?|lb)?[xX](\d+(?:\.\d+)?)(?:reps?)?$/);
    if (attached) {
      weight = attached[1];
      reps = attached[2];
      usedIndices.add(i);
      break;
    }
  }

  // 2) Split x notation: "135 x 8" or "135 x8"
  if (!weight || !reps) {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (usedIndices.has(i)) continue;
      const currentClean = tokens[i].replace(/[.,]$/, "");
      const currentMatch = currentClean.match(/^(\d+(?:\.\d+)?)(?:lbs?|lb)?$/i);
      if (!currentMatch) continue;

      const nextLower = lowerTokens[i + 1] ?? "";
      const nextToken = tokens[i + 1] ?? "";
      const nextClean = nextToken.replace(/[.,]$/, "");
      const nextAttached = nextClean.match(/^[xX](\d+(?:\.\d+)?)(?:reps?)?$/);
      const nextNumber = nextClean.match(/^(\d+(?:\.\d+)?)(?:reps?)?$/);

      if ((nextLower === "x" || nextLower === "×") && tokens[i + 2]) {
        const afterNextClean = tokens[i + 2].replace(/[.,]$/, "");
        const afterNext = afterNextClean.match(/^(\d+(?:\.\d+)?)(?:reps?)?$/);
        if (afterNext) {
          weight = weight ?? currentMatch[1];
          reps = reps ?? afterNext[1];
          usedIndices.add(i);
          usedIndices.add(i + 1);
          usedIndices.add(i + 2);
          break;
        }
      }

      if (nextAttached) {
        weight = weight ?? currentMatch[1];
        reps = reps ?? nextAttached[1];
        usedIndices.add(i);
        usedIndices.add(i + 1);
        break;
      }

      if (nextNumber && nextLower.startsWith("x")) {
        weight = weight ?? currentMatch[1];
        reps = reps ?? nextNumber[1];
        usedIndices.add(i);
        usedIndices.add(i + 1);
        break;
      }
    }
  }

  // 3) General numeric scan
  let leftoverNumericCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (usedIndices.has(i)) continue;
    const cleaned = tokens[i].replace(/[.,]$/, "");
    const match = cleaned.match(/^(\d+(?:\.\d+)?)([a-zA-Z]*)$/);
    if (!match) continue;
    const value = match[1];
    const suffix = match[2].toLowerCase();
    const nextLower = lowerTokens[i + 1] ?? "";

    const markedAsReps =
      suffix.startsWith("rep") || nextLower.startsWith("rep") || suffix === "r";
    const markedAsWeight =
      suffix.startsWith("lb") || nextLower === "lb" || nextLower === "lbs" || suffix === "lbs";

    if (markedAsReps && !reps) {
      reps = value;
      usedIndices.add(i);
      if (nextLower.startsWith("rep")) usedIndices.add(i + 1);
      continue;
    }
    if (markedAsWeight && !weight) {
      weight = value;
      usedIndices.add(i);
      if (nextLower === "lb" || nextLower === "lbs") usedIndices.add(i + 1);
      continue;
    }

    if (!weight) {
      weight = value;
      usedIndices.add(i);
      continue;
    }
    if (!reps) {
      reps = value;
      usedIndices.add(i);
      continue;
    }
  }

  // Any remaining numeric tokens that were not captured are ambiguous.
  for (let i = 0; i < tokens.length; i++) {
    if (usedIndices.has(i)) continue;
    if (numberRegex.test(tokens[i])) {
      leftoverNumericCount += 1;
    }
  }

  return { weight, reps, usedIndices, leftoverNumericCount };
}

function buildNotes(
  tokens: string[],
  usedIndices: Set<number>,
  exerciseTokenEndExclusive: number
): string {
  const notesTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i < exerciseTokenEndExclusive) continue;
    if (usedIndices.has(i)) continue;
    notesTokens.push(tokens[i]);
  }
  return notesTokens.join(" ").trim();
}

export function decideAndParse(message: string, context: GateContext): GateDecision {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "ai", reason: "empty_message" };
  if (trimmed.includes("\n")) return { kind: "ai", reason: MULTI_REASON };

  const normalized = normalizeSpaces(trimmed);
  const lower = normalized.toLowerCase();

  if (hasMultipleSets(normalized, lower)) {
    return { kind: "ai", reason: MULTI_REASON };
  }

  if (/\bsame as\b/.test(lower)) {
    return { kind: "ai", reason: "ambiguous_same_as_previous" };
  }

  if (/\bplates?\b/.test(lower)) {
    return { kind: "ai", reason: "unsupported_units" };
  }

  if (/\d+(?:\.\d+)?\s*kg\b/i.test(normalized) || /\bkgs?\b/.test(lower)) {
    return { kind: "ai", reason: "unsupported_units" };
  }

  if (/\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b/.test(lower)) {
    return { kind: "ai", reason: "non_lift_units" };
  }

  const tokens = normalized.split(" ");
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const firstNumberIdx = tokens.findIndex((tok) => numberRegex.test(tok));

  let exercise = "";
  let exerciseTokenEnd = 0;

  if (firstNumberIdx > 0) {
    const candidate = tokens.slice(0, firstNumberIdx).join(" ");
    const cleaned = stripPunctuation(candidate);
    if (cleaned && /[a-z]/i.test(cleaned)) {
      exercise = cleaned;
      exerciseTokenEnd = firstNumberIdx;
    }
  }

  if (!exercise && context.lastExercise) {
    const last = context.lastExercise.trim();
    if (last) {
      exercise = last;
      exerciseTokenEnd = 0;
    }
  }

  if (!exercise) {
    return { kind: "ai", reason: "missing_exercise" };
  }

  const { weight, reps, usedIndices, leftoverNumericCount } = extractNumbers(tokens, lowerTokens);

  if (!reps) {
    return { kind: "ai", reason: "missing_reps" };
  }
  if (leftoverNumericCount > 0) {
    return { kind: "ai", reason: MULTI_REASON };
  }

  const weightLbs = weight ?? "";
  const notes = buildNotes(tokens, usedIndices, exerciseTokenEnd);

  return {
    kind: "fast",
    row: {
      exercise,
      weightLbs,
      reps,
      notes,
    },
  };
}

type DevTestCase = {
  message: string;
  context?: GateContext;
  expectKind: GateDecision["kind"];
  expectExercise?: string;
  expectWeight?: string;
  expectReps?: string;
};

function runDevStructuredGateTests() {
  const cases: DevTestCase[] = [
    {
      message: "Bench 135 8",
      expectKind: "fast",
      expectExercise: "Bench",
      expectWeight: "135",
      expectReps: "8",
    },
    {
      message: "Lat pulldown 120x10",
      expectKind: "fast",
      expectExercise: "Lat pulldown",
      expectWeight: "120",
      expectReps: "10",
    },
    {
      message: "100 10",
      context: { lastExercise: "Bench" },
      expectKind: "fast",
      expectExercise: "Bench",
      expectWeight: "100",
      expectReps: "10",
    },
    {
      message: "Hack squat 2 plates 10",
      expectKind: "ai",
    },
    { message: "", expectKind: "ai" },
    { message: "Bench 135 8, 155 6", expectKind: "ai" },
    { message: "Bench and Leg press 135 8", expectKind: "ai" },
    { message: "100", expectKind: "ai" },
    { message: "Leg press 4 plates 10 reps", expectKind: "ai" },
    { message: "same as above 8", expectKind: "ai" },
    { message: "Squat 100kg 5", expectKind: "ai" },
  ];

  const failures: string[] = [];

  for (const test of cases) {
    const res = decideAndParse(test.message, test.context ?? {});
    if (res.kind !== test.expectKind) {
      failures.push(`"${test.message}" -> expected ${test.expectKind}, got ${res.kind}`);
      continue;
    }
    if (res.kind === "fast") {
      if (test.expectExercise && res.row.exercise !== test.expectExercise) {
        failures.push(
          `"${test.message}" exercise mismatch: expected "${test.expectExercise}" got "${res.row.exercise}"`
        );
      }
      if (test.expectWeight !== undefined && res.row.weightLbs !== test.expectWeight) {
        failures.push(
          `"${test.message}" weight mismatch: expected "${test.expectWeight}" got "${res.row.weightLbs}"`
        );
      }
      if (test.expectReps && res.row.reps !== test.expectReps) {
        failures.push(
          `"${test.message}" reps mismatch: expected "${test.expectReps}" got "${res.row.reps}"`
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
