import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI()

# Allow Expo dev origins; keep explicit (no wildcard) by default.
cors_env = os.getenv("CORS_ORIGINS", "").strip()
allow_origins = (
    [origin.strip() for origin in cors_env.split(",") if origin.strip()]
    if cors_env
    else [
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI client reads OPENAI_API_KEY from environment
client = OpenAI()


class WorkoutRow(BaseModel):
    exercise: str
    set: int
    weightLbs: str
    reps: str
    notes: str


class ChatRequest(BaseModel):
    message: str
    rows: list[WorkoutRow] = []


class ChatResponse(BaseModel):
    rows: list[WorkoutRow]


class CoachRequest(BaseModel):
    question: str
    rows: list[WorkoutRow] = []


class CoachResponse(BaseModel):
    answer: str


class ParseRequest(BaseModel):
    message: str
    lastExercise: str | None = None


class ParseRow(BaseModel):
    exercise: str
    weightLbs: str
    reps: str
    notes: str


class ParseResponse(BaseModel):
    kind: str
    reason: str | None = None
    rows: list[ParseRow] = []
    userHint: str | None = None


from structured_gate import decide_and_parse, FastDecision, AiDecision


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
def chat(req: ChatRequest):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")

    system_prompt = """
You are a Gym Workout Tracker parser.

Return a JSON object with a single key "rows" containing an array of workout rows.
Each row must include: exercise (string), set (integer), weightLbs (string), reps (string), notes (string).
If a field is missing, return an empty string.
If weights are mentioned, convert to numeric pounds with no units.
Set numbers must auto-increment per exercise based on existing rows provided.
Return only new rows inferred from the message.
Do not include extra keys, text, or markdown.
"""

    try:
        context = {
            "message": req.message,
            "existing_rows": [row.model_dump() for row in req.rows],
        }

        resp = client.responses.parse(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(context)},
            ],
            text_format=ChatResponse,
        )

        parsed = resp.output_parsed
        if parsed is None:
            raise HTTPException(status_code=500, detail="Model did not return structured output")

        return parsed.model_dump()

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="OpenAI request failed")


@app.post("/coach")
def coach(req: CoachRequest):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set on the server")

    system_prompt = """
You are Coach, a concise strength trainer.
Use the workout table as context when answering the user's question.
- If rows are present, reference trends, gaps, or next steps based on them.
- If no rows are provided, give a short, actionable answer without making up data.
Keep answers under 120 words and prioritize clear, numbered or bulleted guidance when helpful.
"""

    try:
        context = {
            "question": req.question,
            "rows": [row.model_dump() for row in req.rows],
        }

        resp = client.responses.parse(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(context)},
            ],
            text_format=CoachResponse,
        )

        parsed = resp.output_parsed
        if parsed is None:
            raise HTTPException(status_code=500, detail="Model did not return structured output")

        return parsed.model_dump()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="OpenAI request failed")



@app.post("/parse")
def parse(req: ParseRequest):
    result = decide_and_parse(req.message, req.lastExercise)

    if isinstance(result, FastDecision):
        return ParseResponse(
            kind="fast",
            rows=[ParseRow(
                exercise=result.row.exercise,
                weightLbs=result.row.weightLbs,
                reps=result.row.reps,
                notes=result.row.notes,
            )],
        )
    elif isinstance(result, AiDecision):
        return ParseResponse(kind="ai", reason=result.reason)
    
    raise HTTPException(status_code=500, detail="Unknown decision type")



import sqlite3
from datetime import datetime

DB_PATH = "workouts.db"

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workouts (
                id TEXT PRIMARY KEY,
                dateISO TEXT,
                part TEXT,
                createdAt INTEGER,
                rows_json TEXT
            )
        """)

init_db()

class BackendWorkoutRow(BaseModel):
    exercise: str
    weightLbs: str
    reps: str
    notes: str
    timestamp: int | None = None

class WorkoutSession(BaseModel):
    id: str
    dateISO: str
    part: str
    rows: list[BackendWorkoutRow]
    createdAt: int

@app.post("/history")
def save_workout(session: WorkoutSession):
    print(f"[save_workout] Received session: id={session.id}, dateISO={session.dateISO}, part={session.part}, createdAt={session.createdAt}")
    print(f"[save_workout] Rows count: {len(session.rows)}")
    for i, r in enumerate(session.rows):
        print(f"[save_workout]   Row {i}: exercise={r.exercise}, weightLbs={r.weightLbs}, reps={r.reps}, timestamp={r.timestamp}")
    
    rows_json = json.dumps([r.model_dump() for r in session.rows])
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO workouts (id, dateISO, part, createdAt, rows_json) VALUES (?, ?, ?, ?, ?)",
            (session.id, session.dateISO, session.part, session.createdAt, rows_json)
        )
    print(f"[save_workout] Saved successfully to database")
    return {"ok": True}

@app.get("/history")
def list_workouts():
    sessions = []
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("SELECT id, dateISO, part, createdAt, rows_json FROM workouts ORDER BY createdAt DESC")
        for row in cursor:
            w_id, date_iso, part, created_at, rows_str = row
            try:
                rows_data = json.loads(rows_str)
                rows = [BackendWorkoutRow(**r) for r in rows_data]
            except:
                rows = []
            
            sessions.append(WorkoutSession(
                id=w_id,
                dateISO=date_iso,
                part=part,
                rows=rows,
                createdAt=created_at
            ))
    return sessions

@app.delete("/history/{workout_id}")
def delete_workout(workout_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
    return {"ok": True}


