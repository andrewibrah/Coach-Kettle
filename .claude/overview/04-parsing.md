# Input Parsing System

> How natural language workout input becomes structured data.

---

## Overview

The **Structured Gate** (`lib/structuredGate.ts`) is the brain of input parsing. It attempts to parse workout entries locally using regex patterns, only falling back to AI for complex or ambiguous input.

**Philosophy:** Fast path for 90% of inputs, AI for edge cases.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/structuredGate.ts` | Local regex parser |
| `lib/api.ts` | AI parsing endpoints |
| `app/(tabs)/index.tsx` | Orchestrates parsing |

---

## Decision Types

```typescript
type GateDecision =
  // Fast: Parsed locally, no API call
  | {
      kind: "fast";
      reason: "success";
      rows: ParsedRow[];
      meta?: { pattern: string };
    }

  // AI: Needs AI to understand
  | {
      kind: "ai";
      reason: string;
      userHint?: string;  // Explain why going to AI
    }

  // End Workout: User wants to finish
  | {
      kind: "end_workout";
      reason: "end_workout_intent";
    }

  // Fill Skeleton: Fill template placeholder
  | {
      kind: "fill_skeleton";
      reason: string;
      weight: string;
      reps?: string;
      targetRowIndex: number;
    }
```

---

## Parsing Flow

```
User Input: "Bench 185 x 8"
       │
       ▼
┌─────────────────────────────────────┐
│         PREPROCESSING               │
│  - Trim whitespace                  │
│  - Normalize case                   │
│  - Handle special characters        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         INTENT DETECTION            │
│  - "end workout" → end_workout      │
│  - "?" suffix → ai (question)       │
│  - Conversational → ai              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         PATTERN MATCHING            │
│  Try each regex pattern in order:   │
│  1. Full set (exercise + weight)    │
│  2. Multi-set (3x8)                 │
│  3. Shorthand (weight only)         │
│  4. Drop set (comma-separated)      │
│  5. Superset (+ separator)          │
│  6. Cardio patterns                 │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
   MATCHED         NO MATCH
       │               │
       ▼               ▼
   { kind: "fast" }   { kind: "ai" }
```

---

## Supported Patterns

### 1. Standard Set
```
Pattern: /^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:x|×)?\s*(\d+)$/i
Example: "Bench Press 185 x 8"
Result:  { exercise: "Bench Press", weightLbs: "185", reps: "8" }
```

### 2. Multi-Set Notation
```
Pattern: /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+)x(\d+)$/i
Example: "Squat 225 3x5"
Result:  3 rows, each with weightLbs: "225", reps: "5"
```

### 3. Shorthand (Use Last Exercise)
```
Pattern: /^(\d+(?:\.\d+)?)\s+(\d+)$/
Example: "195 8" (after logging Bench)
Result:  { exercise: "Bench Press", weightLbs: "195", reps: "8" }
Context: Uses lastExercise from previous row
```

### 4. Drop Set
```
Pattern: /^(.+?)\s+(\d+(?:,\s*\d+)+)\s*(?:x|×)?\s*(\d+)$/i
Example: "Bench 185, 165, 145 x 8"
Result:  3 rows with different weights, marked as drop set
```

### 5. Superset
```
Pattern: /^(.+?)\s+(\d+)(?:\s*x\s*(\d+))?\s*\+\s*(.+?)\s+(\d+)(?:\s*x\s*(\d+))?$/i
Example: "Bench 185 x 8 + Rows 135 x 10"
Result:  2 rows, marked as superset
```

### 6. Warmup
```
Pattern: /^warmup\s+(.+)$/i
Example: "Warmup bench 95 x 10"
Result:  { exercise: "Bench Press", notes: "warmup" }
```

### 7. Cardio (Order-Independent Metrics)

Cardio parsing now supports multiple metrics in any order:
- Duration: `30 min` or `30 minutes`
- Distance: `3 miles`, `5 km`, `400 meters` / `400 m`
- Calories: `300 cal`
- Heart rate: `hr 140`
- Level/incline: `level 5`

Examples:
```
"Run 30 min" → duration only
"Run 3 miles" → distance only
"Treadmill 30 min 3 miles 300 cal hr 140 level 5" → all metrics
"Bike 45 min level 8 hr 155" → duration + level + HR (any order)
```

Result type for cardio:
```typescript
{
  exercise: string;
  isCardio: true;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
}
```

### 8. Kilogram Conversion
```
Pattern: /(\d+(?:\.\d+)?)\s*kg/i
Example: "Squat 100kg x 5"
Result:  Converts to lbs: 100 * 2.205 = 220.5 lbs
```

### 9. Plate Math
```
Pattern: /(\d+)\s*plates?/i
Example: "Bench 2 plates x 8"
Result:  2 plates = 225 lbs (bar + 2*45 each side)
```

---

## Template Skeleton Filling

When using templates, rows start as "skeletons" without weight/reps:

```typescript
// Skeleton row from template
{
  exercise: "Bench Press",
  weightLbs: "",  // Empty!
  reps: "",       // Empty!
  isSkeleton: true
}

// User types: "185 8"
// structuredGate detects skeleton context
{
  kind: "fill_skeleton",
  weight: "185",
  reps: "8",
  targetRowIndex: 0
}

// Result: Skeleton filled in
{
  exercise: "Bench Press",
  weightLbs: "185",
  reps: "8",
  isSkeleton: false
}
```

---

## AI Fallback Triggers

The gate falls back to AI when:

1. **Question detected** - Input ends with `?`
2. **Conversational** - Starts with "what", "how", "why", etc.
3. **No pattern match** - Regex patterns failed
4. **Ambiguous** - Multiple valid interpretations

```typescript
// AI fallback triggers
const AI_TRIGGERS = [
  /\?$/,                           // Questions
  /^(what|how|why|when|where)/i,  // Question words
  /^(help|explain|show)/i,         // Help requests
  /^(should|could|would)/i,        // Conditional
];

if (AI_TRIGGERS.some(t => t.test(message))) {
  return { kind: 'ai', reason: 'question_detected' };
}
```

---

## ParsedRow to LogRow

```typescript
// From structuredGate
interface ParsedRow {
  exercise: string;
  weightLbs?: string;
  reps?: string;
  notes?: string;
  // Cardio fields (v1.0.0+)
  isCardio?: boolean;
  durationMins?: number;
  distance?: number;
  distanceUnit?: 'miles' | 'km' | 'meters';
  heartRate?: number;
  calories?: number;
  level?: number;
}

// Convert to LogRow
function toLogRow(parsed: ParsedRow, rows: LogRow[]): LogRow {
  return {
    id: makeId(),
    exercise: parsed.exercise,
    set: nextSetNumberForExercise(rows, parsed.exercise),
    weightLbs: parsed.weightLbs || '',
    reps: parsed.reps || '',
    notes: parsed.notes || '',
    timestamp: Date.now(),
    // Cardio fields
    isCardio: parsed.isCardio,
    durationMins: parsed.durationMins,
    distance: parsed.distance,
    distanceUnit: parsed.distanceUnit,
    heartRate: parsed.heartRate,
    calories: parsed.calories,
    level: parsed.level,
  };
}
```

---

## Implementing Changes

### Adding a new pattern

```typescript
// In lib/structuredGate.ts

// 1. Define the regex
const NEW_PATTERN = /^pattern-here$/i;

// 2. Add handler in decideAndParse
function decideAndParse(message: string, context: ParseContext): GateDecision {
  // ... existing patterns ...

  // Add new pattern check
  const newMatch = message.match(NEW_PATTERN);
  if (newMatch) {
    return {
      kind: 'fast',
      reason: 'success',
      rows: [{
        exercise: newMatch[1],
        weightLbs: newMatch[2],
        reps: newMatch[3]
      }],
      meta: { pattern: 'new_pattern' }
    };
  }

  // ... rest of function ...
}
```

### Testing patterns

```typescript
// Add test cases
const testCases = [
  { input: "Bench 185 x 8", expected: { kind: "fast", exercise: "Bench" } },
  { input: "What exercise?", expected: { kind: "ai" } },
  // ... more cases
];
```

### Modifying AI fallback

Edit the `AI_TRIGGERS` array or the fallback logic in `decideAndParse`.

---

## Debugging Tips

1. **Log decisions**: Add console.log in `decideAndParse` to see which path was taken
2. **Check meta.pattern**: The `fast` decision includes which regex matched
3. **Test regex online**: Use regex101.com with JavaScript flavor

---

## Related Docs
- [03-workout-flow.md](./03-workout-flow.md) - How parsing fits in the flow
- [06-api.md](./06-api.md) - AI parsing endpoints
