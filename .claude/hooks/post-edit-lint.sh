#!/bin/bash
# PostToolUse hook: runs eslint --fix on edited .ts/.tsx files
# Non-blocking (exit 0) — just fixes what it can silently

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    print(ti.get('file_path', ''))
except:
    print('')
" 2>/dev/null)

if [[ "$FILE" =~ \.(tsx|ts)$ ]] && [[ -f "$FILE" ]]; then
  PROJECT_ROOT="$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null)"
  if [[ -n "$PROJECT_ROOT" ]]; then
    cd "$PROJECT_ROOT" && npx eslint --fix "$FILE" 2>/dev/null || true
  fi
fi

exit 0
