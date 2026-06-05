#!/bin/bash
# PostToolUse hook: warns when direct Supabase client usage is detected
# in client-side code (app/, components/, hooks/, contexts/)
# Exit 1 = warning (AI sees the message and can self-correct)

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', ''))
except:
    print('')
" 2>/dev/null)

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# Only check client-side directories
if ! echo "$FILE" | grep -qE "/(app|components|hooks|contexts)/"; then
  exit 0
fi

# Pull the written/edited content
if [[ "$TOOL" == "Write" ]]; then
  CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('content', ''))
except:
    print('')
" 2>/dev/null)
elif [[ "$TOOL" == "Edit" ]]; then
  CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('new_string', ''))
except:
    print('')
" 2>/dev/null)
else
  exit 0
fi

# Detect direct supabase client instantiation (not an import line)
if echo "$CONTENT" | grep -qE "createClient\(" && ! echo "$CONTENT" | grep -qE "^import|from ['\"]"; then
  echo "WARNING: Direct Supabase client instantiation detected in client code ($FILE). All mutations must go through lib/api.ts — never instantiate supabase client directly in app/components/hooks/contexts." >&2
  exit 1
fi

exit 0
