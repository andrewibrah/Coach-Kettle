# Baseline Inventory

No Supabase changes.

## Data Stores
- SQLite database at `backend/workouts.db`. Tables present: `workouts`, `workout_log`, `sqlite_sequence`. `backend/main.py` only reads/writes the `workouts` table via `sqlite3` using `DB_PATH = "workouts.db"`.
- AsyncStorage on-device cache in `lib/workoutStorage.ts` with key `workout_history_v1`, storing serialized `WorkoutSession[]`.
- Supabase connection details are listed in `docs/supabase.md`, but no code references were found in the repo. UNKNOWN whether Supabase is in use.

## API Surface
- `GET /health` -> `{ "ok": true }`.
- `POST /chat` -> request `{ message: string, rows: { exercise: string, set: number, weightLbs: string, reps: string, notes: string }[] }`; response `{ rows: { exercise: string, set: number, weightLbs: string, reps: string, notes: string }[] }`.
- `POST /coach` -> request `{ question: string, rows: { exercise: string, set: number, weightLbs: string, reps: string, notes: string }[] }`; response `{ answer: string }`.
- `POST /parse` and `POST /parse/fast` -> request `{ message: string, lastExercise?: string | null }`; response `{ kind: "fast" | "ai", reason?: string, rows?: { exercise: string, weightLbs: string, reps: string, notes: string }[], userHint?: string }`.
- `POST /log` -> request `{ exercise: string, set: number, weightLbs: string, reps: string, notes: string }`; response `{ "ok": true }`.
- `POST /history` -> request `{ id: string, dateISO: string, part: string, rows: { id?: string, exercise: string, weightLbs: string, reps: string, notes: string, timestamp?: number }[], createdAt: number }`; response `{ "ok": true }`.
- `GET /history` -> response `{ id: string, dateISO: string, part: string, rows: { id?: string, exercise: string, weightLbs: string, reps: string, notes: string, timestamp?: number }[], createdAt: number }[]`.
- `DELETE /history/{workout_id}` -> response `{ "ok": true }`.

## Auth
- No auth middleware, token checks, or session handling found in backend or client.
- No auth providers, roles/permissions, or user/profile tables referenced in code. UNKNOWN whether auth is planned or handled elsewhere.

## Business Logic
- Client-side parsing gate in `lib/structuredGate.ts` decides if a message is parsed locally (fast) or sent to `/chat` for AI parsing.
- Backend `backend/structured_gate.py` mirrors the structured parsing logic used by `/parse` and `/parse/fast`.
- Workout session state assembly and set numbering logic live in client code (e.g., `app/(tabs)/index.tsx`, `lib/workoutRules.ts`).
- History persistence uses SQLite upsert on `workouts` table in `backend/main.py`.

## Background Jobs
- No cron jobs, queues, or background workers found.

## Storage
- No object/file storage integrations found.
- Local storage consists of SQLite (`backend/workouts.db`) and AsyncStorage (`workout_history_v1`).

## Offline Sync
- `lib/workoutStorage.ts` writes sessions to AsyncStorage and attempts best-effort sync to `/history` (errors are swallowed).
- Current UI screens primarily call the API directly (`api.saveWorkout`, `api.getHistory`), so offline history behavior is UNKNOWN.

## External Services
- OpenAI API via `OPENAI_API_KEY` is used by `/chat` and `/coach` (FastAPI server).
- Supabase secrets listed in `docs/supabase.md`, but no runtime usage found. UNKNOWN whether Supabase is active.
