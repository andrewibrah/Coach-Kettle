# Coaching System

> Daily honest feedback + harshness state machine + behavior event log.

---

## Tables (migration 0034)

| Table | Purpose |
|---|---|
| `daily_feedback` | One row per user per day. Grades, color, did-well / needs-improvement / tomorrow-focus narrative, harshness level, streaks. |
| `behavior_state` | Current per-user state machine row. `harshness_level 0..3`, consecutive good/bad days, last evaluated date. |
| `behavior_events` | Append-only audit of grading decisions. |

## Harshness state machine

| Level | Tone | Trigger |
|---|---|---|
| 0 | `supportive` | Default / good streak |
| 1 | `firm` | 1 bad day or streak break |
| 2 | `direct` | 2 consecutive bad days |
| 3 | `accountability` | 3+ consecutive bad days |

A **bad day** = `nutrition_color === 'red'` OR (scheduled training day AND no workout logged).
A **good day** = `nutrition_color === 'green'` AND (workout completed OR not a training day).

Good streaks decrement the level by 1 each day (floor 0).

## Edge function: `daily-feedback`

- `GET ?action=today` — generates and returns today's feedback (idempotent — uses upsert).
- `GET ?action=recent&days=N` — last N days from `get_recent_daily_feedback` RPC.
- `POST { action: 'generate', date? }` — regenerate for a date.
- `POST { action: 'state' }` — fetch current behavior state.

The narrative builder lives in `buildNarrative` inside the edge function. It picks language based on tone and never produces filler ("Great job!" is forbidden — every line must cite a specific gap or hit).

## Client API

`lib/coaching.ts` — `fetchTodayFeedback()`, `fetchRecentFeedback()`, `generateFeedbackForDate()`, `fetchBehaviorState()`.

## State

`contexts/CoachingContext.tsx` exposes `today`, `recent`, `state`, `refresh()`, `regenerateToday()`.
