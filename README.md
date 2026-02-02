# EasyWorkouts

The fastest way to log your sets. No menus, no dropdowns, no friction.

Just type what you did. The app handles the rest.

## How it works

1. Pick your body parts (Chest + Tri, Legs, whatever)
2. Punch in your exercise, weight, and reps
3. Hit Add. Row goes to the table. Exercise stays filled so you can bang out sets fast.
4. When you switch exercises, just type the new name. Set numbers reset automatically.

That's it. Your workout builds in real-time as a clean table right on screen.

```
               02/02 Chest + Arms Workout
+-----------------------+-----+---------+------+-------+
| Exercise              | Set | Weight  | Reps | Notes |
+-----------------------+-----+---------+------+-------+
| Flat Bench (Machine)  | 0   | 100     | 12   | WU    |
|                       | 1   | 190     | 9    |       |
|                       | 2   | 240     | 4    |       |
|                       | 3   | 190     | 6    |       |
| Incline Machine       | 1   | 90      | 9    |       |
|                       | 2   | 140     | 5    |       |
| Elliptical Cardio     | -   | —       |15 min| HR180 |
+-----------------------+-----+---------+------+-------+
```

## AI Chat (optional)

Don't want to fill in fields? Just talk to it.

> "bench 185 10"

The AI parses your messy gym shorthand into structured rows. It knows what exercise you're on, auto-increments sets, converts units, and handles drop sets, super sets, and warmups.

## Run it

**Frontend (Expo)**

```bash
npm install
npx expo start
```

**Backend (FastAPI)**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set `OPENAI_API_KEY` in your environment for the AI chat feature.

## Stack

- **App**: React Native + Expo (iOS, Android, Web)
- **Backend**: Python FastAPI + OpenAI GPT-4o-mini
- **Database**: Supabase (Postgres) — migrations in `supabase/`
- **Theming**: Light + dark mode

## What's next

- Supabase auth + per-user workout history
- Workout history viewer
- AI coach that analyzes your trends
