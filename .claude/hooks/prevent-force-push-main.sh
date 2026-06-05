#!/bin/bash
# PreToolUse hook: blocks force-push to main or master
# Exit 2 = hard block (Claude cannot proceed with the action)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

if echo "$COMMAND" | grep -qE "(push).*(--force|-f)" && echo "$COMMAND" | grep -qE "\b(main|master)\b"; then
  echo "BLOCKED: Force push to main/master is not allowed. Use a PR or ask the user to run it manually." >&2
  exit 2
fi

exit 0
