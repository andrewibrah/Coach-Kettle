# CLAUDE.md

**Coach Kettle** - Expo/React Native workout tracker with Supabase backend. Natural language input ("Bench 185 x 8") parsed locally or via AI.

## How to Work on This Codebase

1. **Read `docs/README.md`** - Full navigation, file structure, patterns
2. **Find your area** - Use the doc index to locate the relevant guide
3. **Read the specific doc** - Each doc has key files, code examples, implementation steps
4. **Implement** - Follow existing patterns in the codebase

## Commands

```bash
npm install        # Install deps
npx expo start     # Dev server (i=iOS, a=Android, w=web)
npm run lint       # Lint check
```

## Critical Rules

- **Imports**: Always use `@/` prefix (`import { x } from '@/lib/api'`)
- **Colors**: Use `useThemeColor()`, never hardcode
- **Mutations**: All DB writes go through Edge Functions, never direct
- **Pending edits**: Call `commitPendingAndGet()` before API calls with row data

## App Vibe

Fast, minimal, gym-friendly. Local parsing before AI. Big touch targets. PRs get confetti.
