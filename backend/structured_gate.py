from __future__ import annotations

import re
import math
from dataclasses import dataclass, field
from typing import List, Optional, Union, Dict, Literal

# --- Types ---

ParsedRowKind = Literal["normal", "warmup", "dropset", "superset", "cardio"]
GateDecisionReason = Literal[
    "empty_message",
    "multiple_entries_or_sets",
    "ambiguous_same_as_previous",
    "unsupported_units",
    "non_lift_units",
    "missing_exercise",
    "missing_reps",
    "success",
]
FastPattern = Literal["single", "multi", "dropset", "superset", "cardio", "warmup"]

@dataclass
class ParsedRow:
    exercise: str
    weightLbs: str
    reps: str
    notes: str
    kind: ParsedRowKind = "normal"

@dataclass
class FastDecision:
    kind: Literal["fast"]
    reason: Literal["success"]
    rows: List[ParsedRow]
    meta: Optional[Dict[str, FastPattern]] = None

@dataclass
class AiDecision:
    kind: Literal["ai"]
    reason: GateDecisionReason
    userHint: Optional[str] = None

GateDecision = Union[FastDecision, AiDecision]

@dataclass
class GateContext:
    lastExercise: Optional[str] = None

# --- Constants & Helpers ---

MULTI_REASON: GateDecisionReason = "multiple_entries_or_sets"
KG_TO_LB = 2.20462
PLATE_WEIGHT = 45
BAR_WEIGHT = 45

NUMBER_REGEX = re.compile(r"\d")

def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()

def format_weight(num: float) -> str:
    if not math.isfinite(num):
        return ""
    rounded = round(num, 1)
    # Check if integer
    if rounded.is_integer():
        return str(int(rounded))
    return str(rounded)

def normalize_weight_to_lbs(value: str, unit: Optional[str] = None) -> str:
    try:
        raw = float(value)
    except ValueError:
        return ""
    
    if not math.isfinite(raw):
        return ""
    
    if not unit:
        return format_weight(raw)
    
    u = unit.lower()
    if u.startswith("kg"):
        return format_weight(raw * KG_TO_LB)
    if u.startswith("plate"):
        return format_weight(raw * PLATE_WEIGHT * 2 + BAR_WEIGHT)
    
    return format_weight(raw)

def user_hint_for_reason(reason: GateDecisionReason) -> Optional[str]:
    if reason == "empty_message":
        return 'Try something like "Bench 185 x 8".'
    elif reason == "multiple_entries_or_sets":
        return "One exercise per message. Format: Exercise Weight Reps."
    elif reason == "ambiguous_same_as_previous":
        return "Say the exercise name or repeat the full set."
    elif reason == "unsupported_units":
        return "Use lbs or kg (we convert). Skip plate math if unsure."
    elif reason == "non_lift_units":
        return 'If cardio, try "Elliptical 15 min". Otherwise log weight/reps.'
    elif reason == "missing_exercise":
        return 'What exercise? Try "Bench 185 8" or just "135 10".'
    elif reason == "missing_reps":
        return "Add reps. Example: Exercise Weight Reps."
    else:
        return None

def make_ai_decision(reason: GateDecisionReason) -> AiDecision:
    return AiDecision(
        kind="ai",
        reason=reason,
        userHint=user_hint_for_reason(reason)
    )

@dataclass
class NumberPair:
    weight: str
    reps: str

@dataclass
class ParsedPairs:
    pairs: List[NumberPair]
    leftoverNumericCount: int
    numberCount: int

def parse_pairs_from_tail(tail: str) -> ParsedPairs:
    pairs: List[NumberPair] = []
    # Regular expression to match weight/reps pairs similarly to the TypeScript version
    pair_regex = re.compile(
        r"(\d+(?:\.\d+)?)(?:\s*(kg|kgs?|lb|lbs?|plates?|plate))?[\s]*(?:x|×)?[\s]*(\d+(?:\.\d+)?)(?:\s*reps?)?",
        re.IGNORECASE
    )
    
    for match in pair_regex.finditer(tail):
        val1, unit, val2 = match.groups()
        pairs.append(NumberPair(
            weight=normalize_weight_to_lbs(val1, unit),
            reps=val2
        ))
        
    all_numbers = re.findall(r"\d+(?:\.\d+)?", tail)
    number_count = len(all_numbers)
    leftover = max(0, number_count - len(pairs) * 2)
    
    return ParsedPairs(pairs, leftover, number_count)

def extract_exercises(segment: str, allow_multiple: bool) -> List[str]:
    cleaned = re.sub(r"\bsuperset\b", "", segment, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bss\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    
    if not cleaned:
        return []
    
    if not allow_multiple:
        return [cleaned]
        
    parts = re.split(r"\band\b|\/|,", cleaned, flags=re.IGNORECASE)
    parts = [normalize_spaces(p) for p in parts if p and normalize_spaces(p)]
    
    if parts:
        return parts
    return [cleaned]

def has_multiple_exercise_signals(segment: str) -> bool:
    if re.search(r"\b(and|&)\b", segment, flags=re.IGNORECASE):
        return True
    if re.search(r"[,/]", segment):
        return True
    return False

def has_cardio_signals(lower: str) -> bool:
    if re.search(r"\bcardio\b|\belliptical\b|\btreadmill\b|\bbike\b|\brow(er)?\b|\brun\b|\bjog\b", lower):
        return True
    if re.search(r"\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b", lower):
        return True
    return False

def build_fast_decision(rows: List[ParsedRow], pattern: Optional[FastPattern] = None) -> FastDecision:
    meta = {"pattern": pattern} if pattern else None
    return FastDecision(kind="fast", reason="success", rows=rows, meta=meta)

def decide_and_parse(message: str, context: GateContext) -> GateDecision:
    trimmed = message.strip()
    if not trimmed:
        return make_ai_decision("empty_message")
    if "\n" in trimmed:
        return make_ai_decision(MULTI_REASON)
        
    normalized = normalize_spaces(trimmed)
    lower = normalized.lower()
    
    tokens = normalized.split(" ")
    
    first_number_idx = -1
    for i, tok in enumerate(tokens):
        if NUMBER_REGEX.search(tok):
            first_number_idx = i
            break
            
    warmup_flag = bool(re.search(r"\bwarm\s*-?\s*up\b", lower))
    is_superset = bool(re.search(r"\bsuperset\b", lower) or re.search(r"\bss\b", lower))
    is_dropset = bool(re.search(r"\bdrops?et\b", lower) or re.search(r"\bdrop set\b", lower))
    is_cardio = has_cardio_signals(lower)
    
    if re.search(r"\bsame as\b", lower):
        return make_ai_decision("ambiguous_same_as_previous")
        
    exercise_segment = normalized
    if first_number_idx > -1:
        exercise_segment = " ".join(tokens[:first_number_idx])
        
    if not is_superset and exercise_segment and has_multiple_exercise_signals(exercise_segment):
        return make_ai_decision(MULTI_REASON)
        
    exercises = extract_exercises(exercise_segment, is_superset)
    
    if not exercises and context.lastExercise:
        exercises.append(context.lastExercise.strip())
        
    if not exercises:
        return make_ai_decision("missing_exercise")
    
    if not is_superset and len(exercises) > 1:
        return make_ai_decision(MULTI_REASON)
        
    tail = ""
    if first_number_idx > -1:
        tail = " ".join(tokens[first_number_idx:])
        
    # Check for single number first (bodyweight exercise: reps only)
    single_number_match = re.match(r"^(?:x\s*)?(\d+)$", tail)
    if single_number_match and not is_superset and not is_dropset and not is_cardio:
        reps = single_number_match.group(1)
        base_notes = []
        if warmup_flag:
            base_notes.append("warmup")
        
        return build_fast_decision(
            [
                ParsedRow(
                    exercise=exercises[0],
                    weightLbs="0",
                    reps=reps,
                    notes=" ".join(base_notes),
                    kind="warmup" if warmup_flag else "normal"
                )
            ],
            "warmup" if warmup_flag else "single"
        )
        
    pairs_result = parse_pairs_from_tail(tail)
    pairs = pairs_result.pairs
    leftover_numeric_count = pairs_result.leftoverNumericCount
    number_count = pairs_result.numberCount
    
    if is_cardio:
        minutes_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)", lower)
        distance_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mile|miles|km)", lower)
        hr_match = re.search(r"hr\s*(\d+(?:\.\d+)?)", lower)
        
        reps_val = ""
        if minutes_match:
            reps_val = minutes_match.group(1)
        elif distance_match:
            reps_val = distance_match.group(1)
        elif len(pairs) > 0:
            reps_val = pairs[0].reps or pairs[0].weight
            
        intensity = pairs[0].weight if len(pairs) > 0 else ""
        
        notes_parts = ["cardio"]
        if hr_match:
            notes_parts.append(f"HR {hr_match.group(1)}")
            
        return build_fast_decision(
            [
                ParsedRow(
                    exercise=exercises[0],
                    weightLbs=intensity,
                    reps=reps_val,
                    notes=" ".join(notes_parts),
                    kind="cardio"
                )
            ],
            "cardio"
        )
        
    if is_superset:
        if len(exercises) < 2:
            return make_ai_decision(MULTI_REASON)
        if len(pairs) < 2:
            return make_ai_decision("missing_reps")
            
        rows = [
            ParsedRow(exercise=exercises[0], weightLbs=pairs[0].weight, reps=pairs[0].reps, notes="SS", kind="superset"),
            ParsedRow(exercise=exercises[1], weightLbs=pairs[1].weight, reps=pairs[1].reps, notes="SS", kind="superset"),
        ]
        
        if any(not r.reps for r in rows):
            return make_ai_decision("missing_reps")
            
        if leftover_numeric_count > 0 and len(pairs) < 2:
             return make_ai_decision(MULTI_REASON)
             
        return build_fast_decision(rows, "superset")
        
    if is_dropset and len(exercises) == 1:
        if len(pairs) < 2:
            return make_ai_decision(MULTI_REASON)
            
        rows = [
            ParsedRow(
                exercise=exercises[0],
                weightLbs=pair.weight,
                reps=pair.reps,
                notes="DS",
                kind="dropset"
            ) for pair in pairs
        ]
        
        if any(not r.reps for r in rows):
            return make_ai_decision("missing_reps")
            
        return build_fast_decision(rows, "dropset")
        
    if len(pairs) > 1:
        rows = [
            ParsedRow(
                exercise=exercises[0],
                weightLbs=pair.weight,
                reps=pair.reps,
                notes="",
                kind="normal"
            ) for pair in pairs
        ]
        
        if any(not r.reps for r in rows):
            return make_ai_decision("missing_reps")
        if leftover_numeric_count > 0:
            return make_ai_decision(MULTI_REASON)
            
        return build_fast_decision(rows, "multi")
        
    if len(pairs) == 1:
        base_notes = []
        if warmup_flag:
            base_notes.append("warmup")
            
        return build_fast_decision(
            [
                ParsedRow(
                    exercise=exercises[0],
                    weightLbs=pairs[0].weight,
                    reps=pairs[0].reps,
                    notes=" ".join(base_notes),
                    kind="warmup" if warmup_flag else "normal"
                )
            ],
            "warmup" if warmup_flag else "single"
        )
        
    if number_count > 0:
        return make_ai_decision("missing_reps")
        
    return make_ai_decision("missing_reps")

def _run_dev_tests():
    cases = [
        {
            "message": "Bench 135 8",
            "expectKind": "fast",
            "expectRowCount": 1,
            "expectExercise": "Bench",
            "expectWeight": "135",
            "expectReps": "8",
        },
        {
            "message": "Lat pulldown 120x10",
            "expectKind": "fast",
            "expectRowCount": 1,
            "expectExercise": "Lat pulldown",
            "expectWeight": "120",
            "expectReps": "10",
        },
        {
            "message": "100 10",
            "context": GateContext(lastExercise="Bench"),
            "expectKind": "fast",
            "expectRowCount": 1,
            "expectExercise": "Bench",
            "expectWeight": "100",
            "expectReps": "10",
        },
        {
            "message": "Bench 135 8, 155 6",
            "expectKind": "fast",
            "expectRowCount": 2,
            "expectPattern": "multi",
        },
        {
            "message": "Bench 185 8 then 165 10 dropset",
            "expectKind": "fast",
            "expectRowCount": 2,
            "expectPattern": "dropset",
        },
        {
            "message": "Bench and Push Ups superset 135 10 0 15",
            "expectKind": "fast",
            "expectRowCount": 2,
            "expectPattern": "superset",
        },
        {
            "message": "Elliptical 15 min HR 150",
            "expectKind": "fast",
            "expectRowCount": 1,
            "expectPattern": "cardio",
        },
        {
            "message": "Curls 20 10 warmup",
            "expectKind": "fast",
            "expectRowCount": 1,
            "expectPattern": "warmup",
        },
        {
            "message": "Squat 100kg 5",
            "expectKind": "fast",
            "expectRowCount": 1,
        },
        { "message": "Bench and Leg press 135 8", "expectKind": "ai" },
        { "message": "", "expectKind": "ai" },
    ]

    failures = []

    for test in cases:
        ctx = test.get("context", GateContext())
        res = decide_and_parse(test["message"], ctx)
        
        if res.kind != test["expectKind"]:
            failures.append(f"\"{test['message']}\" -> expected {test['expectKind']}, got {res.kind}")
            continue
            
        if res.kind == "fast":
            if "expectRowCount" in test and len(res.rows) != test["expectRowCount"]:
                 failures.append(f"\"{test['message']}\" rows mismatch: expected {test['expectRowCount']}, got {len(res.rows)}")
                 
            if "expectExercise" in test and res.rows and res.rows[0].exercise != test["expectExercise"]:
                 failures.append(f"\"{test['message']}\" exercise mismatch: expected \"{test['expectExercise']}\" got \"{res.rows[0].exercise}\"")
                 
            if "expectWeight" in test and res.rows and res.rows[0].weightLbs != test["expectWeight"]:
                 failures.append(f"\"{test['message']}\" weight mismatch: expected \"{test['expectWeight']}\" got \"{res.rows[0].weightLbs}\"")
                 
            if "expectReps" in test and res.rows and res.rows[0].reps != test["expectReps"]:
                 failures.append(f"\"{test['message']}\" reps mismatch: expected \"{test['expectReps']}\" got \"{res.rows[0].reps}\"")
                 
            if "expectPattern" in test:
                 pattern = res.meta.get("pattern") if res.meta else None
                 if pattern != test["expectPattern"]:
                      failures.append(f"\"{test['message']}\" pattern mismatch: expected \"{test['expectPattern']}\" got \"{pattern}\"")

    if failures:
        print("[structured_gate] dev tests failed:", failures)
    else:
        print("[structured_gate] dev tests passed")

if __name__ == "__main__":
    _run_dev_tests()
