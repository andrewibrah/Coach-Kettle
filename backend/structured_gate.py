from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Set

MULTI_REASON = "multiple_entries_or_sets"

MULTI_SEPARATORS = [";", "/"]
LIST_KEYWORDS = ["then", "next", "also"]


@dataclass
class GateRow:
  exercise: str
  weightLbs: str
  reps: str
  notes: str


@dataclass
class FastDecision:
  kind: str
  row: GateRow


@dataclass
class AiDecision:
  kind: str
  reason: str


GateDecision = FastDecision | AiDecision


def _strip_punctuation(value: str) -> str:
  return re.sub(r"^[\s\-,:;/]+|[\s\-,:;/]+$", "", value)


def _normalize_spaces(value: str) -> str:
  return " ".join(value.split()).strip()


def _has_multiple_sets(normalized: str, lower: str) -> bool:
  if any(sep in normalized for sep in MULTI_SEPARATORS):
    return True
  if " + " in normalized:
    return True
  if any(f" {kw} " in lower for kw in LIST_KEYWORDS):
    return True

  first_digit_idx = next((i for i, ch in enumerate(normalized) if ch.isdigit()), -1)
  if first_digit_idx > 0 and re.search(r"\band\b", lower[:first_digit_idx]):
    return True

  comma_parts = normalized.split(",")
  numeric_comma_parts = [part for part in comma_parts if re.search(r"\d", part)]
  if len(comma_parts) > 1 and len(numeric_comma_parts) >= 2:
    return True

  and_parts = re.split(r"\band\b", normalized, flags=re.I)
  and_numeric_parts = [part for part in and_parts if re.search(r"\d", part)]
  if len(and_parts) >= 2 and len(and_numeric_parts) >= 2:
    return True

  pair_matches = re.findall(r"\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\b", lower, flags=re.I)
  if len(pair_matches) >= 2:
    return True

  raw_numbers = re.findall(r"\b\d+(?:\.\d+)?\b", lower)
  if len(raw_numbers) >= 4:
    return True

  return False


def _extract_numbers(tokens: List[str]) -> tuple[Optional[str], Optional[str], Set[int], int]:
  weight: Optional[str] = None
  reps: Optional[str] = None
  used_indices: Set[int] = set()

  # Attached x-notation
  for i, token in enumerate(tokens):
    cleaned = token.rstrip(".,")
    match = re.match(r"(\d+(?:\.\d+)?)(?:lbs?|lb)?x(\d+(?:\.\d+)?)(?:reps?)?$", cleaned, flags=re.I)
    if match:
      weight, reps = match.group(1), match.group(2)
      used_indices.add(i)
      break

  # Split x-notation
  if not weight or not reps:
    for i, token in enumerate(tokens[:-1]):
      if i in used_indices:
        continue
      current_clean = token.rstrip(".,")
      current_match = re.match(r"(\d+(?:\.\d+)?)(?:lbs?|lb)?$", current_clean, flags=re.I)
      if not current_match:
        continue

      next_token = tokens[i + 1]
      next_clean = next_token.rstrip(".,")
      next_attached = re.match(r"x(\d+(?:\.\d+)?)(?:reps?)?$", next_clean, flags=re.I)

      if next_token.lower() in {"x", "×"} and i + 2 < len(tokens):
        after_next_clean = tokens[i + 2].rstrip(".,")
        after_next_match = re.match(r"(\d+(?:\.\d+)?)(?:reps?)?$", after_next_clean, flags=re.I)
        if after_next_match:
          weight = weight or current_match.group(1)
          reps = reps or after_next_match.group(1)
          used_indices.update({i, i + 1, i + 2})
          break

      if next_attached:
        weight = weight or current_match.group(1)
        reps = reps or next_attached.group(1)
        used_indices.update({i, i + 1})
        break

  # General numeric scan
  for i, token in enumerate(tokens):
    if i in used_indices:
      continue
    cleaned = token.rstrip(".,")
    match = re.match(r"(\d+(?:\.\d+)?)([a-zA-Z]*)$", cleaned)
    if not match:
      continue
    value, suffix = match.groups()
    suffix = (suffix or "").lower()
    next_lower = tokens[i + 1].lower() if i + 1 < len(tokens) else ""

    marked_reps = suffix.startswith("rep") or next_lower.startswith("rep") or suffix == "r"
    marked_weight = suffix.startswith("lb") or next_lower in {"lb", "lbs"} or suffix == "lbs"

    if marked_reps and reps is None:
      reps = value
      used_indices.add(i)
      if next_lower.startswith("rep"):
        used_indices.add(i + 1)
      continue
    if marked_weight and weight is None:
      weight = value
      used_indices.add(i)
      if next_lower in {"lb", "lbs"}:
        used_indices.add(i + 1)
      continue

    if weight is None:
      weight = value
      used_indices.add(i)
      continue
    if reps is None:
      reps = value
      used_indices.add(i)
      continue

  leftover_numeric_count = sum(1 for idx, tok in enumerate(tokens) if idx not in used_indices and re.search(r"\d", tok))

  return weight, reps, used_indices, leftover_numeric_count


def decide_and_parse(message: str, last_exercise: Optional[str] = None) -> GateDecision:
  trimmed = message.strip()
  if not trimmed:
    return AiDecision(kind="ai", reason="empty_message")
  if "\n" in trimmed:
    return AiDecision(kind="ai", reason=MULTI_REASON)

  normalized = _normalize_spaces(trimmed)
  lower = normalized.lower()

  if _has_multiple_sets(normalized, lower):
    return AiDecision(kind="ai", reason=MULTI_REASON)

  if re.search(r"\bsame as\b", lower):
    return AiDecision(kind="ai", reason="ambiguous_same_as_previous")

  if re.search(r"\bplates?\b", lower):
    return AiDecision(kind="ai", reason="unsupported_units")

  if re.search(r"\d+(?:\.\d+)?\s*kg\b", lower) or re.search(r"\bkgs?\b", lower):
    return AiDecision(kind="ai", reason="unsupported_units")

  if re.search(r"\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b", lower):
    return AiDecision(kind="ai", reason="non_lift_units")

  tokens = normalized.split(" ")
  first_number_idx = next((i for i, tok in enumerate(tokens) if re.search(r"\d", tok)), -1)

  exercise = ""
  exercise_token_end = 0
  if first_number_idx > 0:
    candidate = " ".join(tokens[:first_number_idx])
    cleaned = _strip_punctuation(candidate)
    if cleaned and re.search(r"[a-zA-Z]", cleaned):
      exercise = cleaned
      exercise_token_end = first_number_idx

  if not exercise and last_exercise:
    exercise = last_exercise.strip()
    exercise_token_end = 0

  if not exercise:
    return AiDecision(kind="ai", reason="missing_exercise")

  weight, reps, used_indices, leftover_numeric_count = _extract_numbers(tokens)
  if not reps:
    return AiDecision(kind="ai", reason="missing_reps")
  if leftover_numeric_count > 0:
    return AiDecision(kind="ai", reason=MULTI_REASON)

  notes_tokens = [tok for idx, tok in enumerate(tokens) if idx >= exercise_token_end and idx not in used_indices]
  notes = " ".join(notes_tokens).strip()

  return FastDecision(
    kind="fast",
    row=GateRow(
      exercise=exercise,
      weightLbs=weight or "",
      reps=reps,
      notes=notes,
    ),
  )


def _run_dev_tests():
  cases = [
    ("Bench 135 8", None, "fast"),
    ("Lat pulldown 120x10", None, "fast"),
    ("100 10", "Bench", "fast"),
    ("Hack squat 2 plates 10", None, "ai"),
    ("", None, "ai"),
    ("Bench 135 8, 155 6", None, "ai"),
    ("Bench and Leg press 135 8", None, "ai"),
    ("100", None, "ai"),
    ("Leg press 4 plates 10 reps", None, "ai"),
    ("same as above 8", None, "ai"),
    ("Squat 100kg 5", None, "ai"),
  ]

  failures: List[str] = []
  for message, last_exercise, expect_kind in cases:
    res = decide_and_parse(message, last_exercise)
    if res.kind != expect_kind:
      failures.append(f"{message!r}: expected {expect_kind}, got {res.kind}")

  if failures:
    print("[structured_gate] dev tests failed:", failures)
  else:
    print("[structured_gate] dev tests passed")


if __name__ == "__main__":
  _run_dev_tests()
