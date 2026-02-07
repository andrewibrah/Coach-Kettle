# CLAUDE.md

**Coach Kettle** - Expo/React Native workout tracker with Supabase backend. Natural language input ("Bench 185 x 8") parsed locally or via AI.

## MCP Tools (if available)

| Tool | When |
|------|------|
| `guide(task)` | **Start here** - returns doc + file skeletons |
| `skeleton(path)` | Understand a file's exports/imports/hooks |
| `map(path)` | See directory structure |
| `area(name)` | Deep dive: auth, workout, parsing, etc |

## Without MCP

1. Read `docs/README.md` - navigation + patterns
2. Find relevant doc from index
3. Follow the patterns

## Commands

```bash
npm install        # Install deps
npx expo start     # Dev (i=iOS, a=Android, w=web)
npm run lint       # Lint
```

## Rules

- `@/` imports only
- `useThemeColor()` for colors
- Mutations via Edge Functions
- `commitPendingAndGet()` before API calls

## Vibe

Fast. Minimal. Gym-friendly. PRs get confetti.
