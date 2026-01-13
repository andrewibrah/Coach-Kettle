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
    answer: str | None = None


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

Analyze the user's message.
1. If the user is trying to log a set (e.g. "Bench 135x5", "Squat 3 sets"), return a JSON object with:
   - "rows": [array of inferred rows]
   - "answer": null
   - Each row must include: exercise, set, weightLbs, reps, notes. Auto-increment sets.
2. If the user is asking a question (e.g. "What should I do next?", "How much weight?"), return:
   - "rows": []
   - "answer": "Short, helpful advice (<50 words)."

Do not return both rows and an answer. Priority is logging if ambiguous.
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

        # Save to history if it's a question
        if parsed.answer:
            with sqlite3.connect(DB_PATH) as conn:
                chat_id = datetime.now().strftime("%Y%m%d-%H%M%S")
                conn.execute(
                    "INSERT INTO chats (id, title, role, content, createdAt, source) VALUES (?, ?, ?, ?, ?, ?)",
                    (f"{chat_id}-u", "Workout Q&A", "user", req.message, int(datetime.now().timestamp() * 1000), "workout_chat")
                )
                conn.execute(
                    "INSERT INTO chats (id, title, role, content, createdAt, source) VALUES (?, ?, ?, ?, ?, ?)",
                    (f"{chat_id}-a", "Workout Q&A", "assistant", parsed.answer, int(datetime.now().timestamp() * 1000), "workout_chat")
                )

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

        # Save to history
        with sqlite3.connect(DB_PATH) as conn:
            chat_id = datetime.now().strftime("%Y%m%d-%H%M%S")
            conn.execute(
                "INSERT INTO chats (id, title, role, content, createdAt, source) VALUES (?, ?, ?, ?, ?, ?)",
                (f"{chat_id}-u", "Coach Q&A", "user", req.question, int(datetime.now().timestamp() * 1000), "coach_modal")
            )
            conn.execute(
                "INSERT INTO chats (id, title, role, content, createdAt, source) VALUES (?, ?, ?, ?, ?, ?)",
                (f"{chat_id}-a", "Coach Q&A", "assistant", parsed.answer, int(datetime.now().timestamp() * 1000), "coach_modal")
            )

        return parsed.model_dump()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="OpenAI request failed")



@app.post("/parse")
@app.post("/parse/fast")
def parse_fast(req: ParseRequest):
    # Unified endpoint using structured_gate
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


@app.post("/log")
def log_set(row: WorkoutRow):
    # Stub for per-set logging
    print(f"[log_set] {row.exercise} {row.weightLbs}x{row.reps}")
    return {"ok": True}



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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT,
                role TEXT,
                content TEXT,
                createdAt INTEGER,
                source TEXT
            )
        """)


init_db()


class BackendWorkoutRow(BaseModel):
    id: str | None = None
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
    # Upsert workout session
    rows_json = json.dumps([r.model_dump() for r in session.rows])
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO workouts (id, dateISO, part, createdAt, rows_json) VALUES (?, ?, ?, ?, ?)",
                (session.id, session.dateISO, session.part, session.createdAt, rows_json)
            )
            conn.commit()
    except Exception as e:
        print(f"[save_workout] Database error: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    
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


@app.get("/chats")
def list_chats():
    results = []
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("SELECT id, title, role, content, createdAt, source FROM chats ORDER BY createdAt DESC LIMIT 100")
        for row in cursor:
            cid, title, role, content, createdAt, source = row
            results.append({
                "id": cid,
                "title": title,
                "role": role,
                "content": content,
                "createdAt": createdAt,
                "source": source
            })
    return results


