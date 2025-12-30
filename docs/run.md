BackEnd 
in ./EasyWorkouts/backend 
source .venv/bin/activate 
./.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000  

Frontend 
in ./EasyWorkouts
npm run ios 
or 
npm start 

 1. Implementation Plan A — Parsing & Data Integrity
     “Create an implementation plan to finish deterministic parsing in this codebase (lib/structuredGate.ts, lib/workoutRules.ts, app/
     (tabs)/index.tsx). Include steps, dependencies, and acceptance criteria for: multi‑set input parsing (single exercise), warmup
     sets (set 0), dropsets (decimal set numbers + DS note), supersets (two exercises with SS note), cardio/time‑based rows (minutes
     in reps + cardio note), and unit normalization (lbs/kg/plates). Plan must specify new/updated tests in lib/structuredGate.ts dev
     tests and how to safely fall back to AI. Provide estimates per step.”
  2. Implementation Plan B — Editing & Table UX
     “Create an implementation plan to add row editing + table actions: tap‑to‑edit row fields, delete with undo, duplicate row, and
     reorder within exercise. Scope UI updates to components/WorkoutTable.tsx and state handling in app/(tabs)/index.tsx. Include data
     integrity rules for set numbering, edge cases (editing exercise name changes set sequence), and acceptance criteria. Provide
     milestone order and time estimates.”
  3. Implementation Plan C — Coach Q&A + Polish
     “Create an implementation plan to add Coach Q&A and UX polish. Scope: add a Coach entry point on main screen, prompt for
     question, send table context to AI, show response in modal with a bottom ‘Close’ button. Also add loading indicators + haptics in
     components/WorkoutBottomBar.tsx and improved error hints using reason codes from lib/structuredGate.ts (docs/nextsetp.md
     guidance). Include dependency order, API changes if needed (backend/main.py, lib/api.ts), and acceptance criteria.”