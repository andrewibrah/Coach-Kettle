import type { LogRow } from '../types/workout';
import { isPerformedRow } from './performedSets.ts';
import { numericValue } from './workoutValidation.ts';

type ParsedRowKind = "normal" | "warmup" | "dropset" | "superset" | "cardio";

export type ParsedRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  kind?: ParsedRowKind;
  setKind?: LogRow['setKind'];
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

type SkeletonFillUpdate = {
  weight: string;
  reps?: string;
  targetRowIndex: number;
};

export type GateDecision =
  | {
    kind: "fast";
    reason: "success";
    rows: ParsedRow[];
    meta?: { pattern?: FastPattern };
  }
  | { kind: "ai"; reason: GateDecisionReason }
  | { kind: "validation"; reason: "invalid_set_input"; originalInput: string; clarification: string }
  | { kind: "end_workout"; reason: "end_workout_intent" }
  | {
    kind: "fill_skeleton";
    reason: "fill_skeleton_row";
    weight: string;
    reps?: string;
    targetRowIndex: number;
  }
  | {
    kind: "fill_skeleton_batch";
    reason: "fill_skeleton_row";
    updates: SkeletonFillUpdate[];
  };

export interface SkeletonRow {
  id: string;
  performance?: "planned" | "performed";
  status?: "syncing" | "committed";
  setKind?: LogRow['setKind'];
  isRest?: boolean;
  isCardio?: boolean;
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
  /^(?:what(?:'?s)?|how|should|can|could|would|will|is|are|was|were|am|do|does|did|why|when|where|which|who|help|suggest|recommend|advice|tips?)\b/i;

// Inspect only the syntactic prefix, not the disclosure after a numeric set.
// Personal subjects, temporal introductions and sentence predicates are not
// exercise labels; their numbers must never acquire logging intent.
const hasConversationalPrefix = (message: string): boolean => {
  const prefix = message.split(/\d/, 1)[0];
  // A quantity of elapsed time is not a rep count. Intentional activity/time
  // commands retain their existing cardio grammar; later set notes are outside
  // this first-number boundary and cannot change the intent of a completed set.
  const temporalQuantity = /^[^\d]+\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\b/i.test(message) &&
    !hasCardioSignals(message.toLowerCase());
  return temporalQuantity || QUESTION_PREFIX_RE.test(message) ||
    /^(?:i|my|mine|we|our|ours|you|your|yours|he|his|she|her|hers|they|their|theirs|it|its|this|that|these|those|after|before|during|yesterday|today|earlier)\b/i.test(message) ||
    /\b(?:hurts?|felt|feels?|is|are|was|were|has|have|had|did|suggested|starts?|started|begins?|began|begun|lasts?|lasted|persists?|persisted|continues?|continued|returns?|returned|seems?|seemed|worsens?|worsened|improves?|improved)\b/i.test(prefix) ||
    /\b(?:pain|soreness|stiffness|aching|numbness|cramps?)\s*$/i.test(prefix) ||
    /\b(?:after|before|since|at|during)\s*$/i.test(prefix);
};

// Intent is not a whitelist of valid numeric patterns: missing reps, signs and
// unknown units must still reach validation. Conversational syntax outranks a
// numeric mention; bare numeric questions do not acquire an exercise from context.
const hasExplicitSetIntent = (message: string): boolean => {
  if (hasConversationalPrefix(message)) return false;
  const prefix = message.match(/^([a-z][a-z\s'()/&-]*?)\s+([+\-]?\s*(?:\d|\.\d))/i);
  if (!prefix) return false;
  const numericTail = message.slice(prefix[1].length).trimStart();
  // A relational phrase after the first number asks about a proposed set,
  // rather than declaring a completed weight/reps prefix with annotations.
  return !/^\d+(?:\.\d+)?\s*(?:kgs?|lbs?|plates?)?\s+(?:for|too|with|without|enough|okay|ok|safe)\b/i.test(numericTail);
};

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
  const parsed = numericValue(value);
  if (parsed.kind !== 'known') return "";
  const raw = parsed.value;
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

const parseCommaSeparatedSkeletonWeights = (message: string): string[] => {
  if (!message.includes(",")) return [];
  const tokens = message
    .split(/\s*,\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 2) return [];

  const weights: string[] = [];
  for (const token of tokens) {
    const match = token.match(/^(\d+(?:\.\d+)?)(?:\s*(kg|kgs?|lb|lbs?|plates?|plate))?$/i);
    if (!match) return [];
    weights.push(normalizeWeightToLbs(match[1], match[2]));
  }
  return weights.filter(Boolean);
};

// ─── Pair parsing ─────────────────────────────────────────────────────────────

type NumberPair = { weight: string; reps: string };
type ParsedPairs = { pairs: NumberPair[]; leftoverNumericCount: number; numberCount: number; invalid?: boolean; notes?: string };

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

  // Consume from the beginning, with a real separator and whole rep token.
  // Never search past a sign/unit or backtrack-split a single numeral.
  const pairRegex =
    /^(\d+(?:\.\d+)?)(?:\s*(kgs?|lbs?|plates?))?(?:\s*[x×]\s*|\s+)(\d+)(?:\s*reps?)?(?=$|\s|[,(:;!?—]|\.(?!\d))/i;
  let remaining = tail.trimStart();
  while (remaining) {
    const match = remaining.match(pairRegex);
    if (!match) {
      if (!pairs.length || /^(?:[+\-]?\d|[.,]\d|[x×](?:\s|$))/i.test(remaining)) {
        return { pairs: [], leftoverNumericCount: 0, numberCount: 0, invalid: true };
      }
      break;
    }
    const weight = normalizeWeightToLbs(match[1], match[2]);
    if (!weight || !Number.isFinite(Number(weight)) || !Number.isSafeInteger(Number(match[3]))) {
      return { pairs: [], leftoverNumericCount: 0, numberCount: 0, invalid: true };
    }
    pairs.push({ weight, reps: match[3] });
    remaining = remaining.slice(match[0].length).trimStart();
  }

  const numberCount = (tail.match(/\d+(?:\.\d+)?/g) ?? []).length;
  const leftoverNumericCount = Math.max(0, numberCount - pairs.length * 2);
  return { pairs, leftoverNumericCount, numberCount, notes: remaining };
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
  // Mode comes from a command/activity prefix, never a word in set notes.
  // Activity-only syntax requires its first numeric token to be time/distance;
  // e.g. Bike 100 8 after 15 min cardio is still a strength-set disclosure.
  return /^cardio\b/.test(lower) ||
    /^(?:elliptical|treadmill|bike|rower|run|jog|stairmaster|stairclimber|cycling)\s+\d+(?:\.\d+)?\s*(?:mins?|minutes?|miles?|km|meters?|m|hours?|hr)\b/.test(lower);
};

// Cardio metrics are consumed from the command boundary, never found by a
// substring search. Commas/semicolons separate fields, not decimal digits.
function parseCardioCommand(message: string): { invalid: true } | { invalid: false; row: ParsedRow } | null {
  const prefix = message.match(/^(cardio(?:\s+[a-z]+)?|elliptical|treadmill|bike|rower|run|jog|stairmaster|stairclimber|cycling)\s+(.+)$/i);
  if (!prefix) return null;
  let remaining = prefix[2];
  const unit = '(minutes?|mins?|miles?|km|meters?|m|hours?|hrs?|calories?|cals?|kcal)';
  // Non-cardio activity names can also be strength labels. Their first quantity
  // must be a time/distance declaration (including malformed numeric attempts).
  if (!/^cardio\b/i.test(prefix[1]) && !new RegExp('^[^\\s]+\\s*' + unit + '\\b', 'i').test(remaining)) return null;
  const row: ParsedRow = { exercise: prefix[1], weightLbs: '', reps: '', notes: '', kind: 'cardio', isCardio: true };
  let count = 0;
  while (remaining) {
    const labeled = remaining.match(/^(hr|heart\s*rate|bpm|level|lvl|resistance|incline)\s+([^\s;]+)(?=$|\s|;)/i);
    const quantity = remaining.match(new RegExp('^([^\\s]+?)\\s*' + unit + '(?=$|\\s|[,;])', 'i'));
    if (!labeled && !quantity) {
      // Narrative annotations remain literal after a completed declaration;
      // numeric/metric attempts cannot be silently demoted to annotations.
      if (!count || /^(?:[+\-.,\d]|NaN\b|Infinity\b|hr\b|heart\s*rate\b|bpm\b|level\b|lvl\b|resistance\b|incline\b)/i.test(remaining)) return { invalid: true };
      row.notes = remaining;
      break;
    }
    const match = labeled || quantity!;
    const raw = labeled ? match[2] : match[1];
    // A trailing separator belongs to the field only if not followed by a digit.
    const token = raw.replace(/,$/, '');
    const value = numericValue(token);
    if (value.kind !== 'known') return { invalid: true };
    let field: 'durationMins' | 'distance' | 'heartRate' | 'calories' | 'level';
    let n = value.value;
    const name = (labeled ? match[1] : match[2]).toLowerCase();
    if (/^(hr|heart|bpm)/.test(name) && labeled) field = 'heartRate';
    else if (labeled) field = 'level';
    else if (/^(min|hour|hr)/.test(name)) { field = 'durationMins'; if (/^(hour|hr)/.test(name)) n *= 60; }
    else if (/^(cal|kcal)/.test(name)) field = 'calories';
    else { field = 'distance'; row.distanceUnit = name.startsWith('mile') ? 'miles' : name === 'km' ? 'km' : 'meters'; }
    if (!Number.isFinite(n) || row[field] !== undefined) return { invalid: true };
    row[field] = n;
    count++;
    remaining = remaining.slice(match[0].length);
    // A declared unit closes the numeric token; its following comma separates
    // fields. Label-first numbers consume commas within their whole token above.
    remaining = remaining.replace(/^[\s,;]+/, '');
  }
  row.reps = row.durationMins !== undefined ? String(row.durationMins) : row.distance !== undefined ? String(row.distance) : '';
  row.weightLbs = row.distance !== undefined && row.durationMins !== undefined ? String(row.distance) : '';
  return { invalid: false, row };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function decideAndParse(message: string, context: GateContext): GateDecision {
  const trimmed = message.trim();
  if (!hasConversationalPrefix(trimmed) && (
      /^[^\d]*\b(?:NaN|Infinity)\s+(?:\d|[+-]?\.\d)/i.test(trimmed) ||
      /^[^\d]*\d+(?:\.\d+)?\s*(?:kgs?|lbs?|plates?)?\s*(?:x|×)?\s+\b(?:NaN|Infinity)\b/i.test(trimmed))) {
    return { kind: 'validation', reason: 'invalid_set_input', originalInput: message,
      clarification: 'Set quantities must be finite non-negative numbers with whole reps. Your input has been kept for correction.' };
  }
  const cardio = parseCardioCommand(trimmed);
  if (cardio) {
    if (cardio.invalid) return { kind: 'validation', reason: 'invalid_set_input', originalInput: message,
      clarification: 'Cardio quantities must be finite non-negative numbers. Your input has been kept for correction.' };
    return buildFastDecision([cardio.row], 'cardio');
  }

  if (!trimmed) return makeAiDecision("empty_message");

  if (isEndWorkoutIntent(trimmed.toLowerCase())) {
    return { kind: "end_workout", reason: "end_workout_intent" };
  }

  // "Same" → duplicate the last row that has weight + reps
  if (isSameSet(trimmed)) {
    if (context.currentRows && context.currentRows.length > 0) {
      const lastFilled = [...context.currentRows]
        .reverse()
        .find((r) => r.exercise.trim() && isPerformedRow(r) && !r.isCardio);
      if (lastFilled) {
        return buildFastDecision(
          [
            {
              exercise: lastFilled.exercise,
              weightLbs: lastFilled.weightLbs,
              reps: lastFilled.reps,
              notes: "",
              kind: lastFilled.setKind === "warmup" ? "warmup" : lastFilled.setKind === "drop" ? "dropset" : lastFilled.setKind === "superset" ? "superset" : "normal",
              setKind: lastFilled.setKind,
            },
          ],
          "single"
        );
      }
    }
    return {
      kind: "validation",
      reason: "invalid_set_input",
      originalInput: message,
      clarification: "Log a complete set before repeating it. Your input has been kept for correction.",
    };
  }

  // ─── Skeleton fill (routine-aware) ─────────────────────────────────────────
  if (context.currentRows && context.currentRows.length > 0) {
    const emptyRowIndices = context.currentRows
      .map((row, index) => (row.exercise && !row.isRest && !row.isCardio && row.status !== "syncing" && row.performance !== "performed" && (row.performance === "planned" || !row.weightLbs) ? index : -1))
      .filter((index) => index !== -1);

    const nextEmptyIdx = emptyRowIndices[0] ?? -1;

    if (nextEmptyIdx !== -1) {
      const commaSeparatedWeights = parseCommaSeparatedSkeletonWeights(trimmed);
      if (commaSeparatedWeights.length > 1) {
        const updates: SkeletonFillUpdate[] = commaSeparatedWeights
          .slice(0, emptyRowIndices.length)
          .map((weight, idx) => ({
            weight,
            targetRowIndex: emptyRowIndices[idx],
          }));
        if (updates.length > 0) {
          return {
            kind: "fill_skeleton_batch",
            reason: "fill_skeleton_row",
            updates,
          };
        }
      }

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

  // Classify intent independently of numeric validity and terminal punctuation.
  // Explicit label + numeric prefix is a set attempt even when its tokens are
  // malformed; only the parser below decides whether it can be logged.
  if (hasConversationalPrefix(trimmed) ||
      (isConversationalQuestion(trimmed) && !hasExplicitSetIntent(trimmed))) {
    return makeAiDecision("conversational_question");
  }

  if (trimmed.includes("\n")) return makeAiDecision("multiple_entries_or_sets");

  const normalized = normalizeSpaces(trimmed);
  const lower = normalized.toLowerCase();
  const tokens = normalized.split(" ");

  const firstNumberIdx = tokens.findIndex((tok) => numberRegex.test(tok));
  const exerciseSegment =
    firstNumberIdx > -1 ? tokens.slice(0, firstNumberIdx).join(" ") : normalized;

  // Validate the numeric prefix before interpreting any trailing control grammar.
  // Keep original offsets: only separator whitespace is removed from annotations.
  const rawTokens = [...message.matchAll(/\S+/g)];
  const tail = firstNumberIdx > -1 ? message.slice(rawTokens[firstNumberIdx].index) : "";
  const { pairs, leftoverNumericCount, numberCount, invalid, notes } = parsePairsFromTail(tail);
  const warmupCommand = /^(?:warm\s*-?\s*up)$/i;
  const warmupFlag = /\bwarm\s*-?\s*up\b/i.test(exerciseSegment) ||
    warmupCommand.test((notes || '').trim()) ||
    /^\d+\s+warm\s*-?\s*up\s*$/i.test(tail);
  const isSuperset = /\b(?:superset|ss)\b/i.test(exerciseSegment) ||
    (!invalid && pairs.length > 1 && hasMultipleExerciseSignals(exerciseSegment) &&
      /^(?:superset|ss)$/i.test((notes || '').trim()));
  // A terminal dropset marker is intentional only after multiple validated pairs.
  const isDropset = /\b(?:drops?et|drop set)\b/i.test(exerciseSegment) ||
    (!invalid && pairs.length > 1 && /^(?:drops?et|drop set)$/i.test((notes || '').trim()));
  const isCardio = hasCardioSignals(lower);

  if (!isSuperset && exerciseSegment && hasMultipleExerciseSignals(exerciseSegment)) {
    return makeAiDecision("multiple_entries_or_sets");
  }

  const exercises = extractExercises(
    warmupFlag ? exerciseSegment.replace(/\bwarm\s*-?\s*up\b/ig, '').trim() : exerciseSegment,
    isSuperset
  );

  const lastPerformed = [...(context.currentRows ?? [])].reverse()
    .find(row => row.exercise.trim() && isPerformedRow(row) && !row.isCardio);
  // Session rows are authoritative; a last-exercise hint may refer to a ghost
  // or template. Only the no-session legacy caller may rely on that hint.
  const inferredExercise = context.currentRows ? lastPerformed?.exercise : context.lastExercise;
  if (!exercises.length && inferredExercise) {
    exercises.push(inferredExercise.trim());
  }
  if (!exercises.length && !exerciseSegment && context.currentRows) {
    return {
      kind: "validation", reason: "invalid_set_input", originalInput: message,
      clarification: "Log a complete set with an exercise before using shorthand. Your input has been kept for correction.",
    };
  }
  if (!exercises.length) return makeAiDecision("missing_exercise");
  if (!isSuperset && exercises.length > 1) return makeAiDecision("multiple_entries_or_sets");

  // Single number input
  const malformedSign = /[+\-]$/.test(exerciseSegment);
  // Only explicit bodyweight entries may carry prose; bare-number inference
  // remains numeric-only. A unit or another numeric token is not a disclosure.
  const singleNumberMatch = exerciseSegment
    ? tail.match(/^(?:x\s*)?(\d+)(?=$|\s|[(:;!?—]|\.(?!\d))\s*((?!(?:for|kgs?|lbs?|plates?|oz|x)\b)(?:[a-z(:;!?—].*|\.(?!\d).*))?$/i)
    : tail.trim().match(/^(?:x\s*)?(\d+)$/);
  // A lone label immediately followed by another number competes with the
  // weight-unit-reps grammar. Unknown labels cannot turn a rejected pair into
  // invented bodyweight reps, even when more prose/punctuation follows it.
  // Effort labels and explicit narrative qualifiers introduce notes instead;
  // their numbers remain literal text, never structured effort measurements.
  const bodyweightSuffix = singleNumberMatch?.[2] || '';
  // Lex the second numeric attempt as a whole: arbitrary label words/token
  // punctuation, optional label delimiter, x/× and a sign with its own spaces.
  // Clear observation/relational prose before that number is an annotation;
  // isolated arbitrary labels are ambiguous units, not invented rep counts.
  // Colon/equal is a lexical label boundary, even when attached on either
  // side: label:8 and label=+8 are numeric attempts, not bodyweight notes.
  // Exclude these delimiters from label tokens instead of requiring whitespace
  // before them; complete positive annotation labels below still retain notes.
  const apparentUnitPair = /^[a-z][^\s:=]*(?:\s+[a-z][^\s:=]*)*(?:\s*[:=]\s*|\s+)(?:[x×]\s*)?(?:[+\-]\s*)?(?:\d|\.\d)/i.test(bodyweightSuffix);
  const annotationPrefix = /^(?:rpe|rir|pain|fatigue|unknown|after|before|during|since|at)(?=\s|$|[:=(])/i.test(bodyweightSuffix) ||
    /^[^\d]*\b(?:pain|soreness|stiffness|aching|numbness|cramps?|after|before|during|since|at)(?=\s|$|[:=(])/i.test(bodyweightSuffix);
  const ambiguousBodyweightPair = apparentUnitPair && !annotationPrefix;
  if (singleNumberMatch && !ambiguousBodyweightPair && Number.isSafeInteger(Number(singleNumberMatch[1])) &&
      !malformedSign && !isSuperset && !isDropset && !isCardio) {
    const singleNum = parseInt(singleNumberMatch[1], 10);

    // ── Bare number shorthand (no exercise name typed) ──────────────────
    // User typed just a number after previous sets, e.g. "150" after "bench 100 10"
    // Heuristic:  > 20 → weight change, carry over last reps
    //            ≤ 20 → rep count, carry over last weight
    if (!exerciseSegment && context.currentRows?.length) {
      const targetExLower = exercises[0].trim().toLowerCase();
      const lastFilledForExercise = [...context.currentRows]
        .reverse()
        .find(
          (r) =>
            r.exercise.trim().toLowerCase() === targetExLower &&
            isPerformedRow(r) && !r.isCardio
        );

      if (lastFilledForExercise) {
        if (singleNum > 20) {
          // Likely a weight — nobody does 21+ reps casually
          return buildFastDecision(
            [
              {
                exercise: exercises[0],
                weightLbs: formatWeight(singleNum),
                reps: lastFilledForExercise.reps,
                notes: warmupFlag ? "warmup" : "",
                kind: warmupFlag ? "warmup" : "normal",
              },
            ],
            warmupFlag ? "warmup" : "single"
          );
        } else {
          // Likely reps — carry over last weight
          return buildFastDecision(
            [
              {
                exercise: exercises[0],
                weightLbs: lastFilledForExercise.weightLbs,
                reps: String(singleNum),
                notes: warmupFlag ? "warmup" : "",
                kind: warmupFlag ? "warmup" : "normal",
              },
            ],
            warmupFlag ? "warmup" : "single"
          );
        }
      }
    }

    // Explicit exercise typed + single number → bodyweight reps (e.g. "pullups 15")
    return buildFastDecision(
      [
        {
          exercise: exercises[0],
          weightLbs: "0",
          reps: singleNumberMatch[1],
          notes: singleNumberMatch[2] || (warmupFlag ? "warmup" : ""),
          kind: warmupFlag ? "warmup" : "normal",
        },
      ],
      warmupFlag ? "warmup" : "single"
    );
  }

  if (invalid || malformedSign) {
    return {
      kind: "validation",
      reason: "invalid_set_input",
      originalInput: message,
      clarification: "Could not log this set. Use a non-negative weight in lb, kg or plates and a whole rep count, for example Bench 185 x 8. Your input has been kept for correction.",
    };
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
      notes: warmupFlag ? (notes || "warmup") : "",
      kind: (warmupFlag ? "warmup" : "normal") as ParsedRowKind,
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
          notes: notes || (warmupFlag ? "warmup" : ""),
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
  expectBatchCount?: number;
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
    {
      message: "100, 120",
      context: {
        currentRows: [
          { id: "1", exercise: "Bench Press", weightLbs: "", reps: "8" },
          { id: "2", exercise: "Bench Press", weightLbs: "", reps: "8" },
        ],
      },
      expectKind: "fill_skeleton_batch",
      expectBatchCount: 2,
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
    // ── Bare number shorthand (>20 = weight, ≤20 = reps) ──────────────
    // Bare number > 20 after filled rows → weight change, carry reps
    {
      message: "150",
      context: {
        lastExercise: "Bench",
        currentRows: [{ id: "1", exercise: "Bench", weightLbs: "100", reps: "10" }],
      },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench",
      expectWeight: "150",
      expectReps: "10",
    },
    // Bare number ≤ 20 after filled rows → reps change, carry weight
    {
      message: "8",
      context: {
        lastExercise: "Bench",
        currentRows: [{ id: "1", exercise: "Bench", weightLbs: "185", reps: "10" }],
      },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Bench",
      expectWeight: "185",
      expectReps: "8",
    },
    // Bare "20" → reps (boundary case, ≤ 20)
    {
      message: "20",
      context: {
        lastExercise: "Squat",
        currentRows: [{ id: "1", exercise: "Squat", weightLbs: "225", reps: "5" }],
      },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Squat",
      expectWeight: "225",
      expectReps: "20",
    },
    // Bare "25" → weight (> 20)
    {
      message: "25",
      context: {
        lastExercise: "Curls",
        currentRows: [{ id: "1", exercise: "Curls", weightLbs: "20", reps: "12" }],
      },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Curls",
      expectWeight: "25",
      expectReps: "12",
    },
    // Explicit exercise + single number → still bodyweight reps (pullups 15)
    {
      message: "Pullups 15",
      context: {
        lastExercise: "Bench",
        currentRows: [{ id: "1", exercise: "Bench", weightLbs: "185", reps: "10" }],
      },
      expectKind: "fast",
      expectRowCount: 1,
      expectExercise: "Pullups",
      expectWeight: "0",
      expectReps: "15",
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
    if (res.kind === "fill_skeleton_batch" && test.expectBatchCount !== undefined) {
      if (res.updates.length !== test.expectBatchCount) {
        failures.push(`"${test.message}" batch count: expected ${test.expectBatchCount}, got ${res.updates.length}`);
      }
    }
  }

  if (failures.length) {
    console.warn("[structuredGate] tests FAILED:", failures);
  } else {
    if (__DEV__) console.info("[structuredGate] all tests passed ✓");
  }
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  runDevStructuredGateTests();
}
