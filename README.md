# Coach Kettle

Your pocket gym buddy that logs your sets so you don't have to think about it.

Pick your body parts, punch in your lifts, and Coach Kettle builds your workout table in real-time. No sign-up screens. No complicated menus. Just you and the iron.

## How it works

1. Tap to pick your body parts (Chest + Tri, Back + Bi, Legs, whatever combo)
2. Type your exercise, weight, and reps
3. Hit **Add** — the row drops into your table and the exercise stays filled for your next set
4. Switch exercises by typing a new name. Set numbers handle themselves.
5. When you're done, your whole session is right there on screen

```
            02/02 Chest + Arms Workout
+----------------------+-----+--------+------+-------+
| Exercise             | Set | Weight | Reps | Notes |
+----------------------+-----+--------+------+-------+
| Flat Bench (Machine) | 0   | 100    | 12   | WU    |
|                      | 1   | 190    | 9    |       |
|                      | 2   | 240    | 4    |       |
|                      | 3   | 190    | 6    |       |
| Incline Machine      | 1   | 90     | 9    |       |
|                      | 2   | 140    | 5    |       |
| Elliptical Cardio    | -   | —      |15 min| HR180 |
+----------------------+-----+--------+------+-------+
```

## AI-powered input

Coach Kettle understands gym shorthand. Instead of filling in every field, just talk to it:

> "bench 185 10"

It figures out the exercise, auto-increments your set number, keeps weights in pounds, and handles drop sets, super sets, warmups, and cardio — all from messy one-line input.

## Supports your workflow

- **Drop sets** — logged with decimal set numbers (2.1, 2.2) and DS in notes
- **Super sets** — stacked exercises with SS notation
- **Warmups** — set number 0
- **Cardio** — duration in reps, intensity in weight
- **Dark mode** — full light and dark theme support
- **Daily rollover** — session resets automatically at midnight

## Run it

**Frontend**

```bash
npm install
npx expo start
```

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set `OPENAI_API_KEY` in your environment for AI input parsing.

## Stack

- **App**: React Native + Expo (iOS, Android, Web)
- **Backend**: Python FastAPI + OpenAI GPT-4o-mini
- **Database**: Supabase (Postgres) — migrations in `supabase/`
- **Theming**: Light + dark mode

## What's next

- Supabase auth + per-user workout history
- Workout history browser
- AI coach that analyzes your trends and gives advice
