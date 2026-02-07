# Input Parsing

## File
`lib/structuredGate.ts` — regex-first parser, AI fallback

## Decision Types
```typescript
type GateDecision =
  | { kind: 'fast', rows: ParsedRow[] }      // Regex matched
  | { kind: 'ai', reason: string }            // Needs AI
  | { kind: 'end_workout' }                   // User done
  | { kind: 'fill_skeleton', weight, reps?, targetRowIndex }  // Template fill
```

## Flow
```
Input → preprocess → intent check → pattern match → fast/ai decision
```

## Patterns Supported

| Input | Pattern |
|-------|---------|
| `Bench 185 x 8` | Single set |
| `Bench 185 3x8` | Multi-set |
| `185 x 8` | Shorthand (uses last exercise) |
| `185, 165, 145 x 8` | Drop set |
| `Bench 185 + Rows 135 x 8` | Superset |
| `Run 20 min` | Cardio |
| `Bench 60kg x 8` | Auto kg→lbs |
| `2 plates x 8` | Plate math (2×45+45=225) |

## Intent Detection
```typescript
// End workout phrases
"done", "finished", "end workout", "that's a wrap"

// Questions → AI
"how much should I lift?", "what's my PR?"
```

## Adding New Pattern

```typescript
// lib/structuredGate.ts

// 1. Add regex
const PAUSE_REP_PATTERN = /^(.+?)\s+(\d+)\s*x\s*(\d+)\s+(\d+)s\s*pause$/i;

// 2. Add to tryPatterns()
const pauseMatch = input.match(PAUSE_REP_PATTERN);
if (pauseMatch) {
  return {
    kind: 'fast',
    rows: [{
      exercise: pauseMatch[1],
      weightLbs: pauseMatch[2],
      reps: pauseMatch[3],
      notes: `${pauseMatch[4]}s pause`
    }]
  };
}
```

## API Fallback
When regex fails → `api.chat(message, rows)` → AI parses → returns rows
